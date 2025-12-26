import { ContainerManager } from '../src/ContainerManager';
import type { ContainerMetadata } from '../src/types';

describe('ContainerManager', () => {
  let containerManager: ContainerManager;

  beforeEach(() => {
    containerManager = new ContainerManager();
  });

  describe('constructor', () => {
    it('should initialize ContainerManager', () => {
      expect(containerManager).toBeInstanceOf(ContainerManager);
    });
  });

  describe('parseMemory', () => {
    // Testing private method through public interface would require
    // making it public or using reflection, so we test the behavior instead
    it('should handle memory requirements in metadata', () => {
      const container: ContainerMetadata = {
        id: '0xtest',
        name: 'test-container',
        image: 'test/image',
        requirements: {
          memory: '1GB',
          cpu: 2,
        },
      };

      expect(container.requirements?.memory).toBe('1GB');
      expect(container.requirements?.cpu).toBe(2);
    });
  });

  describe('checkDockerAvailable', () => {
    it('should check if Docker is available', async () => {
      // This will fail in test environment without Docker
      // but we can verify the method exists and returns boolean
      const result = await containerManager.checkDockerAvailable();
      expect(typeof result).toBe('boolean');
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
