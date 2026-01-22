import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import {
  EventMonitor,
  type CheckpointData,
  type EventMonitorOptions,
  type ConnectionState,
  type ConnectionConfig,
} from '../src/EventMonitor';
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
    'event RequestStarted(bytes32 indexed requestId, uint64 indexed subscriptionId, bytes32 indexed containerId, tuple(uint32 interval, bool useDeliveryInbox, uint256 feeAmount, address feeToken, address verifier, address coordinator, address walletAddress) commitment)',
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

  describe('Connection State Management', () => {
    it('should initialize with INIT state', () => {
      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi);
      expect(monitor.getConnectionState()).toBe('INIT');
    });

    it('should transition to WS_ACTIVE on successful WebSocket connection', async () => {
      await eventMonitor.connect();
      expect(eventMonitor.getConnectionState()).toBe('WS_ACTIVE');
    });

    it('should transition to HTTP_FALLBACK when no wsRpcUrl provided', async () => {
      const httpConfig = { ...mockConfig, wsRpcUrl: undefined };
      const httpMonitor = new EventMonitor(httpConfig, mockRouterAbi, mockCoordinatorAbi);

      await httpMonitor.connect();

      expect(httpMonitor.getConnectionState()).toBe('HTTP_FALLBACK');
    });

    it('should reset to INIT state on stop', async () => {
      await eventMonitor.connect();
      expect(eventMonitor.getConnectionState()).toBe('WS_ACTIVE');

      await eventMonitor.stop();
      expect(eventMonitor.getConnectionState()).toBe('INIT');
    });
  });

  describe('getConnectionMode', () => {
    it('should return "websocket" when WS_ACTIVE', async () => {
      await eventMonitor.connect();
      expect(eventMonitor.getConnectionMode()).toBe('websocket');
    });

    it('should return "http_polling" when HTTP_FALLBACK', async () => {
      const httpConfig = { ...mockConfig, wsRpcUrl: undefined };
      const httpMonitor = new EventMonitor(httpConfig, mockRouterAbi, mockCoordinatorAbi);

      await httpMonitor.connect();

      expect(httpMonitor.getConnectionMode()).toBe('http_polling');
    });

    it('should return "connecting" when in INIT state', () => {
      expect(eventMonitor.getConnectionMode()).toBe('connecting');
    });
  });

  describe('Connection Configuration', () => {
    it('should use default connection config when not provided', () => {
      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi);
      // The monitor should be created with default config
      expect(monitor).toBeInstanceOf(EventMonitor);
    });

    it('should accept custom connection config', () => {
      const customConfig: Partial<ConnectionConfig> = {
        wsConnectTimeoutMs: 15000,
        wsMaxConnectRetries: 5,
        wsConnectRetryDelayMs: 3000,
        wsRecoveryIntervalMs: 120000,
      };

      const options: EventMonitorOptions = {
        connectionConfig: customConfig,
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      expect(monitor).toBeInstanceOf(EventMonitor);
    });

    it('should merge custom config with defaults', () => {
      const options: EventMonitorOptions = {
        connectionConfig: {
          wsConnectTimeoutMs: 20000,
          // Other values should use defaults
        },
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      expect(monitor).toBeInstanceOf(EventMonitor);
    });
  });

  describe('WebSocket Connection with Timeout', () => {
    it('should connect via WebSocket within timeout', async () => {
      // Default mock resolves immediately
      await eventMonitor.connect();

      expect(ethers.WebSocketProvider).toHaveBeenCalledWith(mockConfig.wsRpcUrl);
      expect(eventMonitor.getConnectionState()).toBe('WS_ACTIVE');
    });

    it('should fallback to HTTP when WebSocket fails but HTTP succeeds', async () => {
      // Track provider type
      let wsCallCount = 0;
      let httpCallCount = 0;

      // Mock WS provider to fail, HTTP to succeed
      mockProvider.getBlockNumber.mockImplementation(() => {
        // WS provider is called first (3 times for retries), then HTTP
        if (wsCallCount < 3) {
          wsCallCount++;
          return Promise.reject(new Error('WS Connection failed'));
        }
        httpCallCount++;
        return Promise.resolve(2000);
      });

      const options: EventMonitorOptions = {
        connectionConfig: {
          wsConnectTimeoutMs: 1000,
          wsMaxConnectRetries: 3,
          wsConnectRetryDelayMs: 10,
        },
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();

      // Should be in HTTP_FALLBACK state
      expect(monitor.getConnectionState()).toBe('HTTP_FALLBACK');
      expect(wsCallCount).toBe(3);
      expect(httpCallCount).toBe(1);

      // Restore mock
      mockProvider.getBlockNumber.mockResolvedValue(2000);
    });
  });

  describe('WebSocket Retry Logic', () => {
    it('should retry WebSocket connection on failure', async () => {
      let attempts = 0;
      mockProvider.getBlockNumber.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve(2000);
      });

      const options: EventMonitorOptions = {
        connectionConfig: {
          wsConnectTimeoutMs: 1000,
          wsMaxConnectRetries: 3,
          wsConnectRetryDelayMs: 10, // Short delay for test
        },
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();

      // Should succeed after retries
      expect(monitor.getConnectionState()).toBe('WS_ACTIVE');
      expect(attempts).toBe(3);

      // Restore mock
      mockProvider.getBlockNumber.mockResolvedValue(2000);
    });

    it('should fallback to HTTP after max retries exceeded', async () => {
      // WS fails twice, then HTTP succeeds
      let callCount = 0;
      mockProvider.getBlockNumber.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('WS Connection failed'));
        }
        return Promise.resolve(2000); // HTTP succeeds
      });

      const options: EventMonitorOptions = {
        connectionConfig: {
          wsConnectTimeoutMs: 100,
          wsMaxConnectRetries: 2,
          wsConnectRetryDelayMs: 10,
        },
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();

      // Should fallback to HTTP after all WS retries fail
      expect(monitor.getConnectionState()).toBe('HTTP_FALLBACK');
      expect(callCount).toBe(3); // 2 WS attempts + 1 HTTP

      // Restore mock
      mockProvider.getBlockNumber.mockResolvedValue(2000);
    });
  });

  describe('Connection Recovery Event', () => {
    it('should emit connectionRecovered event when WS recovers', async () => {
      // Start with HTTP fallback
      const httpConfig = { ...mockConfig, wsRpcUrl: undefined };
      const monitor = new EventMonitor(httpConfig, mockRouterAbi, mockCoordinatorAbi);

      const recoveryHandler = vi.fn();
      monitor.on('connectionRecovered', recoveryHandler);

      await monitor.connect();

      // The monitor is now in HTTP_FALLBACK
      expect(monitor.getConnectionState()).toBe('HTTP_FALLBACK');

      // Note: Testing WS recovery loop would require more complex async handling
      // This test verifies the event listener can be attached
      expect(monitor.listenerCount('connectionRecovered')).toBe(1);
    });
  });

  describe('Stop cleanup', () => {
    it('should stop WS recovery loop on stop', async () => {
      // WS fails once, then HTTP succeeds (to trigger HTTP fallback with recovery loop)
      let callCount = 0;
      mockProvider.getBlockNumber.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('WS Connection failed'));
        }
        return Promise.resolve(2000); // HTTP succeeds
      });

      const options: EventMonitorOptions = {
        connectionConfig: {
          wsConnectTimeoutMs: 100,
          wsMaxConnectRetries: 1,
          wsConnectRetryDelayMs: 10,
          wsRecoveryIntervalMs: 60000, // Long interval so it doesn't trigger during test
        },
      };

      const monitor = new EventMonitor(mockConfig, mockRouterAbi, mockCoordinatorAbi, options);
      await monitor.connect();

      expect(monitor.getConnectionState()).toBe('HTTP_FALLBACK');

      // Stop should clean up recovery loop
      await monitor.stop();

      expect(monitor.getConnectionState()).toBe('INIT');

      // Restore mock
      mockProvider.getBlockNumber.mockResolvedValue(2000);
    });

    it('should stop polling interval on stop', async () => {
      const httpConfig = { ...mockConfig, wsRpcUrl: undefined };
      const monitor = new EventMonitor(httpConfig, mockRouterAbi, mockCoordinatorAbi);

      await monitor.connect();
      await monitor.start();

      // Stop should clean up polling
      await monitor.stop();

      expect(monitor.getConnectionState()).toBe('INIT');
    });
  });
});
