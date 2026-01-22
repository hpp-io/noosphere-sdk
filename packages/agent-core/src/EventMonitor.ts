import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import type { AgentConfig, RequestStartedEvent } from './types';

/**
 * Connection state for EventMonitor
 */
export type ConnectionState =
  | 'INIT'
  | 'WS_CONNECTING'
  | 'WS_ACTIVE'
  | 'WS_RECONNECTING'
  | 'HTTP_FALLBACK';

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  /** WS connection timeout in ms (default: 10000) */
  wsConnectTimeoutMs: number;
  /** Max WS connection retries before HTTP fallback (default: 3) */
  wsMaxConnectRetries: number;
  /** Delay between WS connection retries in ms (default: 5000) */
  wsConnectRetryDelayMs: number;
  /** Interval for WS recovery attempts when in HTTP fallback (default: 60000) */
  wsRecoveryIntervalMs: number;
}

const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  wsConnectTimeoutMs: 10000,
  wsMaxConnectRetries: 3,
  wsConnectRetryDelayMs: 5000,
  wsRecoveryIntervalMs: 60000,
};

export interface CheckpointData {
  blockNumber: number;
  blockHash?: string;
  blockTimestamp?: number;
}

export interface EventMonitorOptions {
  loadCheckpoint?: () => CheckpointData | undefined;
  saveCheckpoint?: (checkpoint: CheckpointData) => void;
  connectionConfig?: Partial<ConnectionConfig>;
}

export class EventMonitor extends EventEmitter {
  private provider!: ethers.WebSocketProvider | ethers.JsonRpcProvider;
  private router!: ethers.Contract;
  private coordinator!: ethers.Contract;
  private lastProcessedBlock: number;
  private useWebSocket: boolean;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isReconnecting = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastEventTime = Date.now();
  private checkpointCallbacks?: EventMonitorOptions;

