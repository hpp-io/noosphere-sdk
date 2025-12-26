/**
 * SchedulerService
 *
 * Manages periodic commitment generation for active subscriptions.
 * Equivalent to Java's CommitmentGenerationService with cron scheduling.
 */

import { EventEmitter } from 'events';
import { Contract, Provider } from 'ethers';
import { SubscriptionBatchReaderContract, type ComputeSubscription } from '@noosphere/contracts';

export interface SubscriptionState {
  subscriptionId: bigint;
  routeId: string;
  containerId: string;
  client: string;
  wallet: string;
  activeAt: bigint;
  intervalSeconds: bigint;
  maxExecutions: bigint;
  redundancy: number;
  verifier?: string;
  currentInterval: bigint;
  lastProcessedAt: number;
  pendingTx?: string;
  txAttempts: number;
}

export interface SchedulerConfig {
  cronIntervalMs: number; // Default: 60000 (1 minute)
  maxRetryAttempts: number; // Default: 3
  syncPeriodMs: number; // Default: 3000 (3 seconds)
}

export class SchedulerService extends EventEmitter {
  private subscriptions = new Map<string, SubscriptionState>();
  private committedIntervals = new Set<string>(); // subscriptionId:interval
  private pendingTxs = new Map<string, string>(); // key -> txHash
  private intervalTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private config: SchedulerConfig;
  private batchReader?: SubscriptionBatchReaderContract;
  private lastSyncedId: bigint = 0n;

  constructor(
    private provider: Provider,
    private coordinator: Contract,
    private agentWallet: string,
    batchReaderAddress?: string,
    config?: Partial<SchedulerConfig>
  ) {
    super();
    this.config = {
      cronIntervalMs: config?.cronIntervalMs ?? 60000, // 1 minute
      maxRetryAttempts: config?.maxRetryAttempts ?? 3,
      syncPeriodMs: config?.syncPeriodMs ?? 3000, // 3 seconds
    };

    // Initialize SubscriptionBatchReader if address provided
    if (batchReaderAddress) {
      this.batchReader = new SubscriptionBatchReaderContract(
        batchReaderAddress,
        provider
      );
      console.log(`✓ SubscriptionBatchReader configured: ${batchReaderAddress}`);
    } else {
      console.warn('⚠️  SubscriptionBatchReader not configured - subscription sync disabled');
    }
  }

  /**
   * Start the scheduler service
   */
  start(): void {
    console.log('🕐 Starting Scheduler Service...');
    console.log(`  Commitment generation interval: ${this.config.cronIntervalMs}ms`);
    console.log(`  Sync period: ${this.config.syncPeriodMs}ms`);

    // Start commitment generation timer (like Spring @Scheduled cron)
    this.intervalTimer = setInterval(
      () => this.generateCommitments(),
      this.config.cronIntervalMs
    );

    // Start periodic sync timer
    this.syncTimer = setInterval(
      () => this.syncSubscriptions(),
      this.config.syncPeriodMs
    );

    console.log('✓ Scheduler Service started');
  }

