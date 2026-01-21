import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContainerManager, type ContainerExecutionResult } from '../src/ContainerManager';
import type { ContainerMetadata } from '../src/types';
import axios from 'axios';
import Docker from 'dockerode';

// Mock axios
vi.mock('axios');

// Create shared mock instance
const mockDockerInstance = {
  ping: vi.fn(),
  info: vi.fn(),
  getImage: vi.fn(),
  pull: vi.fn(),
  createContainer: vi.fn(),
  getContainer: vi.fn(),
  modem: {
    followProgress: vi.fn(),
  },
};

// Mock dockerode with a class-like constructor
vi.mock('dockerode', () => {
  const MockDocker = vi.fn().mockImplementation(function () {
    return mockDockerInstance;
  });
  return {
    default: MockDocker,
  };
});

describe('ContainerManager', () => {
  let containerManager: ContainerManager;
  let mockedAxios: any;

  const mockContainer: ContainerMetadata = {
    id: 'container-1',
    name: 'test-container',
    image: 'test/image',
    tag: 'latest',
    port: '8081',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios = vi.mocked(axios);

    // Clear DOCKER_NETWORK to prevent test pollution
    delete process.env.DOCKER_NETWORK;

    containerManager = new ContainerManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up environment variable
    delete process.env.DOCKER_NETWORK;
  });

  describe('constructor', () => {
    it('should initialize Docker client', () => {
      expect(containerManager).toBeInstanceOf(ContainerManager);
      expect(Docker).toHaveBeenCalled();
    });
  });

  describe('runContainer', () => {
    it('should make HTTP POST request to container', async () => {
      const mockResponse = {
        data: { output: 'test output' },
        status: 200,
      };
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await containerManager.runContainer(mockContainer, '{"test": "input"}');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `http://localhost:${mockContainer.port}/computation`,
        expect.objectContaining({ input: '{"test": "input"}' }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.output).toBe('test output');
      expect(result.exitCode).toBe(0);
    });

    it('should handle string response data', async () => {
      mockedAxios.post.mockResolvedValue({
        data: 'string output',
        status: 200,
      });

      const result = await containerManager.runContainer(mockContainer, 'input');

      expect(result.output).toBe('string output');
    });

    it('should handle response without output field', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { result: 'computed', value: 42 },
        status: 200,
      });

      const result = await containerManager.runContainer(mockContainer, 'input');

      expect(result.output).toBe(JSON.stringify({ result: 'computed', value: 42 }));
    });

    it('should parse and merge JSON input', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { output: 'result' },
        status: 200,
      });

      await containerManager.runContainer(mockContainer, '{"key": "value"}');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: '{"key": "value"}',
          key: 'value',
        }),
        expect.any(Object)
      );
    });

    it('should handle non-JSON input gracefully', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { output: 'result' },
        status: 200,
      });

      await containerManager.runContainer(mockContainer, 'plain text input');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        { input: 'plain text input' },
        expect.any(Object)
      );
    });

    it('should retry on ECONNREFUSED', async () => {
      const connRefusedError = new Error('ECONNREFUSED');
      (connRefusedError as any).code = 'ECONNREFUSED';

      // Fail first 2 attempts, succeed on 3rd
      mockedAxios.post
        .mockRejectedValueOnce(connRefusedError)
        .mockRejectedValueOnce(connRefusedError)
        .mockResolvedValue({ data: { output: 'success' } });

      const result = await containerManager.runContainer(
        mockContainer,
        'input',
        180000, // timeout
        5, // retries
        10 // retry delay (short for testing)
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
      expect(result.output).toBe('success');
    });

    it('should throw after all retries exhausted', async () => {
      const connRefusedError = new Error('ECONNREFUSED');
      (connRefusedError as any).code = 'ECONNREFUSED';

      mockedAxios.post.mockRejectedValue(connRefusedError);

      await expect(
        containerManager.runContainer(mockContainer, 'input', 180000, 3, 10)
      ).rejects.toThrow(/Cannot connect to container/);

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on HTTP errors', async () => {
      const httpError = new Error('HTTP Error');
      (httpError as any).response = { status: 500, data: 'Internal Server Error' };

      mockedAxios.post.mockRejectedValue(httpError);

      await expect(containerManager.runContainer(mockContainer, 'input')).rejects.toThrow(
        /Container HTTP error 500/
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      mockedAxios.post.mockRejectedValue(timeoutError);

      await expect(containerManager.runContainer(mockContainer, 'input')).rejects.toThrow(
        /Container execution timeout/
      );
    });

    it('should use DOCKER_NETWORK for container host when set', async () => {
      const originalEnv = process.env.DOCKER_NETWORK;
      process.env.DOCKER_NETWORK = 'test-network';

      mockedAxios.post.mockResolvedValue({ data: { output: 'result' } });

      await containerManager.runContainer(mockContainer, 'input');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `http://noosphere-${mockContainer.name}:${mockContainer.port}/computation`,
        expect.any(Object),
        expect.any(Object)
      );

      process.env.DOCKER_NETWORK = originalEnv;
    });

    it('should use default port 8081 when not specified', async () => {
      const containerWithoutPort: ContainerMetadata = {
        ...mockContainer,
        port: undefined,
      };

      mockedAxios.post.mockResolvedValue({ data: { output: 'result' } });

      await containerManager.runContainer(containerWithoutPort, 'input');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8081/computation',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should measure execution time', async () => {
      mockedAxios.post.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: { output: 'result' } };
      });

      const result = await containerManager.runContainer(mockContainer, 'input');

      // Allow some timing tolerance for CI environments
      expect(result.executionTime).toBeGreaterThanOrEqual(45);
    });
  });

  describe('checkDockerAvailable', () => {
    it('should return true when Docker is available', async () => {
      // Use shared mock instance
      mockDockerInstance.ping = vi.fn().mockResolvedValue('OK');

      const result = await containerManager.checkDockerAvailable();

      expect(result).toBe(true);
      expect(mockDockerInstance.ping).toHaveBeenCalled();
    });

    it('should return false when Docker is not available', async () => {
      // Use shared mock instance
      mockDockerInstance.ping = vi.fn().mockRejectedValue(new Error('Docker not running'));

      const result = await containerManager.checkDockerAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getDockerInfo', () => {
    it('should return Docker info', async () => {
      const mockInfo = {
        Containers: 5,
        Images: 10,
        ServerVersion: '20.10.0',
      };

      // Use shared mock instance
      mockDockerInstance.info = vi.fn().mockResolvedValue(mockInfo);

      const result = await containerManager.getDockerInfo();

      expect(result).toEqual(mockInfo);
    });
  });

  describe('getRunningContainerCount', () => {
    it('should return 0 initially', () => {
      expect(containerManager.getRunningContainerCount()).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should do nothing when no containers are running', async () => {
      await containerManager.cleanup();
      expect(containerManager.getRunningContainerCount()).toBe(0);
    });
  });

  describe('stopPersistentContainers', () => {
    it('should do nothing when no persistent containers', async () => {
      await containerManager.stopPersistentContainers();
      // No error means success
    });
  });

  describe('prepareContainers', () => {
    it('should do nothing with empty container map', async () => {
      await containerManager.prepareContainers(new Map());
      // No error means success
    });

    it('should pull images for provided containers', async () => {
      const containers = new Map<string, ContainerMetadata>([['test-1', mockContainer]]);

      // Use shared mock instance

      // Mock image doesn't exist
      const mockImage = {
        inspect: vi.fn().mockRejectedValue(new Error('Image not found')),
      };
      mockDockerInstance.getImage = vi.fn().mockReturnValue(mockImage);

      // Mock pull
      mockDockerInstance.pull = vi.fn((imageTag, callback) => {
        const mockStream = { on: vi.fn() };
        callback(null, mockStream);
      });
      mockDockerInstance.modem.followProgress = vi.fn((stream, onFinish) => {
        onFinish(null);
      });

      // Mock container creation
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      };
      mockDockerInstance.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      });

      await containerManager.prepareContainers(containers);

      expect(mockDockerInstance.getImage).toHaveBeenCalled();
    });

    it('should skip pull if image already exists', async () => {
      const containers = new Map<string, ContainerMetadata>([['test-1', mockContainer]]);

      // Use shared mock instance

      // Mock image exists
      const mockImage = {
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      };
      mockDockerInstance.getImage = vi.fn().mockReturnValue(mockImage);

      // Mock container
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      });

      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      };
      mockDockerInstance.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      await containerManager.prepareContainers(containers);

      expect(mockDockerInstance.pull).not.toHaveBeenCalled();
    });
  });

  describe('parseMemory (private method test via prepareContainers)', () => {
    it('should parse various memory formats correctly', async () => {
      const containerWithMemory: ContainerMetadata = {
        ...mockContainer,
        requirements: {
          memory: '512mb',
        },
      };

      const containers = new Map<string, ContainerMetadata>([['test-1', containerWithMemory]]);

      // Use shared mock instance

      // Mock image exists
      mockDockerInstance.getImage = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      });

      // Mock container not existing
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      });

      // Mock container creation
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      };
      mockDockerInstance.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      await containerManager.prepareContainers(containers);

      expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Memory: 512 * 1024 * 1024, // 512MB in bytes
          }),
        })
      );
    });
  });

  describe('container requirements', () => {
    it('should configure GPU when required', async () => {
      const containerWithGpu: ContainerMetadata = {
        ...mockContainer,
        requirements: {
          gpu: true,
        },
      };

      const containers = new Map<string, ContainerMetadata>([['test-1', containerWithGpu]]);

      // Use shared mock instance

      // Mock image exists
      mockDockerInstance.getImage = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      });

      // Mock container not existing
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      });

      // Mock container creation
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      };
      mockDockerInstance.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      await containerManager.prepareContainers(containers);

      expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            DeviceRequests: [
              {
                Driver: 'nvidia',
                Count: -1,
                Capabilities: [['gpu']],
              },
            ],
          }),
        })
      );
    });

    it('should configure CPU limit when required', async () => {
      const containerWithCpu: ContainerMetadata = {
        ...mockContainer,
        requirements: {
          cpu: 2,
        },
      };

      const containers = new Map<string, ContainerMetadata>([['test-1', containerWithCpu]]);

      // Use shared mock instance

      // Mock image exists
      mockDockerInstance.getImage = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      });

      // Mock container not existing
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Not found')),
      });

      // Mock container creation
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      };
      mockDockerInstance.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      await containerManager.prepareContainers(containers);

      expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            NanoCpus: 2 * 1e9, // 2 CPUs in nanocpus
          }),
        })
      );
    });
  });

  describe('existing container handling', () => {
    it('should reuse running container', async () => {
      const containers = new Map<string, ContainerMetadata>([['test-1', mockContainer]]);

      // Use shared mock instance

      // Mock image exists
      mockDockerInstance.getImage = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      });

      // Mock container already running
      mockDockerInstance.getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          Name: '/noosphere-test-container',
        }),
      });

      await containerManager.prepareContainers(containers);

      // Should not create a new container
      expect(mockDockerInstance.createContainer).not.toHaveBeenCalled();
    });

    it('should start stopped container', async () => {
      const containers = new Map<string, ContainerMetadata>([['test-1', mockContainer]]);

      // Use shared mock instance

      // Mock image exists
      mockDockerInstance.getImage = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ Id: 'image-id' }),
      });

      // Mock container exists but stopped
      const mockExistingContainer = {
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false },
          Name: '/noosphere-test-container',
        }),
        start: vi.fn().mockResolvedValue(undefined),
      };
      mockDockerInstance.getContainer = vi.fn().mockReturnValue(mockExistingContainer);

      await containerManager.prepareContainers(containers);

      expect(mockExistingContainer.start).toHaveBeenCalled();
      expect(mockDockerInstance.createContainer).not.toHaveBeenCalled();
    });
  });

  describe('container metadata validation', () => {
    it('should accept valid container metadata', () => {
      const container: ContainerMetadata = {
        id: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        name: 'stable-diffusion',
        image: 'runpod/stable-diffusion',
        tag: 'latest',
        requirements: {
          gpu: true,
          memory: '16GB',
          cpu: 4,
        },
      };

      expect(container.id).toBeTruthy();
      expect(container.name).toBe('stable-diffusion');
      expect(container.requirements?.gpu).toBe(true);
    });

    it('should handle container without requirements', () => {
      const container: ContainerMetadata = {
        id: '0xtest',
        name: 'simple-container',
        image: 'alpine',
      };

      expect(container.requirements).toBeUndefined();
    });

    it('should handle container with payments metadata', () => {
      const container: ContainerMetadata = {
        id: '0xtest',
        name: 'paid-container',
        image: 'test/paid',
        payments: {
          basePrice: '0.001',
          unit: 'ETH',
          per: 'request',
        },
      };

      expect(container.payments?.basePrice).toBe('0.001');
      expect(container.payments?.unit).toBe('ETH');
    });
  });
});
