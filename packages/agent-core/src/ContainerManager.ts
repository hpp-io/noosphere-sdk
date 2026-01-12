import Docker from 'dockerode';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import type { ContainerMetadata } from './types';

export interface ContainerExecutionResult {
  output: string;
  exitCode: number;
  executionTime: number;
}

export class ContainerManager {
  private docker: Docker;
  private runningContainers: Set<Docker.Container> = new Set();
  private persistentContainers: Map<string, Docker.Container> = new Map();
  private containerPorts: Map<string, number> = new Map();

  constructor() {
    this.docker = new Docker();
  }

  async runContainer(
    container: ContainerMetadata,
    input: string,
    timeout: number = 300000 // 5 minutes default
  ): Promise<ContainerExecutionResult> {
    const startTime = Date.now();

    try {
      // Get the port for this container
      // We need to find the container ID from the metadata
      // Since we don't have a direct mapping from metadata to ID, we'll use the port from metadata
      const port = container.port ? parseInt(container.port) : 8081; // Default to 8081

      // Make HTTP POST request to the persistent container
      // Use container name as host when DOCKER_NETWORK is set (DinD), otherwise localhost
      // Note: container.name is the short name like "noosphere-hello-world", not the blockchain hash
      const containerHost = process.env.DOCKER_NETWORK
        ? `noosphere-${container.name}`
        : 'localhost';
      const url = `http://${containerHost}:${port}/computation`;

      // Prepare request body
      // Try to parse input as JSON and merge with { input: ... }
      let requestBody: any;
      try {
        const parsedInput = JSON.parse(input);
        // If input is valid JSON, merge it with { input: originalString }
        requestBody = { input: input, ...parsedInput };
      } catch {
        // Not JSON, just wrap in { input: ... }
        requestBody = { input: input };
      }

      const response = await axios.post(url, requestBody, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const executionTime = Date.now() - startTime;

      // Extract output from response
      // Handle both JSON responses with {output: "..."} and plain text responses
      let output: string;
      if (typeof response.data === 'string') {
        // Plain text response (e.g., LLM containers)
        output = response.data;
      } else if (response.data.output !== undefined) {
        // JSON response with output field
        output =
          typeof response.data.output === 'string'
            ? response.data.output
            : JSON.stringify(response.data.output);
      } else {
        // Fallback: stringify the entire response
        output = JSON.stringify(response.data);
      }

      return {
        output,
        exitCode: 0,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Handle HTTP errors
      if (error.response) {
        throw new Error(
          `Container HTTP error ${error.response.status}: ${JSON.stringify(error.response.data)}`
        );
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to container (port ${container.port || 8081}). Is it running?`
        );
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new Error(`Container execution timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  private async collectContainerResult(
    dockerContainer: Docker.Container,
    workDir: string,
    startTime: number
  ): Promise<ContainerExecutionResult> {
    try {
      // Get exit status
      const inspectData = await dockerContainer.inspect();
      const exitCode = inspectData.State.ExitCode || 0;

      // Read output
      const outputPath = path.join(workDir, 'output.json');
      let output = '';
      try {
        output = await fs.readFile(outputPath, 'utf-8');
      } catch (error) {
        // If no output file, try to get container logs
        const logs = await dockerContainer.logs({
          stdout: true,
          stderr: true,
        });
        output = logs.toString();
      }

      const executionTime = Date.now() - startTime;

      // Remove the container now that we've collected results
      try {
        await dockerContainer.remove({ force: true });
      } catch (error) {
        // Container might already be removed, ignore
      }

      // Cleanup work directory
      await fs.rm(workDir, { recursive: true, force: true });

      return {
        output,
        exitCode,
        executionTime,
      };
    } catch (error) {
      // Cleanup container and work directory on error
      try {
        await dockerContainer.remove({ force: true });
      } catch {
        // Ignore removal errors
      }
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  private async pullImage(image: string, tag: string): Promise<void> {
    const imageTag = `${image}:${tag}`;

    try {
      // Check if image exists
      await this.docker.getImage(imageTag).inspect();
      console.log(`Image ${imageTag} already exists`);
    } catch {
      // Image doesn't exist, pull it
      console.log(`Pulling image ${imageTag}...`);

      return new Promise((resolve, reject) => {
        this.docker.pull(imageTag, (err: any, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);

          this.docker.modem.followProgress(
            stream,
            (err: any) => {
              if (err) return reject(err);
              console.log(`✓ Pulled image ${imageTag}`);
              resolve();
            },
            (event: any) => {
              // Progress update
              if (event.status) {
                console.log(`${event.status} ${event.progress || ''}`);
              }
            }
          );
        });
      });
    }
  }

  private async waitForContainer(container: Docker.Container): Promise<any> {
    return new Promise((resolve, reject) => {
      container.wait((err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }

  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  private parseMemory(memory: string): number {
    const units: { [key: string]: number } = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024,
    };

    const match = memory.toLowerCase().match(/^(\d+)\s*(b|kb|mb|gb)$/);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }

  async checkDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async getDockerInfo(): Promise<any> {
    return this.docker.info();
  }

  /**
   * Cleanup all running containers
   * Called when agent is shutting down
   */
  async cleanup(): Promise<void> {
    if (this.runningContainers.size === 0) {
      return;
    }

    console.log(`🧹 Cleaning up ${this.runningContainers.size} running containers...`);

    const cleanupPromises = Array.from(this.runningContainers).map(async (container) => {
      try {
        const inspect = await container.inspect();
        if (inspect.State.Running) {
          console.log(`  Stopping container ${inspect.Id.slice(0, 12)}...`);
          await container.stop({ t: 10 }); // 10 second grace period
          await container.remove({ force: true });
        }
      } catch (error) {
        // Container might already be stopped/removed
        console.warn(`  Warning: Failed to cleanup container:`, (error as Error).message);
      }
    });

    await Promise.all(cleanupPromises);
    this.runningContainers.clear();
    console.log('✓ Container cleanup completed');
  }

  /**
   * Get number of running containers
   */
  getRunningContainerCount(): number {
    return this.runningContainers.size;
  }

  /**
   * Pre-pull container images and start persistent containers on startup
   * This speeds up request handling by having containers ready
   */
  async prepareContainers(containers: Map<string, ContainerMetadata>): Promise<void> {
    if (containers.size === 0) {
      console.log('No containers to prepare');
      return;
    }

    console.log(`\n🚀 Preparing ${containers.size} containers...`);

    const pullAndStartPromises = Array.from(containers.entries()).map(async ([id, container]) => {
      const imageTag = `${container.image}:${container.tag || 'latest'}`;

      try {
        console.log(`  Pulling ${imageTag}...`);
        await this.pullImage(container.image, container.tag || 'latest');
        console.log(`  ✓ ${imageTag} ready`);
      } catch (error) {
        console.error(`  ❌ Failed to pull ${imageTag}:`, (error as Error).message);
        // Skip container start if pull failed
        return;
      }

      try {
        // Start persistent container
        await this.startPersistentContainer(id, container);
      } catch (error) {
        console.error(`  ❌ Failed to start ${container.name || container.image}:`, (error as Error).message);
      }
    });

    await Promise.all(pullAndStartPromises);
    console.log('✓ All containers prepared\n');
  }

  /**
   * Start a persistent container that stays running
   */
  private async startPersistentContainer(
    containerId: string,
    metadata: ContainerMetadata
  ): Promise<void> {
    // Use metadata.name for Docker container name (human-readable)
    // This matches the hostname used in runContainer()
    const containerName = `noosphere-${metadata.name}`;
    const imageTag = `${metadata.image}:${metadata.tag || 'latest'}`;

    // Check if container already exists
    const existingContainer = this.docker.getContainer(containerName);
    try {
      const inspect = await existingContainer.inspect();
      if (inspect.State.Running) {
        console.log(`  ✓ Container ${containerName} already running`);
        this.persistentContainers.set(containerId, existingContainer);
        return;
      } else {
        // Container exists but stopped - try to start it
        try {
          await existingContainer.start();
          console.log(`  ✓ Started existing container ${containerName}`);
          this.persistentContainers.set(containerId, existingContainer);
          return;
        } catch (startErr) {
          // Failed to start, remove and recreate
          console.log(`  Removing stopped container ${containerName} to recreate...`);
          await existingContainer.remove({ force: true });
        }
      }
    } catch (err) {
      // Container doesn't exist, will create new one
    }

    // Create new persistent container
    const dockerNetwork = process.env.DOCKER_NETWORK;
    const createOptions: Docker.ContainerCreateOptions = {
      name: containerName,
      Image: imageTag,
      Tty: false,
      AttachStdout: false,
      AttachStderr: false,
      ExposedPorts: metadata.port ? { [`${metadata.port}/tcp`]: {} } : undefined,
      HostConfig: {
        AutoRemove: false, // Keep container for reuse
        // Only bind ports to host when not using Docker network (local dev)
        PortBindings:
          metadata.port && !dockerNetwork
            ? {
                [`${metadata.port}/tcp`]: [{ HostPort: metadata.port }],
              }
            : undefined,
        // Join the specified Docker network for DinD communication
        NetworkMode: dockerNetwork || undefined,
      },
      Env: metadata.env ? Object.entries(metadata.env).map(([k, v]) => `${k}=${v}`) : undefined,
    };

    // Add resource limits
    if (metadata.requirements) {
      const resources: any = {};

      if (metadata.requirements.memory) {
        resources.Memory = this.parseMemory(metadata.requirements.memory);
      }

      if (metadata.requirements.cpu) {
        resources.NanoCpus = metadata.requirements.cpu * 1e9;
      }

      if (metadata.requirements.gpu) {
        createOptions.HostConfig!.DeviceRequests = [
          {
            Driver: 'nvidia',
            Count: -1,
            Capabilities: [['gpu']],
          },
        ];
      }

      if (Object.keys(resources).length > 0) {
        createOptions.HostConfig = {
          ...createOptions.HostConfig,
          ...resources,
        };
      }
    }

    const dockerContainer = await this.docker.createContainer(createOptions);
    await dockerContainer.start();

    this.persistentContainers.set(containerId, dockerContainer);
    if (metadata.port) {
      this.containerPorts.set(containerId, parseInt(metadata.port));
    }

    console.log(`  ✓ Started persistent container ${containerName}`);
  }

  /**
   * Stop and remove all persistent containers
   */
  async stopPersistentContainers(): Promise<void> {
    if (this.persistentContainers.size === 0) {
      return;
    }

    console.log(`\n🛑 Stopping ${this.persistentContainers.size} persistent containers...`);

    const stopPromises = Array.from(this.persistentContainers.entries()).map(
      async ([id, container]) => {
        try {
          const inspect = await container.inspect();
          if (inspect.State.Running) {
            console.log(`  Stopping ${inspect.Name}...`);
            await container.stop({ t: 10 });
          }
          await container.remove({ force: true });
          console.log(`  ✓ Stopped ${inspect.Name}`);
        } catch (error) {
          console.warn(`  Warning: Failed to stop container ${id}:`, (error as Error).message);
        }
      }
    );

    await Promise.all(stopPromises);
    this.persistentContainers.clear();
    this.containerPorts.clear();
    console.log('✓ All persistent containers stopped\n');
  }
}
