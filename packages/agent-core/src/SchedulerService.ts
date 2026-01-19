/**
 * SchedulerService
 *
 * Manages periodic commitment generation for active subscriptions.
 * Equivalent to Java's CommitmentGenerationService with cron scheduling.
 */

import { EventEmitter } from 'events';
import { Contract, Provider, TransactionReceipt } from 'ethers';
import { SubscriptionBatchReaderContract, type ComputeSubscription } from '@noosphere/contracts';
import type { RequestStartedEvent } from './types';

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
  // Persistence callbacks for committed intervals
  loadCommittedIntervals?: () => string[]; // Load from DB on startup
  saveCommittedInterval?: (key: string) => void; // Save to DB when committed
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
  private maxSubscriptionId?: bigint;
  private getContainer?: (containerId: string) => any;

  constructor(
    private provider: Provider,
    private router: Contract,
    private coordinator: Contract,
    private agentWallet: string,
    batchReaderAddress?: string,
    config?: Partial<SchedulerConfig>,
    getContainer?: (containerId: string) => any
  ) {
    super();
    this.config = {
      cronIntervalMs: config?.cronIntervalMs ?? 60000, // 1 minute
      maxRetryAttempts: config?.maxRetryAttempts ?? 3,
      syncPeriodMs: config?.syncPeriodMs ?? 3000, // 3 seconds
      loadCommittedIntervals: config?.loadCommittedIntervals,
      saveCommittedInterval: config?.saveCommittedInterval,
    };
    this.getContainer = getContainer;

    // Initialize SubscriptionBatchReader if address provided
    if (batchReaderAddress) {
      this.batchReader = new SubscriptionBatchReaderContract(batchReaderAddress, provider);
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

    // Load committed intervals from persistent storage
    if (this.config.loadCommittedIntervals) {
      const loaded = this.config.loadCommittedIntervals();
      for (const key of loaded) {
        this.committedIntervals.add(key);
      }
      if (loaded.length > 0) {
        console.log(`  Loaded ${loaded.length} committed intervals from storage`);
      }
    }

    // Start commitment generation timer (like Spring @Scheduled cron)
    this.intervalTimer = setInterval(() => this.generateCommitments(), this.config.cronIntervalMs);

    // Start periodic sync timer
    this.syncTimer = setInterval(() => this.syncSubscriptions(), this.config.syncPeriodMs);

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
  trackSubscription(
    subscription: Omit<SubscriptionState, 'currentInterval' | 'lastProcessedAt' | 'txAttempts'>
  ): void {
    const key = subscription.subscriptionId.toString();

    if (this.subscriptions.has(key)) {
      console.log(`  Subscription ${key} already tracked, updating...`);
    }

    // Calculate current interval based on elapsed time
    // Note: Contract uses 1-based indexing: ((timestamp - activeAt) / intervalSeconds) + 1
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - Number(subscription.activeAt);
    const currentInterval =
      subscription.intervalSeconds > 0n
        ? BigInt(Math.max(1, Math.floor(elapsed / Number(subscription.intervalSeconds)) + 1))
        : 1n;

    this.subscriptions.set(key, {
      ...subscription,
      currentInterval,
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
      // Clean up committedIntervals for this subscription to prevent memory leak
      const prefix = `${key}:`;
      let cleanedCount = 0;
      for (const commitmentKey of this.committedIntervals) {
        if (commitmentKey.startsWith(prefix)) {
          this.committedIntervals.delete(commitmentKey);
          cleanedCount++;
        }
      }
      if (cleanedCount > 0) {
        console.log(`  🧹 Cleaned up ${cleanedCount} committed intervals for subscription ${key}`);
      }
      console.log(`✓ Stopped tracking subscription ${key}`);
      this.emit('subscription:untracked', subscriptionId);
    }
  }

  /**
   * Mark an interval as committed (for RequestStarted events)
   * Also persists to storage if callback is configured
   */
  markIntervalCommitted(subscriptionId: bigint, interval: bigint): void {
    const commitmentKey = `${subscriptionId}:${interval}`;
    this.addCommittedInterval(commitmentKey);
    console.log(`  ✓ Marked interval ${interval} as committed for subscription ${subscriptionId}`);
  }

  /**
   * Add to committed intervals set and persist to storage
   */
  private addCommittedInterval(key: string): void {
    if (!this.committedIntervals.has(key)) {
      this.committedIntervals.add(key);
      if (this.config.saveCommittedInterval) {
        this.config.saveCommittedInterval(key);
      }
    }
  }

  /**
   * Main commitment generation loop (runs every cronIntervalMs)
   * Equivalent to Java's CommitmentGenerationService.generateCommitment()
   */
  private async generateCommitments(): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      console.log(`\n🔄 [${timestamp}] Starting commitment generation task...`);

      // 1. Prune failed transactions
      this.pruneFailedTxs();

      // 2. Process active subscriptions
      await this.processActiveSubscriptions();

      const endTimestamp = new Date().toISOString();
      console.log(`✓ [${endTimestamp}] Finished commitment generation task.\n`);
    } catch (error) {
      console.error('❌ Error in commitment generation:', error);
      this.emit('error', error);
    }
  }

  /**
   * Process all active subscriptions
   */
  private async processActiveSubscriptions(): Promise<void> {
    // Get blockchain timestamp instead of local system time
    const latestBlock = await this.provider.getBlock('latest');
    if (!latestBlock) {
      console.warn('  Could not fetch latest block, skipping this cycle');
      return;
    }
    const currentBlockTime = latestBlock.timestamp;

    if (this.subscriptions.size === 0) {
      console.log('  No subscriptions to process');
      return;
    }

    console.log(`  Processing ${this.subscriptions.size} subscription(s)...`);

    for (const [subId, sub] of this.subscriptions.entries()) {
      let currentInterval: bigint = 0n;
      try {
        // Validate intervalSeconds to prevent division by zero
        if (sub.intervalSeconds <= 0n) {
          console.warn(
            `  Skipping subscription ${subId}: invalid intervalSeconds (${sub.intervalSeconds})`
          );
          this.untrackSubscription(sub.subscriptionId);
          continue;
        }

        // Get current interval from blockchain (Router contract)
        // This ensures we prepare intervals in the correct sequence
        try {
          currentInterval = BigInt(
            await this.router.getComputeSubscriptionInterval(sub.subscriptionId)
          );
        } catch (error) {
          const errorMessage = (error as Error).message || '';
          console.warn(
            `  Could not get interval from router for subscription ${subId}:`,
            errorMessage
          );

          // If subscription not found, it was cancelled - untrack and skip
          if (errorMessage.includes('SubscriptionNotFound')) {
            console.log(`  Subscription ${subId} not found (cancelled), untracking...`);
            this.untrackSubscription(sub.subscriptionId);
            continue;
          }

          // Fall back to local calculation only for transient errors
          const intervalsSinceActive = BigInt(currentBlockTime) - sub.activeAt;
          currentInterval = intervalsSinceActive / sub.intervalSeconds + 1n;
        }

        console.log(
          `  Subscription ${subId}: currentInterval=${currentInterval}, maxExecutions=${sub.maxExecutions}, activeAt=${sub.activeAt}`
        );

        // Check if subscription should process
        if (!this.shouldProcess(sub, currentBlockTime)) {
          continue;
        }

        // Check if we've already committed this interval
        const commitmentKey = `${subId}:${currentInterval}`;
        if (this.committedIntervals.has(commitmentKey)) {
          continue;
        }

        // Check if there's already a commitment on-chain
        const hasCommitment = await this.hasRequestCommitments(sub.subscriptionId, currentInterval);

        if (hasCommitment) {
          this.addCommittedInterval(commitmentKey);
          console.log(`  Subscription ${subId} interval ${currentInterval} already committed`);
          continue;
        }

        // Generate commitment (prepare next interval)
        await this.prepareNextInterval(sub, currentInterval);
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(`  Error processing subscription ${subId}:`, error);

        // Check if error is in exception chain (like Java's containsErrorInChain)
        const containsError = (ex: Error, text: string): boolean => {
          let current: Error | undefined = ex;
          while (current) {
            if (current.message?.includes(text)) return true;
            current = (current as any).cause;
          }
          return false;
        };

        // If overflow/underflow error, interval likely already executed
        if (
          containsError(error as Error, 'Panic due to OVERFLOW') ||
          containsError(error as Error, 'arithmetic underflow or overflow')
        ) {
          console.log(
            `  Interval ${currentInterval} for subscription ${subId} appears to be already executed (overflow), marking as committed`
          );
          const commitmentKey = `${subId}:${currentInterval}`;
          this.addCommittedInterval(commitmentKey);
          sub.currentInterval = currentInterval + 1n;
        }
        // NoNextInterval error (0x3cdc51d3) - client hasn't triggered interval 1 yet
        // For scheduled subscriptions, interval 1 is triggered by the client, not the scheduler
        // Keep the subscription tracked and wait for the client to trigger interval 1
        else if (
          containsError(error as Error, '0x3cdc51d3') ||
          containsError(error as Error, 'NoNextInterval')
        ) {
          console.log(
            `  Subscription ${subId}: waiting for client to trigger interval 1 (NoNextInterval)`
          );
          // Don't untrack - just wait for the client to trigger interval 1
          // Once interval 1 is executed, we can prepare interval 2
        }
        // If execution reverted or simulation failed, likely subscription was cancelled
        else if (
          containsError(error as Error, 'execution reverted') ||
          containsError(error as Error, 'Transaction simulation failed')
        ) {
          console.log(`  Subscription ${subId} appears to be cancelled or invalid, untracking...`);
          this.untrackSubscription(sub.subscriptionId);
        }
      }
    }
  }

  /**
   * Check if subscription should be processed
   */
  private shouldProcess(sub: SubscriptionState, currentBlockTime: number): boolean {
    const subId = sub.subscriptionId.toString();

    // Not active yet
    if (BigInt(currentBlockTime) < sub.activeAt) {
      console.log(
        `    Skip: not active yet (currentTime=${currentBlockTime}, activeAt=${sub.activeAt})`
      );
      return false;
    }

    // Calculate current interval
    const intervalsSinceActive = BigInt(currentBlockTime) - sub.activeAt;
    const currentInterval = intervalsSinceActive / sub.intervalSeconds + 1n;

    // Note: We don't skip interval 1 unconditionally anymore.
    // If triggerFirstExecution was called, hasRequestCommitments will catch it.
    // If agent crashed before triggerFirstExecution completed, we need to prepare it.

    // Untrack if subscription is completed (past last interval)
    if (sub.maxExecutions > 0n && currentInterval > sub.maxExecutions) {
      console.log(
        `    Subscription ${subId} completed (interval ${currentInterval} > maxExecutions ${sub.maxExecutions}), untracking...`
      );
      this.untrackSubscription(sub.subscriptionId);
      return false;
    }

    // Has pending transaction
    const runKey = `${sub.subscriptionId}:${currentInterval}`;
    if (this.pendingTxs.has(runKey)) {
      console.log(`    Skip: pending transaction for interval ${currentInterval}`);
      return false;
    }

    // Exceeded max retry attempts
    if (sub.txAttempts >= this.config.maxRetryAttempts) {
      console.log(
        `    Skip: max retry attempts reached (${sub.txAttempts}/${this.config.maxRetryAttempts})`
      );
      return false;
    }

    return true;
  }

  /**
   * Check if interval already has commitments on-chain
   */
  private async hasRequestCommitments(subscriptionId: bigint, interval: bigint): Promise<boolean> {
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
  private async prepareNextInterval(sub: SubscriptionState, interval: bigint): Promise<void> {
    const runKey = `${sub.subscriptionId}:${interval}`;

    try {
      console.log(`  Preparing interval ${interval} for subscription ${sub.subscriptionId}...`);

      // Re-verify interval is still current before sending transaction
      // This prevents NotReadyForNextInterval errors due to timing race conditions
      const currentIntervalNow = BigInt(
        await this.router.getComputeSubscriptionInterval(sub.subscriptionId)
      );

      if (currentIntervalNow !== interval && currentIntervalNow !== interval - 1n) {
        console.log(
          `  ⚠️  Interval changed: expected ${interval}, blockchain is at ${currentIntervalNow}. Skipping.`
        );
        return;
      }

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
        console.log(
          `  ✓ Interval ${interval} prepared successfully (block ${receipt.blockNumber})`
        );

        // Mark as committed
        const commitmentKey = `${sub.subscriptionId}:${interval}`;
        this.addCommittedInterval(commitmentKey);

        // Update subscription state
        sub.currentInterval = interval;
        sub.lastProcessedAt = Date.now();
        sub.txAttempts = 0;
        sub.pendingTx = undefined;
        this.pendingTxs.delete(runKey);

        // Parse RequestStarted event from receipt logs
        // This ensures compute is triggered even if WebSocket misses the event
        const requestStartedEvent = this.parseRequestStartedFromReceipt(receipt, sub);

        // Calculate gas cost
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice ?? tx.gasPrice ?? 0n;
        const gasCost = gasUsed * gasPrice;

        this.emit('commitment:success', {
          subscriptionId: sub.subscriptionId,
          interval,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: gasUsed.toString(),
          gasPrice: gasPrice.toString(),
          gasCost: gasCost.toString(),
          requestStartedEvent, // Include parsed event for immediate processing
        });
      } else {
        throw new Error(`Transaction failed with status ${receipt.status}`);
      }
    } catch (error) {
      console.error(`  Failed to prepare interval for ${runKey}:`, error);

      // Clean up pending state
      sub.pendingTx = undefined;
      this.pendingTxs.delete(runKey);

      // Check if this is a NoNextInterval error (client hasn't triggered interval 1 yet)
      const errorMessage = (error as Error).message || '';
      const isNoNextIntervalError =
        errorMessage.includes('0x3cdc51d3') || errorMessage.includes('NoNextInterval');

      if (isNoNextIntervalError) {
        // Don't increment retry attempts for NoNextInterval
        // This is expected for scheduled subscriptions where interval 1 is client-triggered
        console.log(
          `  Subscription ${sub.subscriptionId}: NoNextInterval - waiting for client to trigger interval 1`
        );
        sub.txAttempts = 0; // Reset retry counter
        return;
      }

      // Increment retry attempts for other errors
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
      // Query max subscription ID from router
      if (this.maxSubscriptionId === undefined) {
        this.maxSubscriptionId = await this.router.getLastSubscriptionId();
        console.log(`📊 Total subscriptions in registry: ${this.maxSubscriptionId}`);
      }

      // Stop syncing if we've reached the end, but re-check for new subscriptions
      if (this.lastSyncedId >= this.maxSubscriptionId!) {
        // Re-check maxSubscriptionId to detect new subscriptions
        const latestMaxId = await this.router.getLastSubscriptionId();
        if (latestMaxId > this.maxSubscriptionId!) {
          console.log(`📊 Found new subscriptions: ${latestMaxId} (was ${this.maxSubscriptionId})`);
          this.maxSubscriptionId = latestMaxId;
          // Continue syncing with updated maxSubscriptionId
        } else {
          this.emit('sync:tick');
          return;
        }
      }

      const maxSubId = this.maxSubscriptionId!; // Use latest maxSubscriptionId

      const currentBlock = await this.provider.getBlockNumber();
      const block = await this.provider.getBlock(currentBlock);
      const blockTime = block?.timestamp || Math.floor(Date.now() / 1000);

      // Read subscriptions in batches
      const BATCH_SIZE = 100n;
      const startId = this.lastSyncedId + 1n;
      const endId = startId + BATCH_SIZE - 1n > maxSubId ? maxSubId : startId + BATCH_SIZE - 1n;

      const subscriptions = await this.batchReader.getSubscriptions(startId, endId, currentBlock);

      if (subscriptions.length === 0) {
        // No new subscriptions
        this.emit('sync:tick');
        return;
      }

      // Track active subscriptions (only containers this agent can run)
      let newSubscriptions = 0;
      let skippedContainers = 0;
      let skippedInactive = 0;
      let skippedEmpty = 0;
      let skippedOnDemand = 0;

      console.log(`  Syncing ${subscriptions.length} subscriptions (blockTime: ${blockTime})`);

      for (let i = 0; i < subscriptions.length; i++) {
        const sub = subscriptions[i];
        const subscriptionId = startId + BigInt(i);

        // Skip cancelled/deleted subscriptions (containerId = 0x0000...0)
        if (
          sub.containerId === '0x0000000000000000000000000000000000000000000000000000000000000000'
        ) {
          skippedEmpty++;
          continue;
        }

        // Skip if not active
        if (!this.isSubscriptionActive(sub, blockTime)) {
          // Debug log for non-empty subscriptions that are inactive
          if (sub.intervalSeconds > 0) {
            console.log(
              `  Sub ${subscriptionId}: inactive (activeAt=${sub.activeAt}, now=${blockTime})`
            );
          }
          skippedInactive++;
          continue;
        }

        // Skip if agent cannot run this container (silently filter)
        if (this.getContainer && !this.getContainer(sub.containerId)) {
          skippedContainers++;
          continue;
        }

        // Track subscription (returns true if actually tracked)
        if (this.trackSubscriptionFromConfig(sub, subscriptionId)) {
          newSubscriptions++;
        } else {
          // Track on-demand subscriptions that were skipped
          if (sub.intervalSeconds <= 0) {
            skippedOnDemand++;
          }
        }
      }

      console.log(
        `  Sync stats: ${newSubscriptions} tracked, ${skippedEmpty} empty, ${skippedInactive} inactive, ${skippedContainers} unsupported containers, ${skippedOnDemand} on-demand`
      );

      // Update last synced ID
      this.lastSyncedId = endId;

      // Log results only if there are new subscriptions
      if (newSubscriptions > 0) {
        console.log(`✓ Synced ${newSubscriptions} active subscriptions (ID ${startId} - ${endId})`);
      }

      // Log completion if we've reached the end
      if (this.lastSyncedId >= maxSubId) {
        console.log(`✓ Sync completed - processed all ${maxSubId} subscriptions`);
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
  private isSubscriptionActive(sub: ComputeSubscription, currentBlockTime: number): boolean {
    // Not started yet
    if (currentBlockTime < sub.activeAt) {
      return false;
    }

    // Check if max executions reached
    // Note: currentInterval is 0-based here ((elapsed / intervalSeconds) gives 0 for first interval)
    // But maxExecutions is count, so we need > not >= (if currentInterval is 4 and max is 5, still active)
    if (sub.maxExecutions > 0 && sub.intervalSeconds > 0) {
      const elapsed = currentBlockTime - sub.activeAt;
      const currentInterval = Math.floor(elapsed / sub.intervalSeconds);
      // If currentInterval >= maxExecutions, all intervals have passed
      // e.g., maxExecutions=5, intervalSeconds=180, after 900s currentInterval=5 -> all done
      if (currentInterval >= sub.maxExecutions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Track subscription from ComputeSubscription config
   * Returns true if subscription was tracked, false if skipped
   */
  private trackSubscriptionFromConfig(sub: ComputeSubscription, subscriptionId: bigint): boolean {
    // Skip empty/deleted subscriptions (all fields are 0)
    if (sub.containerId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      // This is an empty slot (never created or deleted)
      return false;
    }

    // Skip if client address is zero (another indicator of empty subscription)
    if (sub.client === '0x0000000000000000000000000000000000000000') {
      return false;
    }

    const key = subscriptionId.toString();

    if (this.subscriptions.has(key)) {
      // Already tracked
      return false;
    }

    // Validate subscription data - intervalSeconds=0 means on-demand (not scheduled)
    if (sub.intervalSeconds <= 0) {
      // Silently skip on-demand subscriptions (not an error)
      return false;
    }

    // Log subscription details
    try {
      const { ethers } = require('ethers');
      const containerIdStr = ethers.decodeBytes32String(sub.containerId);
      console.log(`  ✓ Tracking subscription: ${containerIdStr}`);
      console.log(`    Client: ${sub.client}`);
      console.log(`    Interval: ${sub.intervalSeconds}s`);
      console.log(`    Max Executions: ${sub.maxExecutions}`);
    } catch (e) {
      console.log(`  ✓ Tracking subscription: ${sub.containerId}`);
    }

    // Calculate current interval
    // Note: Contract uses 1-based indexing: ((timestamp - activeAt) / intervalSeconds) + 1
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - sub.activeAt;
    const currentInterval =
      sub.intervalSeconds > 0 ? Math.max(1, Math.floor(elapsed / sub.intervalSeconds) + 1) : 1;

    this.subscriptions.set(key, {
      subscriptionId: subscriptionId,
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

    return true;
  }

  /**
   * Get request ID (hash of subscription ID and interval)
   */
  private getRequestId(subscriptionId: bigint, interval: bigint): string {
    // This should match the on-chain calculation
    const ethers = require('ethers');
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(abiCoder.encode(['uint256', 'uint256'], [subscriptionId, interval]));
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
    const activeCount = Array.from(this.subscriptions.values()).filter((sub) => {
      // Must have started
      if (BigInt(now) < sub.activeAt) {
        return false;
      }

      // Check if completed (all maxExecutions done)
      if (sub.maxExecutions > 0n) {
        const elapsed = BigInt(now) - sub.activeAt;
        const currentInterval = elapsed / sub.intervalSeconds;

        // Subscription is completed if we've passed all intervals
        if (currentInterval >= sub.maxExecutions) {
          return false;
        }
      }

      return true;
    }).length;

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

  /**
   * Parse RequestStarted event from transaction receipt
   * This allows the agent to process the event immediately without waiting for WebSocket
   */
  private parseRequestStartedFromReceipt(
    receipt: TransactionReceipt,
    sub: SubscriptionState
  ): RequestStartedEvent | null {
    try {
      // Find the RequestStarted log in the receipt
      for (const log of receipt.logs) {
        try {
          const parsed = this.coordinator.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });

          if (parsed && parsed.name === 'RequestStarted') {
            const commitment = parsed.args.commitment;
            return {
              requestId: parsed.args.requestId,
              subscriptionId: parsed.args.subscriptionId,
              containerId: parsed.args.containerId,
              interval: Number(commitment.interval),
              redundancy: Number(commitment.redundancy),
              useDeliveryInbox: commitment.useDeliveryInbox,
              feeAmount: commitment.feeAmount,
              feeToken: commitment.feeToken,
              verifier: commitment.verifier,
              coordinator: commitment.coordinator,
              walletAddress: commitment.walletAddress,
              blockNumber: receipt.blockNumber,
            };
          }
        } catch {
          // Not a RequestStarted log, continue
        }
      }
    } catch (error) {
      console.warn('  ⚠️  Could not parse RequestStarted event from receipt:', error);
    }
    return null;
  }
}
