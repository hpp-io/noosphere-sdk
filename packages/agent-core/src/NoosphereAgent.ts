import { ethers } from 'ethers';
import { EventMonitor } from './EventMonitor';
import { ContainerManager } from './ContainerManager';
import { SchedulerService, SchedulerConfig } from './SchedulerService';
import { WalletManager, KeystoreManager } from '@noosphere/crypto';
import { RegistryManager } from '@noosphere/registry';
import { ABIs } from '@noosphere/contracts';
import { CommitmentUtils, PayloadUtils } from './utils/CommitmentUtils';
import { PayloadResolver } from './PayloadResolver';
import { ConfigLoader } from './utils/ConfigLoader';
import type {
  AgentConfig,
  RequestStartedEvent,
  ContainerMetadata,
  Commitment,
  NoosphereAgentConfig,
  PayloadData,
} from './types';

export interface ComputeDeliveredEvent {
  requestId: string;
  subscriptionId: number;
  interval: number;
  containerId: string;
  redundancy: number;
  feeAmount: string;
  feeToken: string;
  input: string | PayloadData;
  output: string | PayloadData;
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
  gasPrice: bigint;
}

export interface RequestStartedCallbackEvent {
  requestId: string;
  subscriptionId: number;
  interval: number;
  containerId: string;
  redundancy: number;
  feeAmount: string;
  feeToken: string;
  verifier: string;
  walletAddress: string;
  blockNumber: number;
}

/**
 * Event data for commitment success (scheduler prepareNextInterval)
 */
export interface CommitmentSuccessCallbackEvent {
  subscriptionId: bigint;
  interval: bigint;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  gasPrice: string;
  gasCost: string;
}

export interface CheckpointData {
  blockNumber: number;
  blockHash?: string;
  blockTimestamp?: number;
}

export interface RetryableEvent {
  requestId: string;
  subscriptionId: number;
  interval: number;
  containerId: string;
  retryCount: number;
}

export interface ContainerExecutionConfig {
  timeout?: number; // Container execution timeout in ms (default: 300000 = 5 min)
  connectionRetries?: number; // Number of connection retry attempts (default: 5)
  connectionRetryDelayMs?: number; // Delay between retries in ms (default: 3000)
}

export interface NoosphereAgentOptions {
  config: AgentConfig;
  routerAbi?: any[];  // Optional - defaults to ABIs.Router from @noosphere/contracts
  coordinatorAbi?: any[];  // Optional - defaults to ABIs.Coordinator from @noosphere/contracts
  getContainer?: (containerId: string) => ContainerMetadata | undefined;
  containers?: Map<string, ContainerMetadata>; // Container map from config
  registryManager?: RegistryManager; // Optional - provide pre-initialized RegistryManager to avoid duplicate loading
  walletManager?: WalletManager; // Optional - provide pre-initialized WalletManager
  paymentWallet?: string; // Optional - WalletFactory wallet address for the agent
  schedulerConfig?: Partial<SchedulerConfig>; // Optional - scheduler configuration from config.json
  containerConfig?: ContainerExecutionConfig; // Optional - container execution configuration
  onRequestStarted?: (event: RequestStartedCallbackEvent) => void; // Callback when request is received
  onRequestProcessing?: (requestId: string) => void; // Callback when request processing starts
  onRequestSkipped?: (requestId: string, reason: string) => void; // Callback when request is skipped
  onRequestFailed?: (requestId: string, error: string, txHash?: string) => void; // Callback when request fails (txHash included if tx was sent)
  onComputeDelivered?: (event: ComputeDeliveredEvent) => void; // Callback when compute is delivered
  onCommitmentSuccess?: (event: CommitmentSuccessCallbackEvent) => void; // Callback when scheduler prepares interval
  isRequestProcessed?: (requestId: string) => boolean; // Check if request is already processed (completed/failed)
  loadCheckpoint?: () => CheckpointData | undefined; // Load checkpoint from storage
  saveCheckpoint?: (checkpoint: CheckpointData) => void; // Save checkpoint to storage
  // Retry configuration
  maxRetries?: number; // Maximum retry attempts for failed requests (default: 3)
  retryIntervalMs?: number; // Interval to check for retryable events (default: 30000ms)
  getRetryableEvents?: (maxRetries: number) => RetryableEvent[]; // Get events that can be retried
  resetEventForRetry?: (requestId: string) => void; // Reset event status to pending for retry
  // Health check configuration
  healthCheckIntervalMs?: number; // Interval to check registry health (default: 300000ms = 5 min)
  // Payload encoder for outputs (allows IPFS upload for large payloads)
  payloadEncoder?: (content: string) => Promise<PayloadData>;
}

