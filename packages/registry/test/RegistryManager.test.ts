import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { RegistryManager } from '../src/RegistryManager';
import type { ContainerMetadata, VerifierMetadata, RegistryIndex } from '../src/types';
import fetch from 'node-fetch';

// Mock node-fetch to avoid ESM issues
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const mockFetch = fetch as Mock;

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
      // Default registry is now empty (will be populated from remote sync)
      expect(stats.totalContainers).toBe(0);
      expect(stats.totalVerifiers).toBe(0);
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
    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

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

  describe('remote sync', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore if doesn't exist
      }
    });

    it('should sync from remote registry', async () => {
      // Create local registry
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const remoteRegistry: RegistryIndex = {
        version: '1.1.0',
        containers: {
          'remote-1': {
            id: 'remote-1',
            name: 'remote-container',
            imageName: 'remote/image',
            statusCode: 'ACTIVE',
          },
        },
        verifiers: {
          '0x3333333333333333333333333333333333333333': {
            id: 'remote-verifier-1',
            name: 'Remote Verifier',
            verifierAddress: '0x3333333333333333333333333333333333333333',
            imageName: 'remote/verifier',
            statusCode: 'ACTIVE',
          },
        },
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => remoteRegistry,
      });

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 0, // Disable cache
      });

      await registry.load();

      // Should have both local and remote containers
      const stats = registry.getStats();
      expect(stats.totalContainers).toBeGreaterThanOrEqual(3); // 2 local + 1 remote
      expect(registry.getContainer('remote-1')).toBeDefined();
    });

    it('should handle HTTP error from remote', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 0,
      });

      // Should not throw, but log warning
      await registry.load();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle network error from remote', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 0,
      });

      await registry.load();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should skip sync if cache is fresh', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const remoteRegistry: RegistryIndex = {
        version: '1.1.0',
        containers: {},
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => remoteRegistry,
      });

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 60000, // 1 minute cache
      });

      await registry.load();

      // First call should sync
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second sync should skip (cache fresh)
      await registry.sync();
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should force sync and bypass cache', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const remoteRegistry: RegistryIndex = {
        version: '1.1.0',
        containers: {},
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => remoteRegistry,
      });

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 60000,
      });

      await registry.load();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Force sync should bypass cache
      await registry.forceSync();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not overwrite local entries with remote entries', async () => {
      // Create local registry with specific container
      const localRegistry: RegistryIndex = {
        version: '1.0.0',
        containers: {
          'shared-container': {
            id: 'shared-container',
            name: 'local-name',
            imageName: 'local/image',
            statusCode: 'ACTIVE',
          },
        },
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(testRegistryPath, JSON.stringify(localRegistry, null, 2));

      // Remote has same container with different name
      const remoteRegistry: RegistryIndex = {
        version: '1.1.0',
        containers: {
          'shared-container': {
            id: 'shared-container',
            name: 'remote-name', // Different name
            imageName: 'remote/image',
            statusCode: 'ACTIVE',
          },
        },
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => remoteRegistry,
      });

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: true,
        cacheTTL: 0,
      });

      await registry.load();

      // Local entry should be preserved
      const container = registry.getContainer('shared-container');
      expect(container?.name).toBe('local-name');
    });
  });

  describe('reload', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

    it('should clear and reload registry', async () => {
      // Add a custom container
      await registry.addContainer({
        id: 'temp-container',
        name: 'Temp Container',
        imageName: 'temp/image',
        statusCode: 'ACTIVE',
      });

      expect(registry.getContainer('temp-container')).toBeDefined();

      // Reload should clear custom container (since it's in local file now)
      await registry.reload();

      // Container should still exist (was saved to local file)
      expect(registry.getContainer('temp-container')).toBeDefined();
    });
  });

  describe('getVerifierById', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should get verifier by id', () => {
      const verifier = registry.getVerifierById('verifier-1');

      expect(verifier).toBeDefined();
      expect(verifier?.name).toBe('Test Verifier');
      expect(verifier?.verifierAddress).toBe('0x1111111111111111111111111111111111111111');
    });

    it('should return undefined for non-existent verifier id', () => {
      const verifier = registry.getVerifierById('non-existent');

      expect(verifier).toBeUndefined();
    });
  });

  describe('removeContainer', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

    it('should remove existing container', async () => {
      expect(registry.getContainer('container-1')).toBeDefined();

      await registry.removeContainer('container-1');

      expect(registry.getContainer('container-1')).toBeUndefined();
    });

    it('should persist removal to disk', async () => {
      await registry.removeContainer('container-1');

      // Load in new instance
      const registry2 = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry2.load();

      expect(registry2.getContainer('container-1')).toBeUndefined();
    });

    it('should handle removing non-existent container gracefully', async () => {
      // Should not throw
      await registry.removeContainer('non-existent');
    });
  });

  describe('removeVerifier', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

    it('should remove existing verifier', async () => {
      const address = '0x1111111111111111111111111111111111111111';
      expect(registry.getVerifier(address)).toBeDefined();

      await registry.removeVerifier(address);

      expect(registry.getVerifier(address)).toBeUndefined();
    });

    it('should persist removal to disk', async () => {
      const address = '0x1111111111111111111111111111111111111111';
      await registry.removeVerifier(address);

      // Load in new instance
      const registry2 = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry2.load();

      expect(registry2.getVerifier(address)).toBeUndefined();
    });

    it('should handle removing non-existent verifier gracefully', async () => {
      // Should not throw
      await registry.removeVerifier('0x9999999999999999999999999999999999999999');
    });
  });

  describe('searchContainers with description', () => {
    let registry: RegistryManager;

    beforeEach(async () => {
      const registryWithDescription: RegistryIndex = {
        version: '1.0.0',
        containers: {
          'desc-container': {
            id: 'desc-container',
            name: 'basic-container',
            imageName: 'basic/image',
            statusCode: 'ACTIVE',
            description: 'This is a machine learning container',
          },
        },
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(testRegistryPath, JSON.stringify(registryWithDescription, null, 2));
      registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });
      await registry.load();
    });

    it('should search by description', () => {
      const results = registry.searchContainers('machine learning');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('desc-container');
    });
  });

  describe('constructor defaults', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

    it('should use default config values', () => {
      const registry = new RegistryManager();

      // Just verify it creates without error
      expect(registry).toBeDefined();
    });

    it('should use custom remote path', async () => {
      // First create a local file
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const customRemotePath = 'https://example.com/registry.json';
      const remoteRegistry: RegistryIndex = {
        version: '1.0.0',
        containers: {},
        verifiers: {},
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => remoteRegistry,
      });

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        remotePath: customRemotePath,
        autoSync: true,
        cacheTTL: 0,
      });

      await registry.load();

      expect(mockFetch).toHaveBeenCalledWith(customRemotePath);
    });
  });

  describe('stats with never synced', () => {
    afterEach(async () => {
      try {
        await fs.unlink(testRegistryPath);
      } catch {
        // Ignore
      }
    });

    it('should show Never for lastSync when not synced', async () => {
      await fs.writeFile(testRegistryPath, JSON.stringify(testRegistry, null, 2));

      const registry = new RegistryManager({
        localPath: testRegistryPath,
        autoSync: false,
      });

      await registry.load();
      const stats = registry.getStats();

      expect(stats.lastSync).toBe('Never');
    });
  });
});
