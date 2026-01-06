import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import type { ContainerMetadata, VerifierMetadata, RegistryConfig, RegistryIndex } from './types';

export class RegistryManager {
  private containers = new Map<string, ContainerMetadata>();
  private verifiers = new Map<string, VerifierMetadata>();
  private config: Required<RegistryConfig>;
  private lastSync: number = 0;

  constructor(config: RegistryConfig = {}) {
    this.config = {
      localPath: config.localPath || path.join(process.cwd(), '.noosphere', 'registry.json'),
      remotePath:
        config.remotePath ||
        'https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json',
      autoSync: config.autoSync ?? true,
      cacheTTL: config.cacheTTL || 3600000, // 1 hour default
    };
  }

  /**
   * Load registry from local and optionally sync from remote
   */
  async load(): Promise<void> {
    // Load local registry
    await this.loadLocal();

    // Sync from remote if enabled
    if (this.config.autoSync) {
      try {
        await this.sync();
      } catch (error) {
        console.warn('Failed to sync remote registry:', error);
        console.log('Continuing with local registry only');
      }
    }

    console.log(`✓ Loaded ${this.containers.size} containers and ${this.verifiers.size} verifiers`);
  }

  /**
   * Load local registry file
   */
  private async loadLocal(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.localPath, 'utf-8');
      const registry: RegistryIndex = JSON.parse(data);

      // Load containers
      Object.entries(registry.containers || {}).forEach(([id, metadata]) => {
        this.containers.set(id, metadata);
      });

      // Load verifiers
      Object.entries(registry.verifiers || {}).forEach(([id, metadata]) => {
        this.verifiers.set(id, metadata);
      });

      console.log(`✓ Loaded local registry from ${this.config.localPath}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('No local registry found, will create default');
        await this.createDefaultRegistry();
      } else {
        throw error;
      }
    }
  }

  /**
   * Sync registry from remote GitHub repository
   */
  async sync(): Promise<void> {
    const now = Date.now();

    // Check cache TTL
    if (now - this.lastSync < this.config.cacheTTL) {
      console.log('Registry cache is fresh, skipping sync');
      return;
    }

    console.log(`Syncing registry from ${this.config.remotePath}...`);

    try {
      const response = await fetch(this.config.remotePath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const registry = (await response.json()) as RegistryIndex;

      // Merge remote registry (remote entries are added, local overrides are kept)
      Object.entries(registry.containers || {}).forEach(([id, metadata]) => {
        if (!this.containers.has(id)) {
          // Only add if not already in local registry (local takes precedence)
          this.containers.set(id, metadata);
        }
      });

      Object.entries(registry.verifiers || {}).forEach(([id, metadata]) => {
        if (!this.verifiers.has(id)) {
          this.verifiers.set(id, metadata);
        }
      });

      this.lastSync = now;
      console.log(`✓ Synced registry (version: ${registry.version})`);
    } catch (error) {
      console.error('Failed to sync remote registry:', error);
      throw error;
    }
  }

  /**
   * Get container by ID
   */
  getContainer(id: string): ContainerMetadata | undefined {
    return this.containers.get(id);
  }

  /**
   * Get all containers
   */
  listContainers(): ContainerMetadata[] {
    return Array.from(this.containers.values()).filter((c) => c.statusCode === 'ACTIVE');
  }

  /**
   * Search containers by name or tag
   */
  searchContainers(query: string): ContainerMetadata[] {
    const lowerQuery = query.toLowerCase();
    return this.listContainers().filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description?.toLowerCase().includes(lowerQuery) ||
        c.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get verifier by contract address
   */
  getVerifier(verifierAddress: string): VerifierMetadata | undefined {
    return this.verifiers.get(verifierAddress);
  }

  /**
   * Get verifier by ID
   */
  getVerifierById(id: string): VerifierMetadata | undefined {
    return Array.from(this.verifiers.values()).find((v) => v.id === id);
  }

  /**
   * Get all verifiers
   */
  listVerifiers(): VerifierMetadata[] {
    return Array.from(this.verifiers.values()).filter((v) => v.statusCode === 'ACTIVE');
  }

  /**
   * Add custom container to local registry
   */
  async addContainer(container: ContainerMetadata): Promise<void> {
    this.containers.set(container.id, container);
    await this.saveLocal();
    console.log(`✓ Added container: ${container.name} (${container.id})`);
  }

  /**
   * Add custom verifier to local registry
   */
  async addVerifier(verifier: VerifierMetadata): Promise<void> {
    this.verifiers.set(verifier.verifierAddress, verifier);
    await this.saveLocal();
    console.log(`✓ Added verifier: ${verifier.name} (${verifier.verifierAddress})`);
  }

  /**
   * Remove container from local registry
   */
  async removeContainer(id: string): Promise<void> {
    if (this.containers.delete(id)) {
      await this.saveLocal();
      console.log(`✓ Removed container: ${id}`);
    }
  }

  /**
   * Remove verifier from local registry
   */
  async removeVerifier(verifierAddress: string): Promise<void> {
    if (this.verifiers.delete(verifierAddress)) {
      await this.saveLocal();
      console.log(`✓ Removed verifier: ${verifierAddress}`);
    }
  }

  /**
   * Save local registry to disk
   */
  private async saveLocal(): Promise<void> {
    const registry: RegistryIndex = {
      containers: Object.fromEntries(this.containers),
      verifiers: Object.fromEntries(this.verifiers),
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
    };

    await fs.mkdir(path.dirname(this.config.localPath), { recursive: true });
    await fs.writeFile(this.config.localPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Create default registry with example entries
   */
  private async createDefaultRegistry(): Promise<void> {
    // Create empty registry - will be populated from remote sync
    // No default containers or verifiers
    await this.saveLocal();
    console.log('✓ Created empty local registry (will sync from remote)');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalContainers: number;
    activeContainers: number;
    totalVerifiers: number;
    activeVerifiers: number;
    lastSync: string;
  } {
    return {
      totalContainers: this.containers.size,
      activeContainers: this.listContainers().length,
      totalVerifiers: this.verifiers.size,
      activeVerifiers: this.listVerifiers().length,
      lastSync: this.lastSync ? new Date(this.lastSync).toISOString() : 'Never',
    };
  }
}
