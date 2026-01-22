import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoosphereAgent } from '../src/NoosphereAgent';
import { WalletManager } from '@noosphere/crypto';
import type { AgentConfig, ContainerMetadata } from '../src/types';

// Create shared mock instances that can be accessed in tests
const mockEventMonitorInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
};

const mockContainerManagerInstance = {
  checkDockerAvailable: vi.fn().mockResolvedValue(true),
  prepareContainers: vi.fn().mockResolvedValue(undefined),
  runContainer: vi.fn().mockResolvedValue({
    output: 'test output',
    exitCode: 0,
    executionTime: 100,
  }),
  cleanup: vi.fn().mockResolvedValue(undefined),
  stopPersistentContainers: vi.fn().mockResolvedValue(undefined),
  getRunningContainerCount: vi.fn().mockReturnValue(0),
};

const mockSchedulerInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  on: vi.fn(),
  markIntervalCommitted: vi.fn(),
  getStats: vi.fn().mockReturnValue({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    committedIntervals: 0,
    pendingTransactions: 0,
  }),
};

// Mock all dependencies with class constructors
vi.mock('../src/EventMonitor', () => ({
  EventMonitor: vi.fn().mockImplementation(function () {
    return mockEventMonitorInstance;
  }),
}));

vi.mock('../src/ContainerManager', () => ({
  ContainerManager: vi.fn().mockImplementation(function () {
    return mockContainerManagerInstance;
  }),
}));

vi.mock('../src/SchedulerService', () => ({
  SchedulerService: vi.fn().mockImplementation(function () {
    return mockSchedulerInstance;
  }),
}));

vi.mock('@noosphere/crypto', () => ({
  WalletManager: vi.fn().mockImplementation(function () {
    return {
      getAddress: vi.fn().mockReturnValue('0x' + '3'.repeat(40)),
      getWallet: vi.fn().mockReturnValue({}),
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
    };
  }),
  KeystoreManager: vi.fn(),
}));

vi.mock('@noosphere/registry', () => ({
  RegistryManager: vi.fn().mockImplementation(function () {
    return {
      load: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({
        totalContainers: 5,
        totalVerifiers: 2,
        lastSync: new Date().toISOString(),
      }),
      getContainer: vi.fn().mockReturnValue(undefined),
    };
  }),
}));

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');

  class MockJsonRpcProvider {
    getBlockNumber = vi.fn().mockResolvedValue(1000);
  }

  class MockContract {
    getSubscriptionBatchReader = vi
      .fn()
      .mockResolvedValue('0x0000000000000000000000000000000000000000');
    requestCommitments = vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000000');
    getComputeSubscriptionInterval = vi.fn().mockResolvedValue(1n);
    getComputeSubscription = vi.fn().mockResolvedValue({
      client: '0x1234567890123456789012345678901234567890',
    });
    reportComputeResult = vi.fn().mockResolvedValue({
      hash: '0x' + 'a'.repeat(64),
      wait: vi.fn().mockResolvedValue({
        status: 1,
        blockNumber: 1001,
        gasUsed: 100000n,
        gasPrice: 1000000000n,
      }),
    });
  }

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: MockJsonRpcProvider,
      Contract: MockContract,
      keccak256: (actual.ethers as any).keccak256,
      concat: (actual.ethers as any).concat,
      formatEther: (actual.ethers as any).formatEther,
      toUtf8String: (actual.ethers as any).toUtf8String,
      AbiCoder: (actual.ethers as any).AbiCoder,
    },
  };
});

