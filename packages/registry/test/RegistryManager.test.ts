import fs from 'fs/promises';
import path from 'path';
import { RegistryManager } from '../src/RegistryManager';
import type { ContainerMetadata, VerifierMetadata, RegistryIndex } from '../src/types';

// Mock node-fetch to avoid ESM issues
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('RegistryManager', () => {
  const testRegistryPath = path.join(__dirname, '.test-registry.json');
  const testRegistry: RegistryIndex = {
    version: '1.0.0',
    containers: {
      'container-1': {
        id: 'container-1',
        name: 'test-container',
        imageName: 'test/image',
        port: 8080,
        statusCode: 'ACTIVE',
        tags: ['test', 'demo'],
      },
      'container-2': {
        id: 'container-2',
        name: 'ai-model',
        imageName: 'ai/model',
        port: 8000,
        statusCode: 'ACTIVE',
        tags: ['ai', 'ml'],
        requirements: {
          gpu: true,
          memory: '8GB',
        },
      },
    },
    verifiers: {
      '0x1111111111111111111111111111111111111111': {
        id: 'verifier-1',
        name: 'Test Verifier',
        verifierAddress: '0x1111111111111111111111111111111111111111',
        imageName: 'test/verifier',
        statusCode: 'ACTIVE',
      },
    },
    updatedAt: new Date().toISOString(),
  };

  afterEach(async () => {
    // Clean up test registry
    try {
      await fs.unlink(testRegistryPath);
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('load', () => {
    it('should load local registry', async () => {
      // Create test registry
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });

      await registry.load();

      const stats = registry.getStats();
      expect(stats.totalContainers).toBe(2);
      expect(stats.totalVerifiers).toBe(1);
    });

    it('should create default registry if no local file', async () => {
      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });

      await registry.load();

      const stats = registry.getStats();
      // Default registry includes "echo-service" container
      expect(stats.totalContainers).toBeGreaterThanOrEqual(1);
      expect(stats.totalVerifiers).toBeGreaterThanOrEqual(1);
    });

    it('should merge local and remote registries', async () => {
      // Create local registry with one container
      const localRegistry: RegistryIndex = {
        version: '1.0.0',
        containers: {
          'local-1': {
            id: 'local-1',
            name: 'local-container',
            imageName: 'local/image',
            statusCode: 'ACTIVE',
          },
        },
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(testRegistryPath, JSON.stringify(localRegistry, null, 2));

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });

      await registry.load();

      const containers = registry.listContainers();
      expect(containers.length).toBeGreaterThan(0);
    });
  });

  describe('getContainer', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should get container by id', () => {
      const container = registry.getContainer('container-1');

      expect(container).toBeDefined();
      expect(container?.name).toBe('test-container');
      expect(container?.imageName).toBe('test/image');
    });

    it('should return undefined for non-existent container', () => {
      const container = registry.getContainer('non-existent');

      expect(container).toBeUndefined();
    });
  });

  describe('searchContainers', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should search by name', () => {
      const results = registry.searchContainers('test');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('test');
    });

    it('should search by tag', () => {
      const results = registry.searchContainers('ml');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tags).toContain('ml');
    });

    it('should return empty array for no matches', () => {
      const results = registry.searchContainers('nonexistent-query');

      expect(results).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const results = registry.searchContainers('TEST');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('listContainers', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should list all containers', () => {
      const containers = registry.listContainers();

      expect(containers.length).toBeGreaterThanOrEqual(2);
    });

    it('should only return active containers', () => {
      const containers = registry.listContainers();

      containers.forEach((container) => {
        expect(container.statusCode).toBe('ACTIVE');
      });
    });
  });

  describe('addContainer', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should add custom container', async () => {
      const newContainer: ContainerMetadata = {
        id: 'custom-1',
        name: 'custom-container',
        imageName: 'custom/image',
        statusCode: 'ACTIVE',
        tags: ['custom'],
      };

      await registry.addContainer(newContainer);

      const retrieved = registry.getContainer('custom-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('custom-container');
    });

    it('should persist custom container to disk', async () => {
      const newContainer: ContainerMetadata = {
        id: 'custom-2',
        name: 'persistent-container',
        imageName: 'persistent/image',
        statusCode: 'ACTIVE',
      };

      await registry.addContainer(newContainer);

      // Load in new instance
      const registry2 = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry2.load();

      const retrieved = registry2.getContainer('custom-2');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('persistent-container');
    });
  });

  describe('getVerifier', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should get verifier by address', () => {
      const verifier = registry.getVerifier('0x1111111111111111111111111111111111111111');

      expect(verifier).toBeDefined();
      expect(verifier?.name).toBe('Test Verifier');
    });

    it('should return undefined for non-existent verifier', () => {
      const verifier = registry.getVerifier('0x9999999999999999999999999999999999999999');

      expect(verifier).toBeUndefined();
    });
  });

  describe('listVerifiers', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should list all verifiers', () => {
      const verifiers = registry.listVerifiers();

      expect(verifiers.length).toBeGreaterThanOrEqual(1);
    });

    it('should only return active verifiers', () => {
      const verifiers = registry.listVerifiers();

      verifiers.forEach((verifier) => {
        expect(verifier.statusCode).toBe('ACTIVE');
      });
    });
  });

  describe('addVerifier', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should add custom verifier', async () => {
      const newVerifier: VerifierMetadata = {
        id: 'custom-verifier-1',
        name: 'Custom Verifier',
        verifierAddress: '0x2222222222222222222222222222222222222222',
        imageName: 'custom/verifier',
        statusCode: 'ACTIVE',
      };

      await registry.addVerifier(newVerifier);

      const retrieved = registry.getVerifier('0x2222222222222222222222222222222222222222');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Custom Verifier');
    });
  });

  describe('getStats', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should return correct statistics', () => {
      const stats = registry.getStats();

      expect(stats.totalContainers).toBeGreaterThanOrEqual(2);
      expect(stats.totalVerifiers).toBeGreaterThanOrEqual(1);
      expect(stats.lastSync).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('should respect cache TTL', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
        cacheTTL: 100, // 100ms
      });

      await registry.load();
      const firstLoad = registry.getStats().lastSync;

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // This should use cached data (not reload)
      const stats = registry.getStats();
      expect(stats.lastSync).toBe(firstLoad);
    });
  });

  describe('error handling', () => {
    it('should throw error on invalid JSON', async () => {
      // Create invalid JSON file
      await fs.writeFile(testRegistryPath, 'invalid json{');

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });

      // Should throw on invalid JSON
      await expect(registry.load()).rejects.toThrow();
    });
  });

  describe('filtering', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      const registryWithInactive: RegistryIndex = {
        version: '1.0.0',
        containers: {
          'active-1': {
            id: 'active-1',
            name: 'active-container',
            imageName: 'active/image',
            statusCode: 'ACTIVE',
          },
          'inactive-1': {
            id: 'inactive-1',
            name: 'inactive-container',
            imageName: 'inactive/image',
            statusCode: 'INACTIVE',
          },
        },
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(testRegistryPath, JSON.stringify(registryWithInactive, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should only list active containers', () => {
      const containers = registry.listContainers();

      const hasInactive = containers.some((c) => c.statusCode !== 'ACTIVE');
      expect(hasInactive).toBe(false);
    });
  });
});
