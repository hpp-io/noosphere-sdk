import { ethers } from 'ethers';
import { EventMonitor } from './EventMonitor';
import { ContainerManager } from './ContainerManager';
import { SchedulerService } from './SchedulerService';
import { WalletManager, KeystoreManager } from '@noosphere/crypto';
import { RegistryManager } from '@noosphere/registry';
import { CommitmentUtils } from './utils/CommitmentUtils';
import { ConfigLoader } from './utils/ConfigLoader';
import type {
  AgentConfig,
  RequestStartedEvent,
  ContainerMetadata,
  Commitment,
  NoosphereAgentConfig,
} from './types';

export interface NoosphereAgentOptions {
  config: AgentConfig;
  routerAbi: any[];
  coordinatorAbi: any[];
  getContainer?: (containerId: string) => ContainerMetadata | undefined;
  containers?: Map<string, ContainerMetadata>; // Container map from config
  walletManager?: WalletManager; // Optional - provide pre-initialized WalletManager
  paymentWallet?: string; // Optional - WalletFactory wallet address for the agent
  schedulerConfig?: {
    cronIntervalMs: number;
    syncPeriodMs: number;
    maxRetryAttempts: number;
  }; // Optional - scheduler configuration from config.json
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

  constructor(private options: NoosphereAgentOptions) {
    this.config = options.config;
    this.provider = new ethers.JsonRpcProvider(options.config.rpcUrl);
    const provider = this.provider;

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
    this.registryManager = new RegistryManager({
      autoSync: true, // Enable automatic sync with remote registry
      cacheTTL: 3600000, // 1 hour cache
    });
    this.eventMonitor = new EventMonitor(options.config, options.routerAbi, options.coordinatorAbi);

    // Initialize router contract
    this.router = new ethers.Contract(
      options.config.routerAddress,
      options.routerAbi,
      this.provider
    );

    this.coordinator = new ethers.Contract(
      options.config.coordinatorAddress,
      options.coordinatorAbi,
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
  }

  /**
   * Initialize NoosphereAgent from config.json (RECOMMENDED)
   * This loads all configuration including containers from a config file
   *
   * @param configPath - Path to config.json file
   * @param routerAbi - Router contract ABI
   * @param coordinatorAbi - Coordinator contract ABI
   * @returns Initialized NoosphereAgent
   */
  static async fromConfig(
    configPath: string,
    routerAbi: any[],
    coordinatorAbi: any[]
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

    // Load registry (local + remote sync)
    console.log('📋 Loading container registry...');
    await this.registryManager.load();
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

    this.isRunning = true;
    console.log('✓ Noosphere Agent is running');
    console.log('Listening for requests...');
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

  private async handleRequest(event: RequestStartedEvent): Promise<void> {
    const requestIdShort = event.requestId.slice(0, 10);
    console.log(`\n[${new Date().toISOString()}] RequestStarted: ${requestIdShort}...`);
    console.log(`  SubscriptionId: ${event.subscriptionId}`);
    console.log(`  Interval: ${event.interval}`);
    console.log(`  ContainerId: ${event.containerId.slice(0, 10)}...`);

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
        return;
      }
    } catch (error) {
      console.warn(`  Could not verify interval currency:`, (error as Error).message);
      // Continue processing if we can't verify
    }

    // Mark this interval as committed (subscription will be tracked by batch reader)
    this.scheduler.markIntervalCommitted(BigInt(event.subscriptionId), BigInt(event.interval));

    try {
      // Self-coordination: Wait based on position-based priority
      await this.waitForPriority(event);

      // Check if already fulfilled (redundancy check)
      const currentCount = await this.coordinator.redundancyCount(event.requestId);
      if (currentCount >= event.redundancy) {
        console.log(`  ⏭️  Already fulfilled (${currentCount}/${event.redundancy}), skipping`);
        return;
      }

      // Get container metadata (try callback first for validation, then registry, then map)
      let container: ContainerMetadata | undefined;

      // 1. Try callback function first (allows config-based filtering)
      if (this.getContainer) {
        container = this.getContainer(event.containerId);
        if (container) {
          console.log(`  📦 Container found via callback: ${container.name}`);
        }
      }

      // 2. Fallback to registry
      if (!container) {
        const registryContainer = this.registryManager.getContainer(event.containerId);
        if (registryContainer) {
          console.log(`  📋 Container found in registry: ${registryContainer.name}`);
          container = this.convertRegistryContainer(registryContainer);
        }
      }

      // 3. Fallback to containers map from config
      if (!container && this.containers) {
        container = this.containers.get(event.containerId);
        if (container) {
          console.log(`  📦 Container found in config: ${container.name}`);
        }
      }

      if (!container) {
        console.error(`  ❌ Container not found: ${event.containerId}`);
        console.error(`  💡 Try adding it to the registry or config file`);
        return;
      }

      console.log(
        `  📦 Using container: ${container.name} (${container.image}:${container.tag || 'latest'})`
      );

      // Fetch subscription to get client address
      const subscription = await this.router.getComputeSubscription(event.subscriptionId);
      const clientAddress = subscription.client;

      if (!clientAddress || clientAddress === '0x0000000000000000000000000000000000000000') {
        console.error(`  ❌ Invalid client address for subscription ${event.subscriptionId}`);
        return;
      }

      console.log(`  📞 Fetching inputs from client: ${clientAddress.slice(0, 10)}...`);

      // Call client's getComputeInputs to get the input data
      const clientAbi = [
        'function getComputeInputs(uint64 subscriptionId, uint32 interval, uint32 timestamp, address caller) external view returns (bytes memory)',
      ];
      const client = new ethers.Contract(clientAddress, clientAbi, this.provider);
      const timestamp = Math.floor(Date.now() / 1000);

      let inputBytes: string;
      try {
        inputBytes = await client.getComputeInputs(
          event.subscriptionId,
          event.interval,
          timestamp,
          this.walletManager.getAddress()
        );
      } catch (error) {
        console.error(`  ❌ Failed to get inputs from client:`, error);
        return;
      }

      // Convert bytes to string
      const inputData = ethers.toUtf8String(inputBytes);
      console.log(
        `  📥 Inputs received: ${inputData.substring(0, 100)}${inputData.length > 100 ? '...' : ''}`
      );

      // Execute container
      console.log(`  ⚙️  Executing...`);
      const result = await this.containerManager.runContainer(
        container,
        inputData,
        300000 // 5 min timeout
      );

      if (result.exitCode !== 0) {
        console.error(`  ❌ Container execution failed with exit code ${result.exitCode}`);
        console.error(`  📄 Container output:`, result.output);
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

      // Send transaction
      const tx = await this.coordinator.reportComputeResult(
        event.interval,
        ethers.toUtf8Bytes(input),
        ethers.toUtf8Bytes(output),
        ethers.toUtf8Bytes(proof),
        commitmentData,
        nodeWallet
      );

      console.log(`  📤 Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`  ✓ Result delivered successfully (block ${receipt.blockNumber})`);
        console.log(`  💰 Fee earned: ${ethers.formatEther(event.feeAmount)} ETH`);
      } else {
        throw new Error(`Delivery transaction failed with status ${receipt.status}`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing request:`, error);
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
