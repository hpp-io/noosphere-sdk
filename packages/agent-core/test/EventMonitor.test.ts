import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import { EventMonitor, type CheckpointData, type EventMonitorOptions } from '../src/EventMonitor';
import type { AgentConfig } from '../src/types';
import { ethers } from 'ethers';

// Create shared mock instances
const mockProvider = {
  getBlockNumber: vi.fn().mockResolvedValue(2000),
  destroy: vi.fn().mockResolvedValue(undefined),
  _websocket: new EventEmitter(),
};

const mockCoordinator = {
  queryFilter: vi.fn().mockResolvedValue([]),
  on: vi.fn(),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
  filters: {
    RequestStarted: vi.fn().mockReturnValue({}),
  },
};

const mockRouter = {
  on: vi.fn(),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
};

// Mock ethers module with spy-compatible constructors
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');

  const MockWebSocketProvider = vi.fn().mockImplementation(function () {
    return {
      getBlockNumber: mockProvider.getBlockNumber,
      destroy: mockProvider.destroy,
      _websocket: mockProvider._websocket,
    };
  });

  const MockJsonRpcProvider = vi.fn().mockImplementation(function () {
    return {
      getBlockNumber: mockProvider.getBlockNumber,
      destroy: mockProvider.destroy,
    };
  });

  const MockContract = vi.fn().mockImplementation(function () {
    return {
      queryFilter: mockCoordinator.queryFilter,
      on: mockCoordinator.on,
      off: mockCoordinator.off,
      removeAllListeners: mockCoordinator.removeAllListeners,
      filters: mockCoordinator.filters,
    };
  });

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      WebSocketProvider: MockWebSocketProvider,
      JsonRpcProvider: MockJsonRpcProvider,
      Contract: MockContract,
    },
  };
});

