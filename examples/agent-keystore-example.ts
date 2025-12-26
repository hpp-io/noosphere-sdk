/**
 * Example: NoosphereAgent with Keystore-Based Initialization
 *
 * This demonstrates the RECOMMENDED way to initialize and run a Noosphere agent:
 * 1. First-time setup: Initialize keystore with EOA
 * 2. Subsequent runs: Load agent from keystore
 * 3. Agent automatically uses keystore for all wallet operations
 */

import { NoosphereAgent } from '@noosphere/agent-core';
import { KeystoreManager } from '@noosphere/crypto';
import { RegistryManager } from '@noosphere/registry';
import { ethers } from 'ethers';

// ============================================
// Configuration
// ============================================
const CONFIG = {
  keystorePath: './.noosphere/keystore.json',
  password: process.env.KEYSTORE_PASSWORD || 'secure-password-here',
  rpcUrl: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY',
  wsRpcUrl: process.env.WS_RPC_URL || 'wss://sepolia.infura.io/ws/v3/YOUR_KEY',
  routerAddress: '0x...',
  coordinatorAddress: '0x...',
  deploymentBlock: 0,
};

// ============================================
// First-Time Setup Function
// ============================================
async function firstTimeSetup(): Promise<void> {
  console.log('=== First-Time Setup ===\n');

  const privateKey = process.env.PRIVATE_KEY || '0x' + '1'.repeat(64);
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  // Initialize keystore with EOA
  console.log('Initializing keystore...');
  await KeystoreManager.initialize(
    CONFIG.keystorePath,
    CONFIG.password,
    privateKey,
    provider
  );

  console.log('✓ Keystore created successfully!');
  console.log(`  Location: ${CONFIG.keystorePath}`);
  console.log('  ⚠️  IMPORTANT: Back up this file and password securely!\n');
}

// ============================================
// Main Agent Function (Subsequent Runs)
// ============================================
async function runAgent(): Promise<void> {
  console.log('=== Starting Noosphere Agent ===\n');

  // Load container registry
  console.log('Loading container registry...');
  const registry = new RegistryManager({
    autoSync: true,
    cacheTTL: 3600000, // 1 hour
  });
  await registry.load();

  const stats = registry.getStats();
  console.log(`✓ Registry loaded: ${stats.totalContainers} containers, ${stats.totalVerifiers} verifiers\n`);

  // Load Router and Coordinator ABIs (in production, load from files)
  const routerAbi = [
    'event RequestStarted(bytes32 indexed requestId, uint256 indexed subscriptionId, bytes32 containerId, uint256 interval, uint8 redundancy, bool useDeliveryInbox, uint256 feeAmount, address feeToken, address verifier, address coordinator)',
  ];

  const coordinatorAbi = [
    'function redundancyCount(bytes32 requestId) view returns (uint8)',
    'function fulfill(bytes32 requestId, bytes memory result, bytes memory proof) external returns (uint8)',
  ];

  // Initialize agent from keystore (RECOMMENDED)
  console.log('Loading agent from keystore...');
  const agent = await NoosphereAgent.fromKeystore(
    CONFIG.keystorePath,
    CONFIG.password,
    {
      config: {
        rpcUrl: CONFIG.rpcUrl,
        wsRpcUrl: CONFIG.wsRpcUrl,
        routerAddress: CONFIG.routerAddress,
        coordinatorAddress: CONFIG.coordinatorAddress,
        deploymentBlock: CONFIG.deploymentBlock,
      },
      routerAbi,
      coordinatorAbi,
      getContainer: (containerId: string) => registry.getContainer(containerId),
    }
  );

  console.log('✓ Agent initialized from keystore\n');

  // Start the agent
  await agent.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// ============================================
// Main Entry Point
// ============================================
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--init')) {
    // First-time setup
    await firstTimeSetup();
  } else {
    // Normal operation
    await runAgent();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Usage:
 *
 * First-time setup:
 *   PRIVATE_KEY=0x... node agent-keystore-example.ts --init
 *
 * Subsequent runs:
 *   KEYSTORE_PASSWORD=your-password node agent-keystore-example.ts
 *
 * Environment variables:
 *   - PRIVATE_KEY: Your EOA private key (only needed for --init)
 *   - KEYSTORE_PASSWORD: Password to unlock keystore
 *   - RPC_URL: Ethereum RPC endpoint
 *   - WS_RPC_URL: WebSocket RPC endpoint
 */