  /**
   * Stop the scheduler service
   */
  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    console.log('✓ Scheduler Service stopped');
  }

  /**
   * Track a new subscription
   */
  trackSubscription(subscription: Omit<SubscriptionState, 'currentInterval' | 'lastProcessedAt' | 'txAttempts'>): void {
    const key = subscription.subscriptionId.toString();

    if (this.subscriptions.has(key)) {
      console.log(`  Subscription ${key} already tracked, updating...`);
    }

    this.subscriptions.set(key, {
      ...subscription,
      currentInterval: 0n,
      lastProcessedAt: Date.now(),
      txAttempts: 0,
    });

    console.log(`✓ Tracking subscription ${key}`);
    this.emit('subscription:tracked', subscription.subscriptionId);
  }

  /**
   * Remove a subscription from tracking
   */
  untrackSubscription(subscriptionId: bigint): void {
    const key = subscriptionId.toString();
    if (this.subscriptions.delete(key)) {
      console.log(`✓ Stopped tracking subscription ${key}`);
      this.emit('subscription:untracked', subscriptionId);
    }
  }

  /**
   * Main commitment generation loop (runs every cronIntervalMs)
   * Equivalent to Java's CommitmentGenerationService.generateCommitment()
   */
  private async generateCommitments(): Promise<void> {
    try {
      console.log('\n🔄 Starting commitment generation task...');

      // 1. Prune failed transactions
      this.pruneFailedTxs();

      // 2. Process active subscriptions
      await this.processActiveSubscriptions();

      console.log('✓ Finished commitment generation task.\n');
    } catch (error) {
      console.error('❌ Error in commitment generation:', error);
      this.emit('error', error);
    }
  }

  /**
   * Process all active subscriptions
   */
  private async processActiveSubscriptions(): Promise<void> {
    const now = Date.now();
    const currentBlockTime = Math.floor(now / 1000);

    for (const [subId, sub] of this.subscriptions.entries()) {
      try {
        // Check if subscription should process
        if (!this.shouldProcess(sub, currentBlockTime)) {
          continue;
        }

        // Calculate which interval we should be at
        const intervalsSinceActive = BigInt(currentBlockTime) - sub.activeAt;
        const currentInterval = intervalsSinceActive / sub.intervalSeconds;

        // Check if we've already committed this interval
        const commitmentKey = `${subId}:${currentInterval}`;
        if (this.committedIntervals.has(commitmentKey)) {
          continue;
        }

        // Check if there's already a commitment on-chain
        const hasCommitment = await this.hasRequestCommitments(
          sub.subscriptionId,
          currentInterval
        );

        if (hasCommitment) {
          this.committedIntervals.add(commitmentKey);
          console.log(`  Subscription ${subId} interval ${currentInterval} already committed`);
          continue;
        }

        // Generate commitment (prepare next interval)
        await this.prepareNextInterval(sub, currentInterval);

      } catch (error) {
        console.error(`  Error processing subscription ${subId}:`, error);

        // If execution reverted, likely subscription was cancelled
        if ((error as Error).message.includes('execution reverted')) {
          console.log(`  Subscription ${subId} appears to be cancelled, untracking...`);
          this.untrackSubscription(sub.subscriptionId);
        }
      }
    }
  }

  /**
   * Check if subscription should be processed
   */
  private shouldProcess(sub: SubscriptionState, currentBlockTime: number): boolean {
    // Not active yet
    if (BigInt(currentBlockTime) < sub.activeAt) {
      return false;
    }

    // Has pending transaction
    const runKey = `${sub.subscriptionId}:${sub.currentInterval}`;
    if (this.pendingTxs.has(runKey)) {
      return false;
    }

    // Exceeded max retry attempts
    if (sub.txAttempts >= this.config.maxRetryAttempts) {
      return false;
    }

    // Check if max executions reached
    if (sub.maxExecutions > 0n) {
      const intervalsSinceActive = BigInt(currentBlockTime) - sub.activeAt;
      const currentInterval = intervalsSinceActive / sub.intervalSeconds;
      if (currentInterval >= sub.maxExecutions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if interval already has commitments on-chain
   */
  private async hasRequestCommitments(
    subscriptionId: bigint,
    interval: bigint
  ): Promise<boolean> {
    try {
      const redundancy = await this.coordinator.redundancyCount(
        this.getRequestId(subscriptionId, interval)
      );
      return redundancy > 0;
    } catch (error) {
      console.error('Error checking commitments:', error);
      return false;
    }
  }

  /**
   * Prepare next interval by calling coordinator contract
   * Equivalent to Java's CoordinatorService.prepareNextInterval()
   */
  private async prepareNextInterval(
    sub: SubscriptionState,
    interval: bigint
  ): Promise<void> {
    const runKey = `${sub.subscriptionId}:${interval}`;

    try {
      console.log(`  Preparing interval ${interval} for subscription ${sub.subscriptionId}...`);

      // Send actual transaction to coordinator contract
      const tx = await this.coordinator.prepareNextInterval(
        sub.subscriptionId,
        interval,
        this.agentWallet
      );

      // Track pending transaction
      this.pendingTxs.set(runKey, tx.hash);
      sub.pendingTx = tx.hash;

      console.log(`  📤 Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`  ✓ Interval ${interval} prepared successfully (block ${receipt.blockNumber})`);

        // Mark as committed
        const commitmentKey = `${sub.subscriptionId}:${interval}`;
        this.committedIntervals.add(commitmentKey);

        // Update subscription state
        sub.currentInterval = interval;
        sub.lastProcessedAt = Date.now();
        sub.txAttempts = 0;
        sub.pendingTx = undefined;
        this.pendingTxs.delete(runKey);

        this.emit('commitment:success', {
          subscriptionId: sub.subscriptionId,
          interval,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
        });
      } else {
        throw new Error(`Transaction failed with status ${receipt.status}`);
      }

    } catch (error) {
      console.error(`  Failed to prepare interval for ${runKey}:`, error);

      // Clean up pending state
      sub.pendingTx = undefined;
      this.pendingTxs.delete(runKey);

      // Increment retry attempts
      sub.txAttempts++;

      if (sub.txAttempts >= this.config.maxRetryAttempts) {
        console.log(`  Max retry attempts reached for ${runKey}`);
        this.emit('commitment:failed', {
          subscriptionId: sub.subscriptionId,
          interval,
          error,
        });
      }
    }
  }

  /**
   * Prune transactions that have failed
   */
  private pruneFailedTxs(): void {
    // Remove old pending transactions (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    for (const [subId, sub] of this.subscriptions.entries()) {
      if (sub.lastProcessedAt < fiveMinutesAgo && sub.pendingTx) {
        console.log(`  Pruning stale transaction for subscription ${subId}`);
        sub.pendingTx = undefined;
        sub.txAttempts = 0;
      }
    }
  }

  /**
   * Sync subscriptions (placeholder for blockchain event listening)
   */
  /**
   * Sync subscriptions from blockchain
   * Reads subscriptions in batches and tracks active ones
   */
  private async syncSubscriptions(): Promise<void> {
    if (!this.batchReader) {
      // BatchReader not configured, skip sync
      this.emit('sync:tick');
      return;
    }

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const block = await this.provider.getBlock(currentBlock);
      const blockTime = block?.timestamp || Math.floor(Date.now() / 1000);

      // Read subscriptions in batches
      const BATCH_SIZE = 100n;
      const startId = this.lastSyncedId + 1n;
      const endId = startId + BATCH_SIZE - 1n;

      const subscriptions = await this.batchReader.getSubscriptions(
        startId,
        endId,
        currentBlock
      );

      if (subscriptions.length === 0) {
        // No new subscriptions
        this.emit('sync:tick');
        return;
      }

      // Track active subscriptions
      let newSubscriptions = 0;
      for (const sub of subscriptions) {
        if (this.isSubscriptionActive(sub, blockTime)) {
          this.trackSubscriptionFromConfig(sub);
          newSubscriptions++;
        }
      }

      // Update last synced ID
      this.lastSyncedId = endId;

      if (newSubscriptions > 0) {
        console.log(`✓ Synced ${newSubscriptions} active subscriptions (ID ${startId} - ${endId})`);
      }

      this.emit('sync:completed', {
        subscriptions: this.subscriptions.size,
        newSubscriptions,
      });
    } catch (error) {
      console.error('Error syncing subscriptions:', error);
      this.emit('sync:error', error);
    }
  }

  /**
   * Check if subscription is currently active
   */
  private isSubscriptionActive(
    sub: ComputeSubscription,
    currentBlockTime: number
  ): boolean {
    // Not started yet
    if (currentBlockTime < sub.activeAt) {
      return false;
    }

    // Check if max executions reached
    if (sub.maxExecutions > 0) {
      const elapsed = currentBlockTime - sub.activeAt;
      const currentInterval = Math.floor(elapsed / sub.intervalSeconds);
      if (currentInterval >= sub.maxExecutions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Track subscription from ComputeSubscription config
   */
  private trackSubscriptionFromConfig(sub: ComputeSubscription): void {
    const key = sub.containerId.toString(); // Using containerId as key for now

    if (this.subscriptions.has(key)) {
      // Already tracked
      return;
    }

    // Calculate current interval
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - sub.activeAt;
    const currentInterval = sub.intervalSeconds > 0
      ? Math.max(0, Math.floor(elapsed / sub.intervalSeconds))
      : 0;

    this.subscriptions.set(key, {
      subscriptionId: BigInt(sub.containerId), // Temporary - need actual subscription ID
      routeId: sub.routeId,
      containerId: sub.containerId,
      client: sub.client,
      wallet: sub.wallet,
      activeAt: BigInt(sub.activeAt),
      intervalSeconds: BigInt(sub.intervalSeconds),
      maxExecutions: Number.isFinite(sub.maxExecutions) ? BigInt(sub.maxExecutions) : 0n,
      redundancy: sub.redundancy,
      verifier: sub.verifier || undefined,
      currentInterval: BigInt(currentInterval),
      lastProcessedAt: Date.now(),
      txAttempts: 0,
    });
  }

  /**
   * Get request ID (hash of subscription ID and interval)
   */
  private getRequestId(subscriptionId: bigint, interval: bigint): string {
    // This should match the on-chain calculation
    const { keccak256, defaultAbiCoder } = require('ethers');
    return keccak256(
      defaultAbiCoder.encode(
        ['uint256', 'uint256'],
        [subscriptionId, interval]
      )
    );
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalSubscriptions: number;
    activeSubscriptions: number;
    committedIntervals: number;
    pendingTransactions: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const activeCount = Array.from(this.subscriptions.values()).filter(sub =>
      BigInt(now) >= sub.activeAt
    ).length;

    return {
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: activeCount,
      committedIntervals: this.committedIntervals.size,
      pendingTransactions: this.pendingTxs.size,
    };
  }

  /**
   * Get all tracked subscriptions
   */
  getSubscriptions(): SubscriptionState[] {
    return Array.from(this.subscriptions.values());
  }
}