export class NoosphereAgent {
  private eventMonitor: EventMonitor;
  private containerManager: ContainerManager;
  private scheduler: SchedulerService;
  private walletManager: WalletManager;
  private registryManager: RegistryManager;
  private router: ethers.Contract;
  private coordinator: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private config: AgentConfig;
  private getContainer?: (containerId: string) => ContainerMetadata | undefined;
  private containers?: Map<string, ContainerMetadata>;
  private paymentWallet?: string;
  private isRunning = false;
  private processingRequests = new Set<string>(); // Deduplication: track requests being processed
  private retryTimer?: NodeJS.Timeout; // Timer for retry mechanism
  private healthCheckTimer?: NodeJS.Timeout; // Timer for registry health check
  private maxRetries: number;
  private retryIntervalMs: number;
  private healthCheckIntervalMs: number;
  // Container execution config
  private containerTimeout: number;
  private containerConnectionRetries: number;
  private containerConnectionRetryDelayMs: number;
  // Payload encoder (for IPFS upload)
  private payloadEncoder?: (content: string) => Promise<PayloadData>;

  constructor(private options: NoosphereAgentOptions) {
    this.config = options.config;
    this.provider = new ethers.JsonRpcProvider(options.config.rpcUrl);
    const provider = this.provider;

    // Use default ABIs from @noosphere/contracts if not provided
    const routerAbi = options.routerAbi || ABIs.Router;
    const coordinatorAbi = options.coordinatorAbi || ABIs.Coordinator;

    // Use provided WalletManager or create from private key
    if (options.walletManager) {
      this.walletManager = options.walletManager;
    } else if (options.config.privateKey) {
      this.walletManager = new WalletManager(options.config.privateKey, provider);
    } else {
      throw new Error(
        'Either walletManager or config.privateKey must be provided. ' +
          'Recommended: Use NoosphereAgent.fromKeystore() for production.'
      );
    }

    this.containerManager = new ContainerManager();
    // Use provided registryManager or create a new one
    this.registryManager = options.registryManager || new RegistryManager({
      autoSync: true, // Enable automatic sync with remote registry
      cacheTTL: 3600000, // 1 hour cache
    });
    this.eventMonitor = new EventMonitor(options.config, routerAbi, coordinatorAbi, {
      loadCheckpoint: options.loadCheckpoint,
      saveCheckpoint: options.saveCheckpoint,
    });

    // Initialize router contract
    this.router = new ethers.Contract(
      options.config.routerAddress,
      routerAbi,
      this.provider
    );

    this.coordinator = new ethers.Contract(
      options.config.coordinatorAddress,
      coordinatorAbi,
      this.walletManager.getWallet()
    );

    // Store container sources
    this.getContainer = options.getContainer;
    this.containers = options.containers;

    // Initialize scheduler service (with container filter)
    this.scheduler = new SchedulerService(
      provider,
      this.router,
      this.coordinator,
      this.walletManager.getAddress(),
      undefined, // batchReaderAddress (set later)
      undefined, // config (set later)
      this.getContainer // Pass container filter
    );

    // Store payment wallet (WalletFactory wallet for the agent)
    this.paymentWallet = options.paymentWallet;

    // Validate we have at least one container source
    if (!this.getContainer && (!this.containers || this.containers.size === 0)) {
      console.warn('⚠️  No container source provided. Agent will not be able to execute requests.');
    }

    // Initialize retry configuration
    this.maxRetries = options.maxRetries ?? 3;
    this.retryIntervalMs = options.retryIntervalMs ?? 30000; // 30 seconds

    // Initialize container execution configuration
    this.containerTimeout = options.containerConfig?.timeout ?? 180000; // 3 minutes default
    this.containerConnectionRetries = options.containerConfig?.connectionRetries ?? 5;
    this.containerConnectionRetryDelayMs = options.containerConfig?.connectionRetryDelayMs ?? 3000; // 3 seconds default

    // Initialize health check configuration
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ?? 300000; // 5 minutes default

    // Initialize payload encoder (for IPFS upload)
    this.payloadEncoder = options.payloadEncoder;
  }