  // Connection state management
  private connectionState: ConnectionState = 'INIT';
  private connectionConfig: ConnectionConfig;
  private wsRecoveryInterval: NodeJS.Timeout | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: AgentConfig,
    private routerAbi: any[],
    private coordinatorAbi: any[],
    options?: EventMonitorOptions
  ) {
    super();
    this.lastProcessedBlock = config.deploymentBlock || 0;
    this.useWebSocket = false;
    this.checkpointCallbacks = options;
    this.connectionConfig = {
      ...DEFAULT_CONNECTION_CONFIG,
      ...options?.connectionConfig,
    };
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection mode string for health API
   */
  getConnectionMode(): 'websocket' | 'http_polling' | 'connecting' {
    switch (this.connectionState) {
      case 'WS_ACTIVE':
        return 'websocket';
      case 'HTTP_FALLBACK':
        return 'http_polling';
      default:
        return 'connecting';
    }
  }

  async connect(): Promise<void> {
    const { wsMaxConnectRetries, wsConnectRetryDelayMs } = this.connectionConfig;

    // Try WebSocket connection with retries
    if (this.config.wsRpcUrl) {
      this.connectionState = 'WS_CONNECTING';

      for (let attempt = 1; attempt <= wsMaxConnectRetries; attempt++) {
        try {
          console.log(`🔌 WebSocket connection attempt ${attempt}/${wsMaxConnectRetries}...`);
          await this.connectWebSocketWithTimeout();
          this.connectionState = 'WS_ACTIVE';
          this.useWebSocket = true;
          console.log('✓ Connected via WebSocket (push-based events)');
          this.initializeContracts();
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️ WebSocket attempt ${attempt}/${wsMaxConnectRetries} failed: ${errorMessage}`);

          if (attempt < wsMaxConnectRetries) {
            console.log(`   Retrying in ${wsConnectRetryDelayMs / 1000}s...`);
            await this.sleep(wsConnectRetryDelayMs);
          }
        }
      }

      console.warn(`⚠️ All ${wsMaxConnectRetries} WebSocket attempts failed, falling back to HTTP polling`);
    } else {
      console.log('ℹ️ No WebSocket URL provided, using HTTP polling');
    }

    // Fallback to HTTP polling
    await this.connectHttp();
  }

  /**
   * Connect via WebSocket with timeout
   */
  private async connectWebSocketWithTimeout(): Promise<void> {
    const { wsConnectTimeoutMs } = this.connectionConfig;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout after ${wsConnectTimeoutMs}ms`));
      }, wsConnectTimeoutMs);

      try {
        const wsProvider = new ethers.WebSocketProvider(this.config.wsRpcUrl!);

        // Test connection by getting block number
        wsProvider.getBlockNumber()
          .then(() => {
            clearTimeout(timeout);
            this.provider = wsProvider;
            resolve();
          })
          .catch((error) => {
            clearTimeout(timeout);
            // Clean up the provider on failure
            wsProvider.destroy().catch(() => {});
            reject(error);
          });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Connect via HTTP (fallback mode)
   */
  private async connectHttp(): Promise<void> {
    this.connectionState = 'HTTP_FALLBACK';
    this.useWebSocket = false;
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

    // Verify HTTP connection
    try {
      await this.provider.getBlockNumber();
      console.log('✓ Connected via HTTP polling (fallback mode)');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`HTTP connection failed: ${errorMessage}`);
    }

    this.initializeContracts();

    // Start WS recovery loop if WS URL is configured
    if (this.config.wsRpcUrl) {
      this.startWsRecoveryLoop();
    }
  }

  /**
   * Initialize contract instances
   */
  private initializeContracts(): void {
    this.router = new ethers.Contract(this.config.routerAddress, this.routerAbi, this.provider);
    this.coordinator = new ethers.Contract(
      this.config.coordinatorAddress,
      this.coordinatorAbi,
      this.provider
    );
  }

  /**
   * Start WS recovery loop when in HTTP fallback mode
   */
  private startWsRecoveryLoop(): void {
    if (this.wsRecoveryInterval) {
      clearInterval(this.wsRecoveryInterval);
    }

    const { wsRecoveryIntervalMs } = this.connectionConfig;
    console.log(`🔄 Starting WS recovery loop (every ${wsRecoveryIntervalMs / 1000}s)`);

    this.wsRecoveryInterval = setInterval(async () => {
      if (this.connectionState !== 'HTTP_FALLBACK') {
        // Already recovered or in different state
        this.stopWsRecoveryLoop();
        return;
      }

      console.log('🔌 Attempting WebSocket recovery...');

      try {
        await this.connectWebSocketWithTimeout();

        // Success! Switch back to WebSocket
        console.log('✓ WebSocket connection recovered!');

        // Stop HTTP polling
        this.stopPolling();

        // Update state
        this.connectionState = 'WS_ACTIVE';
        this.useWebSocket = true;

        // Reinitialize contracts with new provider
        this.initializeContracts();

        // Replay any missed events
        await this.replayMissedEvents();

        // Start WebSocket listening
        await this.startWebSocketListening();

        // Stop recovery loop
        this.stopWsRecoveryLoop();

        // Emit recovery event
        this.emit('connectionRecovered', { mode: 'websocket' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`   WS recovery failed: ${errorMessage}, will retry in ${wsRecoveryIntervalMs / 1000}s`);
      }
    }, wsRecoveryIntervalMs);
  }

  /**
   * Stop WS recovery loop
   */
  private stopWsRecoveryLoop(): void {
    if (this.wsRecoveryInterval) {
      clearInterval(this.wsRecoveryInterval);
      this.wsRecoveryInterval = null;
      console.log('🔄 WS recovery loop stopped');
    }
  }

  /**
   * Stop HTTP polling
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async start(): Promise<void> {
    // Load checkpoint from callback or use deployment block
    if (this.checkpointCallbacks?.loadCheckpoint) {
      const checkpoint = this.checkpointCallbacks.loadCheckpoint();
      if (checkpoint) {
        this.lastProcessedBlock = checkpoint.blockNumber;
      }
    }

    console.log(`Starting from block ${this.lastProcessedBlock}`);

    // Replay missed events
    await this.replayEvents(this.lastProcessedBlock, 'latest');

    // Start real-time listening
    if (this.useWebSocket) {
      await this.startWebSocketListening();
    } else {
      await this.startPolling();
    }
  }

  private async replayEvents(fromBlock: number, toBlock: string | number): Promise<void> {
    console.log(`Replaying events from block ${fromBlock} to ${toBlock}`);

    const currentBlock = await this.provider.getBlockNumber();
    const toBlockNumber = toBlock === 'latest' ? currentBlock : Number(toBlock);

    // Query historical events in chunks to avoid RPC limits
    const chunkSize = 10000;
    for (let start = fromBlock; start <= toBlockNumber; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, toBlockNumber);

      const events = await this.coordinator.queryFilter(
        this.coordinator.filters.RequestStarted(),
        start,
        end
      );

      for (const event of events) {
        await this.processEvent(event);
      }

      if (events.length > 0) {
        this.saveCheckpoint(end);
      }
    }

    console.log(`Replayed events up to block ${toBlockNumber}`);
  }

  private async startWebSocketListening(): Promise<void> {
    console.log('Starting WebSocket event listening...');

    // Listen for RequestStarted events
    this.coordinator.on('RequestStarted', async (...args) => {
      const event = args[args.length - 1]; // Last argument is the event object
      this.lastEventTime = Date.now();
      await this.processEvent(event);

      const blockNumber = event.blockNumber;
      if (blockNumber - this.lastProcessedBlock >= 10) {
        this.saveCheckpoint(blockNumber);
      }
    });

    // Setup WebSocket error/close handlers for reconnection
    if (this.provider instanceof ethers.WebSocketProvider) {
      const wsProvider = this.provider as ethers.WebSocketProvider;

      // Access the underlying WebSocket to detect connection issues
      // ethers v6 exposes websocket through public getter 'websocket'
      const ws = (wsProvider as any).websocket;
      if (ws) {
        ws.on('close', () => {
          console.warn('⚠️ WebSocket connection closed');
          this.handleDisconnect();
        });
        ws.on('error', (error: Error) => {
          console.error('⚠️ WebSocket error:', error.message);
          this.handleDisconnect();
        });
      }
    }

    // Start heartbeat to detect silent disconnections
    this.startHeartbeat();

    console.log('✓ WebSocket event listener started');
  }

  private startHeartbeat(): void {
    // Check connection health every 2 minutes (reduced from 30s to avoid rate limits)
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.provider instanceof ethers.WebSocketProvider) {
          // Try to get block number as heartbeat
          const blockNumber = await this.provider.getBlockNumber();

          // If we haven't received events for 3+ minutes but blocks are advancing,
          // we might have a stale subscription - replay missed events
          const timeSinceLastEvent = Date.now() - this.lastEventTime;
          if (timeSinceLastEvent > 180000 && blockNumber > this.lastProcessedBlock + 5) {
            console.log(
              `⚠️ No events for ${Math.round(timeSinceLastEvent / 1000)}s, checking for missed events...`
            );
            await this.replayMissedEvents();
          }
        }
      } catch (error) {
        console.error('⚠️ Heartbeat failed, WebSocket may be disconnected');
        this.handleDisconnect();
      }
    }, 120000); // 2 minutes
  }

  private async replayMissedEvents(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock > this.lastProcessedBlock) {
        console.log(
          `📥 Replaying events from block ${this.lastProcessedBlock + 1} to ${currentBlock}`
        );
        await this.replayEvents(this.lastProcessedBlock + 1, currentBlock);
        this.lastEventTime = Date.now();
      }
    } catch (error) {
      console.error('Failed to replay missed events:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.connectionState = 'WS_RECONNECTING';

    // Clear heartbeat during reconnection
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Attempt reconnection
    this.reconnect().finally(() => {
      this.isReconnecting = false;
    });
  }

  private async startPolling(): Promise<void> {
    console.log('Starting HTTP polling (fallback mode)...');

    // Stop existing polling if any
    this.stopPolling();

    const pollingIntervalMs = this.config.pollingInterval || 12000; // 12 seconds default
    let lastBlock = await this.provider.getBlockNumber();

    this.pollingInterval = setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        if (currentBlock > lastBlock) {
          const events = await this.coordinator.queryFilter(
            this.coordinator.filters.RequestStarted(),
            lastBlock + 1,
            currentBlock
          );

          for (const event of events) {
            await this.processEvent(event);
          }

          if (events.length > 0) {
            this.saveCheckpoint(currentBlock);
          }

          lastBlock = currentBlock;
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, pollingIntervalMs);
  }

  private async processEvent(event: any): Promise<void> {
    // Parse event data
    // The RequestStarted event has: (requestId, subscriptionId, containerId, commitment)
    // Most fields are in the commitment struct
    const commitment = event.args.commitment;

    const requestStartedEvent: RequestStartedEvent = {
      requestId: event.args.requestId,
      subscriptionId: event.args.subscriptionId,
      containerId: event.args.containerId,
      interval: commitment.interval,
      useDeliveryInbox: commitment.useDeliveryInbox,
      walletAddress: commitment.walletAddress,
      feeAmount: commitment.feeAmount,
      feeToken: commitment.feeToken,
      verifier: commitment.verifier,
      coordinator: commitment.coordinator,
      verifierFee: commitment.verifierFee,
      blockNumber: event.blockNumber,
    };

    // Emit event for NoosphereAgent to handle
    this.emit('RequestStarted', requestStartedEvent);
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Falling back to HTTP polling.');

      // Clean up old provider
      if (this.provider instanceof ethers.WebSocketProvider) {
        try {
          await this.provider.destroy();
        } catch {
          // Ignore destroy errors
        }
      }

      // Switch to HTTP with WS recovery loop
      await this.connectHttp();
      await this.startPolling();
      this.reconnectAttempts = 0;
      return;
    }

    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    console.log(
      `🔄 Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    await this.sleep(backoff);

    try {
      // Clean up old listeners before reconnecting
      if (this.coordinator) {
        this.coordinator.removeAllListeners();
      }
      if (this.provider instanceof ethers.WebSocketProvider) {
        try {
          await this.provider.destroy();
        } catch {
          // Ignore destroy errors
        }
      }

      // Try WebSocket reconnection with timeout
      await this.connectWebSocketWithTimeout();
      this.connectionState = 'WS_ACTIVE';
      this.useWebSocket = true;
      this.initializeContracts();

      // Replay any missed events since last checkpoint
      await this.replayMissedEvents();

      await this.startWebSocketListening();
      console.log('✓ Reconnected successfully');
      this.reconnectAttempts = 0;
      this.lastEventTime = Date.now();

      // Emit reconnection event
      this.emit('connectionRecovered', { mode: 'websocket' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Reconnection failed: ${errorMessage}`);
      this.reconnectAttempts++;
      await this.reconnect();
    }
  }

  private saveCheckpoint(blockNumber: number): void {
    this.lastProcessedBlock = blockNumber;

    // Use callback if provided
    if (this.checkpointCallbacks?.saveCheckpoint) {
      this.checkpointCallbacks.saveCheckpoint({
        blockNumber,
        blockTimestamp: Date.now(),
      });
    }
  }

  async stop(): Promise<void> {
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop WS recovery loop
    this.stopWsRecoveryLoop();

    // Stop HTTP polling
    this.stopPolling();

    if (this.router) {
      this.router.removeAllListeners();
    }
    if (this.coordinator) {
      this.coordinator.removeAllListeners();
    }
    if (this.provider instanceof ethers.WebSocketProvider) {
      await this.provider.destroy();
    }

    this.connectionState = 'INIT';
  }
}
