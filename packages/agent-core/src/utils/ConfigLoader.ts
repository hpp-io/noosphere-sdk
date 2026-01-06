import { readFileSync } from 'fs';
import { ethers } from 'ethers';
import type { NoosphereAgentConfig, ContainerMetadata } from '../types';

export class ConfigLoader {
  /**
   * Load agent configuration from JSON file
   */
  static loadFromFile(configPath: string): NoosphereAgentConfig {
    try {
      const configData = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData) as NoosphereAgentConfig;

      // Validate required fields
      if (!config.chain || !config.chain.enabled) {
        throw new Error('Chain configuration is required and must be enabled');
      }

      if (!config.chain.rpcUrl) {
        throw new Error('Chain RPC URL is required');
      }

      if (!config.chain.routerAddress) {
        throw new Error('Router address is required');
      }

      if (!config.containers || config.containers.length === 0) {
        console.warn('⚠️  No containers configured in config file');
      }

      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Config file not found: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Convert ContainerConfig to ContainerMetadata format
   */
  static containerConfigToMetadata(
    containerConfig: NoosphereAgentConfig['containers'][0]
  ): ContainerMetadata {
    // Parse image name and tag
    const [imageName, tag] = containerConfig.image.includes(':')
      ? containerConfig.image.split(':')
      : [containerConfig.image, 'latest'];

    // Extract container name from image (last part after /)
    const name = imageName.split('/').pop() || containerConfig.id;

    // Convert acceptedPayments to payments format
    let payments: ContainerMetadata['payments'] | undefined;
    if (containerConfig.acceptedPayments) {
      const basePrice = Object.values(containerConfig.acceptedPayments)[0]?.toString() || '0';
      payments = {
        basePrice,
        unit: 'wei',
        per: 'execution',
      };
    }

    return {
      id: containerConfig.id,
      name,
      image: imageName,
      tag,
      port: containerConfig.port,
      env: containerConfig.env,
      verified: !!containerConfig.verifierAddress,
      payments,
    };
  }

  /**
   * Get all containers from config as ContainerMetadata array
   */
  static getContainersFromConfig(config: NoosphereAgentConfig): Map<string, ContainerMetadata> {
    const containersMap = new Map<string, ContainerMetadata>();

    for (const containerConfig of config.containers) {
      const metadata = this.containerConfigToMetadata(containerConfig);
      // Hash the container ID the same way as the smart contract does:
      // keccak256(abi.encode(containerId))
      const containerIdHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['string'], [containerConfig.id])
      );
      containersMap.set(containerIdHash, metadata);
    }

    return containersMap;
  }

  /**
   * Get container config by ID
   */
  static getContainerConfig(
    config: NoosphereAgentConfig,
    containerId: string
  ): NoosphereAgentConfig['containers'][0] | undefined {
    return config.containers.find((c) => c.id === containerId);
  }
}