  /**
   * Initialize NoosphereAgent from config.json (RECOMMENDED)
   * This loads all configuration including containers from a config file
   *
   * @param configPath - Path to config.json file
   * @param routerAbi - Router contract ABI (optional - defaults to ABIs.Router)
   * @param coordinatorAbi - Coordinator contract ABI (optional - defaults to ABIs.Coordinator)
   * @returns Initialized NoosphereAgent
   */
  static async fromConfig(
    configPath: string,
    routerAbi?: any[],
    coordinatorAbi?: any[]
  ): Promise<NoosphereAgent> {
    // Load config from file
    const fullConfig = ConfigLoader.loadFromFile(configPath);

    // Extract keystore path and password
    const keystorePath = fullConfig.chain.wallet.keystore?.path;
    const password = fullConfig.chain.wallet.keystore?.password;

    if (!keystorePath || !password) {
      throw new Error('Keystore path and password are required in config.chain.wallet.keystore');
    }

    // Load containers from config
    const containers = ConfigLoader.getContainersFromConfig(fullConfig);

    console.log(`📦 Loaded ${containers.size} containers from config:`);
    for (const [id, container] of containers.entries()) {
      console.log(`  - ${id}: ${container.image}:${container.tag || 'latest'}`);
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(fullConfig.chain.rpcUrl);

    // Load keystore
    const keystoreManager = new KeystoreManager(keystorePath, password);
    await keystoreManager.load();

    // Initialize WalletManager from keystore
    const walletManager = await WalletManager.fromKeystoreManager(keystoreManager, provider);

    // Create AgentConfig from NoosphereAgentConfig
    const agentConfig: AgentConfig = {
      rpcUrl: fullConfig.chain.rpcUrl,
      wsRpcUrl: fullConfig.chain.wsRpcUrl,
      routerAddress: fullConfig.chain.routerAddress,
      coordinatorAddress: fullConfig.chain.coordinatorAddress || fullConfig.chain.routerAddress,
      deploymentBlock: fullConfig.chain.deploymentBlock,
      pollingInterval: fullConfig.chain.processingInterval,
    };

    // Extract payment wallet (WalletFactory wallet for the agent)
    const paymentWallet = fullConfig.chain.wallet.paymentAddress;

    // Create agent with pre-initialized WalletManager and containers
    return new NoosphereAgent({
      config: agentConfig,
      routerAbi,
      coordinatorAbi,
      walletManager,
      containers,
      paymentWallet,
    });
  }

  /**
   * Initialize NoosphereAgent from keystore (RECOMMENDED)
   * This is the secure way to initialize an agent in production
   *
   * @param keystorePath - Path to keystore file
   * @param password - Keystore password
   * @param options - Agent configuration options
   * @returns Initialized NoosphereAgent
   */
  static async fromKeystore(
    keystorePath: string,
    password: string,
    options: Omit<NoosphereAgentOptions, 'walletManager'>
  ): Promise<NoosphereAgent> {
    const provider = new ethers.JsonRpcProvider(options.config.rpcUrl);

    // Load keystore
    const keystoreManager = new KeystoreManager(keystorePath, password);
    await keystoreManager.load();

    // Initialize WalletManager from keystore
    const walletManager = await WalletManager.fromKeystoreManager(keystoreManager, provider);

    // Create agent with pre-initialized WalletManager
    return new NoosphereAgent({
      ...options,
      walletManager,
    });
  }

  async start(): Promise<void> {
    console.log('Starting Noosphere Agent...');

    // Load registry (local + remote sync) - skip if already loaded
    console.log('📋 Loading container registry...');
    const existingStats = this.registryManager.getStats();
    if (existingStats.totalContainers === 0) {
      await this.registryManager.load();
    }
    const stats = this.registryManager.getStats();
    console.log(
      `✓ Registry loaded: ${stats.totalContainers} containers, ${stats.totalVerifiers} verifiers`
    );

    // Check Docker availability
    const dockerAvailable = await this.containerManager.checkDockerAvailable();
    if (!dockerAvailable) {
      throw new Error('Docker is not available. Please ensure Docker daemon is running.');
    }

    // Get wallet info
    const address = this.walletManager.getAddress();
    const balance = await this.walletManager.getBalance();
    console.log(`Agent wallet: ${address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.warn('⚠️  Warning: Wallet has zero balance. Agent needs ETH for gas fees.');
    }

    // Pre-pull container images if containers are provided
    if (this.containers && this.containers.size > 0) {
      console.log(`\n🚀 Preparing ${this.containers.size} containers...`);
      await this.containerManager.prepareContainers(this.containers);
    }

    // Connect event monitor
    await this.eventMonitor.connect();

    // Set up event handler
    this.eventMonitor.on('RequestStarted', async (event: RequestStartedEvent) => {
      await this.handleRequest(event);
    });

    // Start listening
    await this.eventMonitor.start();

    // Try to get SubscriptionBatchReader address from coordinator
    try {
      const batchReaderAddress = await this.coordinator.getSubscriptionBatchReader();
      if (
        batchReaderAddress &&
        batchReaderAddress !== '0x0000000000000000000000000000000000000000'
      ) {
        console.log(`✓ SubscriptionBatchReader found: ${batchReaderAddress}`);

        // Reinitialize scheduler with BatchReader and config from options
        this.scheduler.stop();
        this.scheduler = new SchedulerService(
          this.provider,
          this.router,
          this.coordinator,
          this.walletManager.getAddress(),
          batchReaderAddress,
          this.options.schedulerConfig || {
            cronIntervalMs: 60000, // 1 minute (default)
            syncPeriodMs: 3000,     // 3 seconds (default)
            maxRetryAttempts: 3,     // 3 retries (default)
          },
          this.getContainer // Pass container filter
        );
      } else {
        console.warn('⚠️  SubscriptionBatchReader not available - subscription sync disabled');
      }
    } catch (error) {
      console.warn('⚠️  Failed to get SubscriptionBatchReader address:', (error as Error).message);
    }

    // Start scheduler service
    this.scheduler.start();

    // Listen for commitment:success events to handle cases where WebSocket misses events
    this.scheduler.on('commitment:success', async (data: {
      subscriptionId: bigint;
      interval: bigint;
      txHash: string;
      blockNumber: number;
      gasUsed?: string;
      gasPrice?: string;
      gasCost?: string;
      requestStartedEvent?: RequestStartedEvent;
    }) => {
      // Call callback if provided (for DB persistence)
      if (this.options.onCommitmentSuccess) {
        this.options.onCommitmentSuccess({
          subscriptionId: data.subscriptionId,
          interval: data.interval,
          txHash: data.txHash,
          blockNumber: data.blockNumber,
          gasUsed: data.gasUsed || '0',
          gasPrice: data.gasPrice || '0',
          gasCost: data.gasCost || '0',
        });
      }

      if (data.requestStartedEvent) {
        console.log(`  📥 Processing RequestStarted from prepare receipt (fallback for missed WebSocket)`);
        await this.handleRequest(data.requestStartedEvent);
      }
    });

    // Start retry timer if retry callbacks are provided
    if (this.options.getRetryableEvents && this.options.resetEventForRetry) {
      this.startRetryTimer();
    }

    // Start health check timer
    this.startHealthCheck();

    this.isRunning = true;
    console.log('✓ Noosphere Agent is running');
    console.log('Listening for requests...');
  }

  /**
   * Start the retry timer for failed requests
   */
  private startRetryTimer(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }

    console.log(`🔄 Retry mechanism enabled: max ${this.maxRetries} retries, check every ${this.retryIntervalMs / 1000}s`);

    this.retryTimer = setInterval(async () => {
      await this.processRetries();
    }, this.retryIntervalMs);
  }

  /**
   * Start the health check timer for registry validation
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    console.log(`🏥 Health check enabled: check every ${this.healthCheckIntervalMs / 1000}s`);

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  /**
   * Perform health check - verify registry has containers and reload if necessary
   */
  private async performHealthCheck(): Promise<void> {
    const stats = this.registryManager.getStats();

    if (stats.totalContainers === 0) {
      console.warn('⚠️  Health check: 0 containers detected, attempting registry reload...');

      try {
        await this.registryManager.reload();
        const newStats = this.registryManager.getStats();

        if (newStats.totalContainers > 0) {
          console.log(`✓ Health check: Registry recovered - ${newStats.totalContainers} containers loaded`);
        } else {
          console.error('❌ Health check: Registry reload failed - still 0 containers');
        }
      } catch (error) {
        console.error('❌ Health check: Registry reload error:', (error as Error).message);
      }
    }
  }

  /**
   * Process retryable failed events (with throttling to avoid rate limits)
   */
  private async processRetries(): Promise<void> {
    if (!this.options.getRetryableEvents || !this.options.resetEventForRetry) {
      return;
    }

    const retryableEvents = this.options.getRetryableEvents(this.maxRetries);
    if (retryableEvents.length === 0) {
      return;
    }

    // Only retry one event per cycle to avoid rate limiting
    const event = retryableEvents[0];

    // Skip if already being processed
    if (this.processingRequests.has(event.requestId)) {
      return;
    }

    console.log(`🔄 Retrying request ${event.requestId.slice(0, 10)}... (attempt ${event.retryCount + 1}/${this.maxRetries}, ${retryableEvents.length} remaining)`);

    // Reset event to pending
    this.options.resetEventForRetry(event.requestId);

    // Re-process the request
    const container = this.getContainerMetadata(event.containerId);
    if (!container) {
      console.log(`  ⚠️ Container ${event.containerId.slice(0, 10)}... no longer supported, skipping retry`);
      return;
    }

    // Create a synthetic RequestStartedEvent for retry
    const retryEvent: RequestStartedEvent = {
      requestId: event.requestId,
      subscriptionId: BigInt(event.subscriptionId),
      interval: event.interval,
      containerId: event.containerId,
      redundancy: 1,
      useDeliveryInbox: false,
      feeAmount: BigInt(0),
      feeToken: '0x0000000000000000000000000000000000000000',
      walletAddress: '0x0000000000000000000000000000000000000000',
      verifier: '0x0000000000000000000000000000000000000000',
      coordinator: this.config.coordinatorAddress,
      blockNumber: 0,
    };

    // Handle the request
    try {
      await this.handleRequest(retryEvent);
    } catch (error) {
      console.log(`  ❌ Retry failed for ${event.requestId.slice(0, 10)}...: ${(error as Error).message}`);
    }
  }

  /**
   * Convert registry ContainerMetadata to agent-core ContainerMetadata
   */
  private convertRegistryContainer(registryContainer: any): ContainerMetadata {
    // Parse image name and tag from imageName (format: "image:tag" or just "image")
    const [image, tag] = registryContainer.imageName.split(':');

    return {
      id: registryContainer.id,
      name: registryContainer.name,
      image: image,
      tag: tag || 'latest',
      port: registryContainer.port?.toString(),
      env: registryContainer.env,
      requirements: registryContainer.requirements,
      payments: registryContainer.payments
        ? {
            basePrice: registryContainer.payments.basePrice,
            unit: registryContainer.payments.token,
            per: registryContainer.payments.per,
          }
        : undefined,
      verified: registryContainer.verified,
    };
  }

  /**
   * Get container metadata from available sources
   * Returns undefined if container is not supported by this agent
   *
   * NOTE: Only checks config-defined sources (callback and containers map).
   * Registry is NOT used here - we only process containers explicitly configured.
   */
  private getContainerMetadata(containerId: string): ContainerMetadata | undefined {
    // 1. Try callback function first (allows config-based filtering)
    if (this.getContainer) {
      const container = this.getContainer(containerId);
      if (container) return container;
    }

    // 2. Fallback to containers map from config
    // NOTE: We do NOT use registry here - only explicitly configured containers
    if (this.containers) {
      const container = this.containers.get(containerId);
      if (container) return container;
    }

    return undefined;
  }

  private async handleRequest(event: RequestStartedEvent): Promise<void> {
    const requestIdShort = event.requestId.slice(0, 10);

    // Container filter: Only process events for containers we support
    // This must be checked FIRST, before any DB save or RPC calls
    const container = this.getContainerMetadata(event.containerId);
    if (!container) {
      // Silently skip - we don't support this container
      return;
    }

    // Deduplication: Check if this request is already being processed
    if (this.processingRequests.has(event.requestId)) {
      console.log(`  ⏭️  Request ${requestIdShort}... already being processed, skipping duplicate`);
      return;
    }

    // Check if request has already been processed (completed/failed)
    if (this.options.isRequestProcessed && this.options.isRequestProcessed(event.requestId)) {
      console.log(`  ⏭️  Request ${requestIdShort}... already processed, skipping`);
      return;
    }

    this.processingRequests.add(event.requestId);

    console.log(`\n[${new Date().toISOString()}] RequestStarted: ${requestIdShort}...`);
    console.log(`  SubscriptionId: ${event.subscriptionId}`);
    console.log(`  Interval: ${event.interval}`);
    console.log(`  ContainerId: ${event.containerId.slice(0, 10)}...`);
    console.log(`  📦 Container: ${container.name} (${container.image}:${container.tag || 'latest'})`);

    // Call onRequestStarted callback if provided (saves to DB)
    // This is called AFTER container check, so only supported containers are saved
    if (this.options.onRequestStarted) {
      this.options.onRequestStarted({
        requestId: event.requestId,
        subscriptionId: Number(event.subscriptionId),
        interval: Number(event.interval),
        containerId: event.containerId,
        redundancy: event.redundancy,
        feeAmount: event.feeAmount.toString(),
        feeToken: event.feeToken,
        verifier: event.verifier,
        walletAddress: event.walletAddress,
        blockNumber: event.blockNumber,
      });
    }

    // Check if this interval is still current (skip old replayed events)
    // Note: One-time executions (intervalSeconds=0) return type(uint32).max, should not be skipped
    try {
      const currentInterval = await this.router.getComputeSubscriptionInterval(event.subscriptionId);
      const eventInterval = Number(event.interval);

      // Skip check only for scheduled subscriptions (not one-time executions)
      // type(uint32).max = 4294967295 indicates one-time execution
      const isOneTimeExecution = currentInterval === 4294967295n;

      if (!isOneTimeExecution && currentInterval > eventInterval + 2) {
        console.log(`  ⏭️  Skipping old interval ${eventInterval} (current: ${currentInterval})`);
        if (this.options.onRequestSkipped) {
          this.options.onRequestSkipped(event.requestId, `Old interval ${eventInterval} (current: ${currentInterval})`);
        }
        this.processingRequests.delete(event.requestId);
        return;
      }
    } catch (error) {
      console.warn(`  Could not verify interval currency:`, (error as Error).message);
      // Continue processing if we can't verify
    }

    // Mark this interval as committed (subscription will be tracked by batch reader)
    this.scheduler.markIntervalCommitted(BigInt(event.subscriptionId), BigInt(event.interval));

    // Track sent transaction hash for error reporting
    let sentTxHash: string | undefined;

    try {
      // Self-coordination: Wait based on position-based priority
      await this.waitForPriority(event);

      // Call onRequestProcessing callback if provided
      if (this.options.onRequestProcessing) {
        this.options.onRequestProcessing(event.requestId);
      }

      // Check if already fulfilled (redundancy check)
      const currentCount = await this.coordinator.redundancyCount(event.requestId);
      if (currentCount >= event.redundancy) {
        console.log(`  ⏭️  Already fulfilled (${currentCount}/${event.redundancy}), skipping`);
        if (this.options.onRequestSkipped) {
          this.options.onRequestSkipped(event.requestId, `Already fulfilled (${currentCount}/${event.redundancy})`);
        }
        this.processingRequests.delete(event.requestId);
        return;
      }

      // Container already verified at the start of handleRequest()
      // Using the container variable from there

      // Fetch subscription to get client address
      const subscription = await this.router.getComputeSubscription(event.subscriptionId);
      const clientAddress = subscription.client;

      if (!clientAddress || clientAddress === '0x0000000000000000000000000000000000000000') {
        console.error(`  ❌ Invalid client address for subscription ${event.subscriptionId}`);
        if (this.options.onRequestFailed) {
          this.options.onRequestFailed(event.requestId, `Invalid client address for subscription ${event.subscriptionId}`);
        }
        return;
      }

      console.log(`  📞 Fetching inputs from client: ${clientAddress.slice(0, 10)}...`);

      // Call client's getComputeInputs to get the input data
      // InputType enum: 0=RAW_DATA, 1=URI_STRING, 2=PAYLOAD_DATA
      const clientAbi = [
        'function getComputeInputs(uint64 subscriptionId, uint32 interval, uint32 timestamp, address caller) external view returns (bytes memory data, uint8 inputType)',
      ];
      const client = new ethers.Contract(clientAddress, clientAbi, this.provider);
      const timestamp = Math.floor(Date.now() / 1000);

      let inputBytes: string;
      let inputType: number;
      try {
        const result = await client.getComputeInputs(
          event.subscriptionId,
          event.interval,
          timestamp,
          this.walletManager.getAddress()
        );
        inputBytes = result[0];
        inputType = Number(result[1]);
      } catch (error) {
        const errorMessage = (error as Error).message || String(error);
        console.error(`  ❌ Failed to get inputs from client:`, error);
        if (this.options.onRequestFailed) {
          this.options.onRequestFailed(event.requestId, `Failed to get inputs: ${errorMessage}`);
        }
        return;
      }

      // Convert bytes to string based on inputType
      let inputData: string;
      if (inputType === 2) {
        // PAYLOAD_DATA: ABI-encoded PayloadData struct
        console.log(`  📦 Input type: PAYLOAD_DATA - resolving from external storage...`);
        try {
          // Decode ABI-encoded PayloadData: (bytes32 contentHash, bytes uri)
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['bytes32', 'bytes'], inputBytes);
          const contentHash = decoded[0] as string;
          const uriBytes = decoded[1] as string;
          const uri = ethers.toUtf8String(uriBytes);

          console.log(`  📍 Content hash: ${contentHash.slice(0, 18)}...`);
          console.log(`  📍 URI: ${uri}`);

          // Resolve the payload using PayloadResolver
          // Use IPFS_GATEWAY from environment for fetching (e.g., Pinata gateway for cross-provider support)
          const ipfsGateway = process.env.IPFS_GATEWAY || 'http://localhost:8080/ipfs/';
          console.log(`  🌐 Using IPFS gateway: ${ipfsGateway}`);
          const payloadResolver = new PayloadResolver({
            ipfs: { gateway: ipfsGateway }
          });
          const resolved = await payloadResolver.resolve({ contentHash, uri });
          inputData = resolved.content;
          console.log(`  ✅ Payload resolved, size: ${inputData.length} bytes`);
        } catch (resolveError) {
          const errorMessage = (resolveError as Error).message || String(resolveError);
          console.error(`  ❌ Failed to resolve PayloadData:`, resolveError);
          if (this.options.onRequestFailed) {
            this.options.onRequestFailed(event.requestId, `Failed to resolve PayloadData: ${errorMessage}`);
          }
          return;
        }
      } else {
        // RAW_DATA (0) or URI_STRING (1): direct UTF-8 string
        inputData = ethers.toUtf8String(inputBytes);
      }
      console.log(
        `  📥 Inputs received: ${inputData.substring(0, 100)}${inputData.length > 100 ? '...' : ''}`
      );

      // Execute container
      console.log(`  ⚙️  Executing...`);
      const result = await this.containerManager.runContainer(
        container,
        inputData,
        this.containerTimeout,
        this.containerConnectionRetries,
        this.containerConnectionRetryDelayMs
      );

      if (result.exitCode !== 0) {
        console.error(`  ❌ Container execution failed with exit code ${result.exitCode}`);
        console.error(`  📄 Container output:`, result.output);
        if (this.options.onRequestFailed) {
          this.options.onRequestFailed(event.requestId, `Container execution failed with exit code ${result.exitCode}`);
        }
        return;
      }

      console.log(`  ✓ Execution completed in ${result.executionTime}ms`);

      // Submit result to coordinator
      console.log(`  📤 Submitting result...`);

      // Use the original input data from client (already a string)
      const input = inputData;
      const output = result.output;
      const proof = event.verifier ? result.output : ''; // Use output as proof if verifier exists

      // Use the wallet address from the event (subscription's payment wallet)
      const subscriptionWallet = event.walletAddress;

      // Create commitment using SDK utility
      const commitment: Commitment = CommitmentUtils.fromEvent(event, subscriptionWallet);

      // Encode commitment data using SDK utility
      const commitmentData = CommitmentUtils.encode(commitment);

      // Use payment wallet (WalletFactory wallet) if set, otherwise fallback to EOA
      const nodeWallet = this.paymentWallet || this.walletManager.getAddress();

      // Create PayloadData for input, output, and proof
      // Use custom payloadEncoder if provided (for IPFS upload), otherwise inline
      console.log(`  📦 payloadEncoder available: ${!!this.payloadEncoder}`);
      const inputPayload = this.payloadEncoder
        ? await this.payloadEncoder(input)
        : PayloadUtils.fromInlineData(input);
      const outputPayload = this.payloadEncoder
        ? await this.payloadEncoder(output)
        : PayloadUtils.fromInlineData(output);
      const proofPayload = proof
        ? (this.payloadEncoder ? await this.payloadEncoder(proof) : PayloadUtils.fromInlineData(proof))
        : PayloadUtils.empty();

      // Send transaction
      const tx = await this.coordinator.reportComputeResult(
        event.interval,
        inputPayload,
        outputPayload,
        proofPayload,
        commitmentData,
        nodeWallet
      );

      // Capture tx hash immediately for error reporting
      sentTxHash = tx.hash;
      console.log(`  📤 Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`  ✓ Result delivered successfully (block ${receipt.blockNumber})`);
        console.log(`  💰 Fee earned: ${ethers.formatEther(event.feeAmount)} ETH`);

        // Call onComputeDelivered callback if provided
        if (this.options.onComputeDelivered) {
          this.options.onComputeDelivered({
            requestId: event.requestId,
            subscriptionId: Number(event.subscriptionId),
            interval: Number(event.interval),
            containerId: event.containerId,
            redundancy: event.redundancy,
            feeAmount: event.feeAmount.toString(),
            feeToken: event.feeToken,
            input: inputPayload,
            output: outputPayload,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            gasPrice: receipt.gasPrice || tx.gasPrice || 0n,
          });
        }
      } else {
        throw new Error(`Delivery transaction failed with status ${receipt.status}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || String(error);
      const errorCode = (error as any).code;

      // Handle nonce expired error - this usually means another handler already processed this request
      if (errorCode === 'NONCE_EXPIRED' || errorMessage.includes('nonce has already been used') || errorMessage.includes('nonce too low')) {
        console.log(`  ⚠️  Nonce expired (likely already processed by another handler)`);
        // Don't mark as failed - it was probably successful via another path
        return;
      }

      console.error(`  ❌ Error processing request:`, error);
      if (this.options.onRequestFailed) {
        this.options.onRequestFailed(event.requestId, errorMessage, sentTxHash);
      }
    } finally {
      // Cleanup: Remove from processing set
      this.processingRequests.delete(event.requestId);
    }
  }

  /**
   * Self-coordination: Calculate priority and wait
   */
  private async waitForPriority(event: RequestStartedEvent): Promise<void> {
    const priority = this.calculatePriority(event.requestId);
    const maxDelay = event.redundancy === 1 ? 1000 : 200; // 1s for single redundancy, 200ms otherwise
    const delay = Math.floor((priority / 0xffffffff) * maxDelay);

    if (delay > 0) {
      console.log(
        `  ⏱️  Priority wait: ${delay}ms (priority: 0x${priority.toString(16).slice(0, 8)})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Calculate deterministic priority for this agent and request
   */
  private calculatePriority(requestId: string): number {
    const hash = ethers.keccak256(ethers.concat([requestId, this.walletManager.getAddress()]));

    // Use first 8 hex chars as priority (0x00000000 - 0xffffffff)
    return parseInt(hash.slice(2, 10), 16);
  }

  async stop(): Promise<void> {
    console.log('Stopping Noosphere Agent...');

    // Stop retry timer
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }

    // Stop health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Stop event monitoring
    await this.eventMonitor.stop();

    // Stop scheduler
    this.scheduler.stop();

    // Cleanup running containers
    await this.containerManager.cleanup();

    // Stop persistent containers
    await this.containerManager.stopPersistentContainers();

    this.isRunning = false;
    console.log('✓ Agent stopped');
  }

  getStatus(): {
    running: boolean;
    address: string;
    scheduler: {
      totalSubscriptions: number;
      activeSubscriptions: number;
      committedIntervals: number;
      pendingTransactions: number;
    };
    containers: {
      runningCount: number;
    };
  } {
    return {
      running: this.isRunning,
      address: this.walletManager.getAddress(),
      scheduler: this.scheduler.getStats(),
      containers: {
        runningCount: this.containerManager.getRunningContainerCount(),
      },
    };
  }

  /**
   * Get scheduler service (for advanced usage)
   */
  getScheduler(): SchedulerService {
    return this.scheduler;
  }
}