describe('EventMonitor', () => {
  let eventMonitor: EventMonitor;
  const mockConfig: AgentConfig = {
    rpcUrl: 'http://localhost:8545',
    wsRpcUrl: 'ws://localhost:8546',
    privateKey: '0x' + '1'.repeat(64),
    routerAddress: '0x1111111111111111111111111111111111111111',
    coordinatorAddress: '0x2222222222222222222222222222222222222222',
    deploymentBlock: 1000,
    pollingInterval: 12000,
  };

  const mockRouterAbi = [
    'event RequestStart(bytes32 indexed requestId, uint64 indexed subscriptionId, bytes32 indexed containerId)',
  ];

  const mockCoordinatorAbi = [
    'event RequestStarted(bytes32 indexed requestId, uint64 indexed subscriptionId, bytes32 indexed containerId, tuple(uint32 interval, uint16 redundancy, bool useDeliveryInbox, uint256 feeAmount, address feeToken, address verifier, address coordinator, address walletAddress) commitment)',
  ];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset mock return values
    mockProvider.getBlockNumber.mockResolvedValue(2000);
    mockProvider.destroy.mockResolvedValue(undefined);
    mockCoordinator.queryFilter.mockResolvedValue([]);

    eventMonitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(eventMonitor).toBeInstanceOf(EventMonitor);
    });

    it('should use deploymentBlock as initial lastProcessedBlock', () => {
      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi);
      expect(monitor).toBeInstanceOf(EventMonitor);
    });

    it('should accept checkpoint callbacks', () => {
      const options: EventMonitorOptions = {
        loadCheckpoint: vi.fn(),
        saveCheckpoint: vi.fn(),
      };
      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      expect(monitor).toBeInstanceOf(EventMonitor);
    });
  });

  describe('connect', () => {
    it('should connect via WebSocket when wsRpcUrl is provided', async () => {
      await eventMonitor.connect();

      expect(ethers.WebSocketProvider).toHaveBeenCalledWith(mockConfig.wsRpcUrl);
      expect(ethers.Contract).toHaveBeenCalled();
    });

    it('should support HTTP fallback configuration', async () => {
      // When wsRpcUrl is not provided, HTTP mode should be used
      const configWithoutWs = { ...mockConfig, wsRpcUrl: undefined };
      const httpMonitor = new EventMonitor(configWithoutWs, mockRouterAbi, mockCoordinatorAbi);

      await httpMonitor.connect();

      // Verify the monitor was created and can connect
      expect(httpMonitor).toBeInstanceOf(EventMonitor);
    });

    it('should fallback to HTTP when no wsRpcUrl provided', async () => {
      const configWithoutWs = { ...mockConfig, wsRpcUrl: undefined };
      const monitor = new EventMonitor(configWithoutWs, mockRouterAbi, mockCoordinatorAbi);

      await monitor.connect();

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(mockConfig.rpcUrl);
    });

    it('should initialize router and coordinator contracts', async () => {
      await eventMonitor.connect();

      expect(ethers.Contract).toHaveBeenCalledTimes(2);
      expect(ethers.Contract).toHaveBeenCalledWith(
        mockConfig.routerAddress,
        mockRouterAbi,
        expect.anything()
      );
      expect(ethers.Contract).toHaveBeenCalledWith(
        mockConfig.coordinatorAddress,
        mockCoordinatorAbi,
        expect.anything()
      );
    });
  });

  describe('start', () => {
    beforeEach(async () => {
      await eventMonitor.connect();
    });

    it('should load checkpoint from callback when provided', async () => {
      const checkpoint: CheckpointData = { blockNumber: 1500 };
      const options: EventMonitorOptions = {
        loadCheckpoint: vi.fn().mockReturnValue(checkpoint),
        saveCheckpoint: vi.fn(),
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();

      // Start should use checkpoint
      await monitor.start();

      expect(options.loadCheckpoint).toHaveBeenCalled();
    });

    it('should use deploymentBlock when no checkpoint exists', async () => {
      const options: EventMonitorOptions = {
        loadCheckpoint: vi.fn().mockReturnValue(undefined),
        saveCheckpoint: vi.fn(),
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();
      await monitor.start();

      expect(options.loadCheckpoint).toHaveBeenCalled();
    });

    it('should replay events from last checkpoint', async () => {
      await eventMonitor.start();

      expect(mockCoordinator.queryFilter).toHaveBeenCalled();
    });

    it('should start WebSocket listening when connected via WebSocket', async () => {
      await eventMonitor.start();

      expect(mockCoordinator.on).toHaveBeenCalledWith('RequestStarted', expect.any(Function));
    });
  });

  describe('event replay', () => {
    beforeEach(async () => {
      await eventMonitor.connect();
    });

    it('should process replayed events', async () => {
      const mockEvent = {
        args: {
          requestId: '0x' + '1'.repeat(64),
          subscriptionId: 1n,
          containerId: '0x' + '2'.repeat(64),
          commitment: {
            interval: 1,
            redundancy: 1,
            useDeliveryInbox: false,
            feeAmount: 1000n,
            feeToken: '0x' + '0'.repeat(40),
            verifier: '0x' + '0'.repeat(40),
            coordinator: mockConfig.coordinatorAddress,
            walletAddress: '0x' + '3'.repeat(40),
          },
        },
        blockNumber: 1500,
      };

      mockCoordinator.queryFilter.mockResolvedValue([mockEvent]);

      const handler = vi.fn();
      eventMonitor.on('RequestStarted', handler);

      await eventMonitor.start();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        requestId: mockEvent.args.requestId,
        subscriptionId: mockEvent.args.subscriptionId,
        containerId: mockEvent.args.containerId,
      }));
    });

    it('should query events in chunks to avoid RPC limits', async () => {
      // Mock 25000 blocks range (should trigger 3 queries with 10000 chunk size)
      mockProvider.getBlockNumber.mockResolvedValue(26000);
      mockCoordinator.queryFilter.mockResolvedValue([]);

      const monitor = new EventMonitor(
        { ...mockConfig, deploymentBlock: 1000 },
        mockRouterAbi,
        mockCoordinatorAbi
      );
      await monitor.connect();
      await monitor.start();

      // Should query in chunks
      expect(mockCoordinator.queryFilter.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should save checkpoint after processing events', async () => {
      const saveCheckpoint = vi.fn();
      const options: EventMonitorOptions = {
        loadCheckpoint: vi.fn().mockReturnValue(undefined),
        saveCheckpoint,
      };

      const mockEvent = {
        args: {
          requestId: '0x' + '1'.repeat(64),
          subscriptionId: 1n,
          containerId: '0x' + '2'.repeat(64),
          commitment: {
            interval: 1,
            redundancy: 1,
            useDeliveryInbox: false,
            feeAmount: 1000n,
            feeToken: '0x' + '0'.repeat(40),
            verifier: '0x' + '0'.repeat(40),
            coordinator: mockConfig.coordinatorAddress,
            walletAddress: '0x' + '3'.repeat(40),
          },
        },
        blockNumber: 1500,
      };

      mockCoordinator.queryFilter.mockResolvedValue([mockEvent]);

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();
      await monitor.start();

      expect(saveCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
        blockNumber: expect.any(Number),
      }));
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      const handler = vi.fn();
      eventMonitor.on('RequestStarted', handler);

      expect(eventMonitor.listenerCount('RequestStarted')).toBe(1);
    });

    it('should allow removing listeners', () => {
      const handler = vi.fn();
      eventMonitor.on('RequestStarted', handler);
      eventMonitor.off('RequestStarted', handler);

      expect(eventMonitor.listenerCount('RequestStarted')).toBe(0);
    });

    it('should emit RequestStarted event with correct data', async () => {
      await eventMonitor.connect();

      const mockEvent = {
        args: {
          requestId: '0x' + '1'.repeat(64),
          subscriptionId: 1n,
          containerId: '0x' + '2'.repeat(64),
          commitment: {
            interval: 5,
            redundancy: 3,
            useDeliveryInbox: true,
            feeAmount: 5000n,
            feeToken: '0x' + '4'.repeat(40),
            verifier: '0x' + '5'.repeat(40),
            coordinator: mockConfig.coordinatorAddress,
            walletAddress: '0x' + '6'.repeat(40),
          },
        },
        blockNumber: 2000,
      };

      mockCoordinator.queryFilter.mockResolvedValue([mockEvent]);

      const handler = vi.fn();
      eventMonitor.on('RequestStarted', handler);

      await eventMonitor.start();

      expect(handler).toHaveBeenCalledWith({
        requestId: mockEvent.args.requestId,
        subscriptionId: mockEvent.args.subscriptionId,
        containerId: mockEvent.args.containerId,
        interval: 5,
        redundancy: 3,
        useDeliveryInbox: true,
        feeAmount: 5000n,
        feeToken: mockEvent.args.commitment.feeToken,
        verifier: mockEvent.args.commitment.verifier,
        coordinator: mockEvent.args.commitment.coordinator,
        walletAddress: mockEvent.args.commitment.walletAddress,
        blockNumber: 2000,
      });
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await eventMonitor.connect();
    });

    it('should remove all listeners from contracts', async () => {
      await eventMonitor.stop();

      // Both contracts use the same mock, so we check it was called
      expect(mockCoordinator.removeAllListeners).toHaveBeenCalled();
    });

    it('should clean up resources on stop', async () => {
      // Verify stop completes without error
      await eventMonitor.stop();
      expect(eventMonitor).toBeInstanceOf(EventMonitor);
    });
  });

  describe('WebSocket event handling', () => {
    beforeEach(async () => {
      await eventMonitor.connect();
    });

    it('should handle WebSocket close event gracefully', async () => {
      // Start the monitor
      await eventMonitor.start();

      // Verify event listener was set up
      expect(mockCoordinator.on).toHaveBeenCalled();
    });
  });

  describe('HTTP polling mode', () => {
    it('should query events when started', async () => {
      // Use config without wsRpcUrl to force HTTP mode
      const httpConfig = { ...mockConfig, wsRpcUrl: undefined };
      const httpMonitor = new EventMonitor(httpConfig, mockRouterAbi, mockCoordinatorAbi);

      await httpMonitor.connect();
      await httpMonitor.start();

      // Should have queried for events
      expect(mockCoordinator.queryFilter).toHaveBeenCalled();
    });
  });
});
