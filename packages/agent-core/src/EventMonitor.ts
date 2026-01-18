import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import type { AgentConfig, RequestStartedEvent } from './types';

export interface CheckpointData {
  blockNumber: number;
  blockHash?: string;
  blockTimestamp?: number;
}

export interface EventMonitorOptions {
  loadCheckpoint?: () => CheckpointData | undefined;
  saveCheckpoint?: (checkpoint: CheckpointData) => void;
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
  }

  async connect(): Promise<void> {
    try {
      // Try WebSocket first for push-based events
      if (this.config.wsRpcUrl) {
        this.provider = new ethers.WebSocketProvider(this.config.wsRpcUrl);
        // Note: Do NOT call _start() - it causes race condition with auto-initialization
        // The provider will initialize automatically on first request
        this.useWebSocket = true;
        console.log('✓ Connected via WebSocket (push-based events)');
      } else {
        throw new Error('WebSocket URL not provided');
      }
    } catch (error) {
      // Fallback to HTTP with polling
      console.warn('WebSocket unavailable, falling back to HTTP polling');
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      this.useWebSocket = false;
    }

    // Initialize contract instances
    this.router = new ethers.Contract(this.config.routerAddress, this.routerAbi, this.provider);

    this.coordinator = new ethers.Contract(
      this.config.coordinatorAddress,
      this.coordinatorAbi,
      this.provider
    );
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
            console.log(`⚠️ No events for ${Math.round(timeSinceLastEvent / 1000)}s, checking for missed events...`);
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
        console.log(`📥 Replaying events from block ${this.lastProcessedBlock + 1} to ${currentBlock}`);
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

    const pollingInterval = this.config.pollingInterval || 12000; // 12 seconds default
    let lastBlock = await this.provider.getBlockNumber();

    setInterval(async () => {
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
    }, pollingInterval);
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
      redundancy: commitment.redundancy,
      useDeliveryInbox: commitment.useDeliveryInbox,
      feeAmount: commitment.feeAmount,
      feeToken: commitment.feeToken,
      verifier: commitment.verifier,
      coordinator: commitment.coordinator,
      walletAddress: commitment.walletAddress,
      blockNumber: event.blockNumber,
    };

    // Emit event for NoosphereAgent to handle
    this.emit('RequestStarted', requestStartedEvent);
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Falling back to HTTP polling.');
      this.useWebSocket = false;
      await this.connect();
      await this.startPolling();
      return;
    }

    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    console.log(
      `🔄 Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    await new Promise((resolve) => setTimeout(resolve, backoff));

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

      await this.connect();

      // Replay any missed events since last checkpoint
      await this.replayMissedEvents();

      await this.startWebSocketListening();
      console.log('✓ Reconnected successfully');
      this.reconnectAttempts = 0;
      this.lastEventTime = Date.now();
    } catch (error) {
      console.error('Reconnection failed:', error);
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

    if (this.router) {
      this.router.removeAllListeners();
    }
    if (this.coordinator) {
      this.coordinator.removeAllListeners();
    }
    if (this.provider instanceof ethers.WebSocketProvider) {
      await this.provider.destroy();
    }
  }
}
