/**
 * Noosphere SDK Quickstart Example
 *
 * This example demonstrates the complete SDK workflow:
 * 1. Keystore initialization (first-time setup)
 * 2. Wallet management (EOA and payment wallets)
 * 3. Registry usage (containers and verifiers)
 * 4. Agent execution
 *
 * Usage:
 *   First-time setup:  PRIVATE_KEY=0x... npx ts-node quickstart.ts --init
 *   Run agent:         KEYSTORE_PASSWORD=xxx npx ts-node quickstart.ts --agent
 *   Demo wallet/registry: npx ts-node quickstart.ts --demo
 */

import { ethers } from 'ethers';
import { NoosphereAgent } from '@noosphere/agent-core';
import { KeystoreManager, WalletManager } from '@noosphere/crypto';
import { RegistryManager } from '@noosphere/registry';

// ============================================
// Configuration
// ============================================
const CONFIG = {
  keystorePath: './.noosphere/keystore.json',
  password: process.env.KEYSTORE_PASSWORD || 'demo-password',
  rpcUrl: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY',
  wsRpcUrl: process.env.WS_RPC_URL || 'wss://sepolia.infura.io/ws/v3/YOUR_KEY',
  routerAddress: process.env.ROUTER_ADDRESS || '0x...',
  coordinatorAddress: process.env.COORDINATOR_ADDRESS || '0x...',
  walletFactoryAddress: process.env.WALLET_FACTORY_ADDRESS || '0x...',
};

// ============================================
// 1. First-Time Setup
// ============================================
async function initKeystore(): Promise<void> {
  console.log('=== Keystore Initialization ===\n');

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  console.log('Creating keystore...');
  await KeystoreManager.initialize(
    CONFIG.keystorePath,
    CONFIG.password,
    privateKey,
    provider
  );

  console.log('✓ Keystore created:', CONFIG.keystorePath);
  console.log('  Back up this file and password securely!\n');
}

// ============================================
// 2. Wallet & Registry Demo
// ============================================
async function runDemo(): Promise<void> {
  console.log('=== Wallet & Registry Demo ===\n');

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  // Load keystore
  const keystoreManager = new KeystoreManager(CONFIG.keystorePath, CONFIG.password);
  await keystoreManager.load();

  // Initialize WalletManager
  const walletManager = await WalletManager.fromKeystoreManager(keystoreManager, provider);
  console.log('Agent Address:', walletManager.getAddress());

  const balance = await walletManager.getBalance();
  console.log('Balance:', ethers.formatEther(balance), 'ETH\n');

  // --- Payment Wallets ---
  console.log('--- Payment Wallets ---');

  // Create EOA payment wallet (saved to keystore)
  const { walletAddress } = await walletManager.createEOAPaymentWallet('sub-001');
  console.log('Created EOA wallet:', walletAddress);

  // List wallets in keystore
  const wallets = walletManager.listPaymentWallets();
  console.log('Wallets in keystore:', wallets.length);
  wallets.forEach(w => console.log(`  - ${w.address} (${w.subscriptionId || 'N/A'})`));

  // Deterministic wallet
  const deterministicWallet = await walletManager.getDeterministicPaymentWallet(BigInt(1));
  console.log('Deterministic wallet for sub #1:', deterministicWallet, '\n');

  // --- Registry ---
  console.log('--- Registry ---');

  const registry = new RegistryManager({ autoSync: true, cacheTTL: 3600000 });
  await registry.load();

  const stats = registry.getStats();
  console.log(`Loaded: ${stats.totalContainers} containers, ${stats.totalVerifiers} verifiers\n`);

  // List containers
  console.log('Containers:');
  registry.listContainers().forEach(c => {
    console.log(`  - ${c.name} (${c.imageName})`);
    if (c.requirements?.gpu) console.log(`    GPU: ${c.requirements.memory}`);
  });

  // Search
  console.log('\nAI containers:');
  registry.searchContainers('ai').forEach(c => console.log(`  - ${c.name}`));

  // List verifiers
  console.log('\nVerifiers:');
  registry.listVerifiers().forEach(v => {
    console.log(`  - ${v.name} (${v.verifierAddress})`);
  });

  console.log('\n✓ Demo completed');
}

// ============================================
// 3. Run Agent
// ============================================
async function runAgent(): Promise<void> {
  console.log('=== Starting Noosphere Agent ===\n');

  // Load registry
  const registry = new RegistryManager({ autoSync: true, cacheTTL: 3600000 });
  await registry.load();
  console.log('Registry loaded');

  // ABIs (in production, load from @noosphere/contracts)
  const routerAbi = [
    'event RequestStarted(bytes32 indexed requestId, uint256 indexed subscriptionId, bytes32 containerId, uint256 interval, uint8 redundancy, bool useDeliveryInbox, uint256 feeAmount, address feeToken, address verifier, address coordinator)',
  ];
  const coordinatorAbi = [
    'function redundancyCount(bytes32 requestId) view returns (uint8)',
    'function fulfill(bytes32 requestId, bytes memory result, bytes memory proof) external returns (uint8)',
  ];

  // Initialize agent from keystore
  const agent = await NoosphereAgent.fromKeystore(
    CONFIG.keystorePath,
    CONFIG.password,
    {
      config: {
        rpcUrl: CONFIG.rpcUrl,
        wsRpcUrl: CONFIG.wsRpcUrl,
        routerAddress: CONFIG.routerAddress,
        coordinatorAddress: CONFIG.coordinatorAddress,
        deploymentBlock: 0,
      },
      routerAbi,
      coordinatorAbi,
      getContainer: (id: string) => {
        const c = registry.getContainer(id);
        if (!c) return undefined;
        // Convert registry ContainerMetadata to agent-core ContainerMetadata
        return {
          id: c.id,
          name: c.name,
          image: c.imageName,
          port: c.port?.toString(),
          env: c.env,
          requirements: c.requirements,
          verified: c.verified,
        };
      },
    }
  );

  console.log('Agent initialized\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await agent.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start
  await agent.start();
  await new Promise(() => {}); // Keep alive
}

// ============================================
// Main
// ============================================
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--init')) {
    await initKeystore();
  } else if (args.includes('--demo')) {
    await runDemo();
  } else if (args.includes('--agent')) {
    await runAgent();
  } else {
    console.log(`
Noosphere SDK Quickstart

Usage:
  npx ts-node quickstart.ts --init    Initialize keystore (requires PRIVATE_KEY env)
  npx ts-node quickstart.ts --demo    Demo wallet and registry APIs
  npx ts-node quickstart.ts --agent   Run the agent

Environment variables:
  PRIVATE_KEY          EOA private key (for --init)
  KEYSTORE_PASSWORD    Keystore password
  RPC_URL              Ethereum RPC endpoint
  WS_RPC_URL           WebSocket RPC endpoint
  ROUTER_ADDRESS       Router contract address
  COORDINATOR_ADDRESS  Coordinator contract address
`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