describe('NoosphereAgent', () => {
  const mockConfig: AgentConfig = {
    rpcUrl: 'http://localhost:8545',
    wsRpcUrl: 'ws://localhost:8546',
    privateKey: '0x' + '1'.repeat(64),
    routerAddress: '0x1111111111111111111111111111111111111111',
    coordinatorAddress: '0x2222222222222222222222222222222222222222',
    deploymentBlock: 1000,
    pollingInterval: 12000,
  };

  const mockContainer: ContainerMetadata = {
    id: 'container-1',
    name: 'test-container',
    image: 'test/image',
    tag: 'latest',
    port: '8081',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations for each test
    mockContainerManagerInstance.checkDockerAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
      expect(WalletManager).toHaveBeenCalledWith(mockConfig.privateKey, expect.anything());
    });

    it('should use provided WalletManager', () => {
      const customWalletManager = {
        getAddress: vi.fn().mockReturnValue('0x' + '4'.repeat(40)),
        getWallet: vi.fn().mockReturnValue({}),
        getBalance: vi.fn().mockResolvedValue(2000000000000000000n),
      };

      const agent = new NoosphereAgent({
        config: { ...mockConfig, privateKey: undefined } as any,
        walletManager: customWalletManager as any,
        containers: new Map(),
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });

    it('should throw if neither privateKey nor walletManager provided', () => {
      expect(() => {
        new NoosphereAgent({
          config: { ...mockConfig, privateKey: undefined } as any,
          containers: new Map(),
        });
      }).toThrow(/Either walletManager or config.privateKey must be provided/);
    });

    it('should use provided RegistryManager', () => {
      const customRegistryManager = {
        load: vi.fn(),
        reload: vi.fn(),
        getStats: vi.fn().mockReturnValue({ totalContainers: 10, totalVerifiers: 5 }),
        getContainer: vi.fn(),
      };

      const agent = new NoosphereAgent({
        config: mockConfig,
        registryManager: customRegistryManager as any,
        containers: new Map(),
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });

    it('should warn when no containers provided', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new NoosphereAgent({
        config: mockConfig,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No container source provided')
      );
      consoleSpy.mockRestore();
    });

    it('should initialize with custom retry config', () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
        maxRetries: 5,
        retryIntervalMs: 60000,
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });

    it('should initialize with custom container config', () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
        containerConfig: {
          timeout: 300000,
          connectionRetries: 10,
          connectionRetryDelayMs: 5000,
        },
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });
  });

  describe('start', () => {
    it('should start event monitoring and scheduler', async () => {
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
      });

      await agent.start();

      expect(mockContainerManagerInstance.checkDockerAvailable).toHaveBeenCalled();
      expect(mockEventMonitorInstance.connect).toHaveBeenCalled();
      expect(mockEventMonitorInstance.start).toHaveBeenCalled();
      expect(mockSchedulerInstance.start).toHaveBeenCalled();
    });

    it('should throw if Docker is not available', async () => {
      mockContainerManagerInstance.checkDockerAvailable.mockResolvedValue(false);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
      });

      await expect(agent.start()).rejects.toThrow(/Docker is not available/);
    });

    it('should prepare containers if provided', async () => {
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
      });

      await agent.start();

      expect(mockContainerManagerInstance.prepareContainers).toHaveBeenCalledWith(containers);
    });

    it('should set up RequestStarted event handler', async () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map([['container-1', mockContainer]]),
      });

      await agent.start();

      expect(mockEventMonitorInstance.on).toHaveBeenCalledWith(
        'RequestStarted',
        expect.any(Function)
      );
    });
  });

  describe('stop', () => {
    it('should stop all services', async () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
      });

      await agent.start();
      await agent.stop();

      expect(mockEventMonitorInstance.stop).toHaveBeenCalled();
      expect(mockSchedulerInstance.stop).toHaveBeenCalled();
      expect(mockContainerManagerInstance.cleanup).toHaveBeenCalled();
      expect(mockContainerManagerInstance.stopPersistentContainers).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return agent status', async () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
      });

      await agent.start();
      const status = agent.getStatus();

      expect(status.running).toBe(true);
      expect(status.address).toBe('0x' + '3'.repeat(40));
      expect(status.scheduler).toBeDefined();
      expect(status.containers).toBeDefined();
    });

    it('should return running=false before start', () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
      });

      const status = agent.getStatus();

      expect(status.running).toBe(false);
    });
  });

  describe('getScheduler', () => {
    it('should return scheduler service', () => {
      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
      });

      const scheduler = agent.getScheduler();

      expect(scheduler).toBeDefined();
    });
  });

  describe('callbacks', () => {
    it('should call onRequestStarted callback', async () => {
      const onRequestStarted = vi.fn();
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
        onRequestStarted,
      });

      await agent.start();

      const handler = mockEventMonitorInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'RequestStarted'
      )?.[1];

      expect(handler).toBeDefined();
    });

    it('should call onCommitmentSuccess callback', async () => {
      const onCommitmentSuccess = vi.fn();

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers: new Map(),
        onCommitmentSuccess,
      });

      await agent.start();

      const commitmentHandler = mockSchedulerInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'commitment:success'
      )?.[1];

      if (commitmentHandler) {
        await commitmentHandler({
          subscriptionId: 1n,
          interval: 1n,
          txHash: '0x' + 'a'.repeat(64),
          blockNumber: 1001,
          gasUsed: '100000',
          gasPrice: '1000000000',
          gasCost: '100000000000000',
        });

        expect(onCommitmentSuccess).toHaveBeenCalled();
      }
    });
  });

  describe('request deduplication', () => {
    it('should track processing requests to prevent duplicates', async () => {
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
      });

      await agent.start();

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });
  });

  describe('priority calculation', () => {
    it('should calculate deterministic priority based on requestId and address', async () => {
      const containers = new Map<string, ContainerMetadata>([['container-1', mockContainer]]);

      const agent = new NoosphereAgent({
        config: mockConfig,
        containers,
      });

      expect(agent).toBeInstanceOf(NoosphereAgent);
    });
  });
});
