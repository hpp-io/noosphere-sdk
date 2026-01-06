import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import type { AgentConfig, RequestStartedEvent } from './types';

interface Checkpoint {
  lastProcessedBlock: number;
  timestamp: number;
}

export class EventMonitor extends EventEmitter {
  private provider!: ethers.WebSocketProvider | ethers.JsonRpcProvider;
  private router!: ethers.Contract;
  private coordinator!: ethers.Contract;
  private lastProcessedBlock: number;
  private checkpointPath: string;
  private useWebSocket: boolean;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(
    private config: AgentConfig,
    private routerAbi: any[],
    private coordinatorAbi: any[]
  ) {
    super();
    this.checkpointPath = path.join(process.cwd(), '.noosphere', 'checkpoint.json');
    this.lastProcessedBlock = config.deploymentBlock || 0;
    this.useWebSocket = false;
  }

  async connect(): Promise<void> {
    try {
      // Try WebSocket first for push-based events
      if (this.config.wsRpcUrl) {
        this.provider = new ethers.WebSocketProvider(this.config.wsRpcUrl);
        await this.provider._start();
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
    // Ensure .noosphere directory exists
    await fs.mkdir(path.dirname(this.checkpointPath), { recursive: true });

    // Load checkpoint from disk
    const checkpoint = await this.loadCheckpoint();
    this.lastProcessedBlock = checkpoint.lastProcessedBlock;

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
        await this.saveCheckpoint(end);
      }
    }

    console.log(`Replayed events up to block ${toBlockNumber}`);
  }

  private async startWebSocketListening(): Promise<void> {
    console.log('Starting WebSocket event listening...');

    // Listen for RequestStarted events
    this.coordinator.on('RequestStarted', async (...args) => {
      const event = args[args.length - 1]; // Last argument is the event object
      await this.processEvent(event);

      const blockNumber = event.blockNumber;
      if (blockNumber - this.lastProcessedBlock >= 10) {
        await this.saveCheckpoint(blockNumber);
      }
    });

    // Note: ethers v6 WebSocketProvider handles reconnection automatically
    // Manual WebSocket event handling is not exposed in the public API
    console.log('✓ WebSocket event listener started');
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
            await this.saveCheckpoint(currentBlock);
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
      `Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    await new Promise((resolve) => setTimeout(resolve, backoff));

    try {
      await this.connect();
      await this.startWebSocketListening();
      console.log('✓ Reconnected successfully');
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.reconnectAttempts++;
      await this.reconnect();
    }
  }

  private async saveCheckpoint(blockNumber: number): Promise<void> {
    const checkpoint: Checkpoint = {
      lastProcessedBlock: blockNumber,
      timestamp: Date.now(),
    };

    await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
    this.lastProcessedBlock = blockNumber;
  }

  private async loadCheckpoint(): Promise<Checkpoint> {
    try {
      const data = await fs.readFile(this.checkpointPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      // No checkpoint found, use deployment block or 0
      return {
        lastProcessedBlock: this.config.deploymentBlock || 0,
        timestamp: Date.now(),
      };
    }
  }

  async stop(): Promise<void> {
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
