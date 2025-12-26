/**
 * Example: Using Keystore, WalletManager, and RegistryManager
 *
 * This example demonstrates the RECOMMENDED keystore-based approach:
 * 1. Initializing keystore with EOA (first-time setup)
 * 2. Creating payment wallets (EOA and WalletFactory)
 * 3. Loading and using the Container/Verifier registry
 * 4. Funding wallets and checking balances
 */

import { ethers } from 'ethers';
import { WalletManager, KeystoreManager } from '@noosphere/crypto';
import { RegistryManager } from '@noosphere/registry';

async function main() {
  // ============================================
  // 1. Setup Provider and Initialize Keystore
  // ============================================
  const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/YOUR_KEY');
  const keystorePath = './.noosphere/keystore.json';
  const password = 'secure-password-here';

  // First-time setup: Initialize keystore with EOA
  // In production, you would only do this once
  const privateKey = '0x' + '1'.repeat(64); // Replace with actual key

  console.log('Initializing keystore...');
  const keystoreManager = await KeystoreManager.initialize(
    keystorePath,
    password,
    privateKey,
    provider
  );

  // Initialize WalletManager from keystore (RECOMMENDED)
  const walletManager = await WalletManager.fromKeystoreManager(
    keystoreManager,
    provider
  );

  console.log('Agent Wallet:', walletManager.getAddress());
  const balance = await walletManager.getBalance();
  console.log('Balance:', ethers.formatEther(balance), 'ETH\n');

  // ============================================
  // 2. Create Payment Wallet using WalletFactory
  // ============================================
  const walletFactoryAddress = '0x...'; // Replace with actual WalletFactory address
  const subscriptionOwner = '0x...'; // Replace with actual owner address

  console.log('Creating payment wallet...');
  const { walletAddress, txHash } = await walletManager.createPaymentWallet(
    walletFactoryAddress,
    subscriptionOwner
  );

  console.log('✓ Payment Wallet Created:', walletAddress);
  console.log('  Transaction:', txHash);

  // Verify wallet was created by factory
  const isValid = await walletManager.isValidWallet(walletFactoryAddress, walletAddress);
  console.log('  Is Valid Wallet:', isValid, '\n');

  // ============================================
  // 3. Fund the Payment Wallet
  // ============================================
  console.log('Funding payment wallet with 0.1 ETH...');
  const fundTxHash = await walletManager.fundWallet(walletAddress, '0.1');
  console.log('✓ Funded! Transaction:', fundTxHash);

  const walletBalance = await walletManager.getWalletBalance(walletAddress);
  console.log('  Wallet Balance:', ethers.formatEther(walletBalance), 'ETH\n');

  // ============================================
  // 4. Create EOA Payment Wallet (Saved to Keystore)
  // ============================================
  console.log('Creating EOA payment wallet...');
  const { walletAddress: eoaWallet, privateKey: eoaKey } =
    await walletManager.createEOAPaymentWallet('subscription-123');

  console.log('✓ EOA Payment Wallet Created:', eoaWallet);
  console.log('  ⚠️  This wallet is automatically saved to keystore');

  // ============================================
  // 5. Load Registry Manager
  // ============================================
  console.log('Loading Container/Verifier registry...');
  const registry = new RegistryManager({
    autoSync: true,
    cacheTTL: 3600000, // 1 hour
  });

  await registry.load();

  const stats = registry.getStats();
  console.log('Registry Stats:', stats);

  // ============================================
  // 6. Search and List Containers
  // ============================================
  console.log('\n=== Available Containers ===');
  const allContainers = registry.listContainers();
  allContainers.forEach((container) => {
    console.log(`- ${container.name}`);
    console.log(`  Image: ${container.imageName}`);
    if (container.requirements) {
      console.log(`  Requirements:`, container.requirements);
    }
    if (container.payments) {
      console.log(`  Base Price: ${container.payments.basePrice} ${container.payments.token}`);
    }
    console.log();
  });

  // ============================================
  // 7. Search for AI Containers
  // ============================================
  console.log('=== AI Containers ===');
  const aiContainers = registry.searchContainers('ai');
  aiContainers.forEach((container) => {
    console.log(`- ${container.name}: ${container.description}`);
  });

  // ============================================
  // 8. Get Specific Container
  // ============================================
  const containerId = '0x0000000000000000000000000000000000000000000000000000000000000002';
  const container = registry.getContainer(containerId);

  if (container) {
    console.log('\n=== Stable Diffusion XL ===');
    console.log('Name:', container.name);
    console.log('Image:', container.imageName);
    console.log('GPU Required:', container.requirements?.gpu);
    console.log('Memory:', container.requirements?.memory);
  }

  // ============================================
  // 9. List Verifiers
  // ============================================
  console.log('\n=== Available Verifiers ===');
  const verifiers = registry.listVerifiers();
  verifiers.forEach((verifier) => {
    console.log(`- ${verifier.name}`);
    console.log(`  Address: ${verifier.verifierAddress}`);
    console.log(`  Description: ${verifier.description}`);
    console.log();
  });

  // ============================================
  // 10. Add Custom Container
  // ============================================
  console.log('=== Adding Custom Container ===');
  await registry.addContainer({
    id: '0x9999999999999999999999999999999999999999999999999999999999999999',
    name: 'my-custom-model',
    imageName: 'myrepo/my-model',
    port: 8000,
    requirements: {
      gpu: true,
      memory: '8GB',
      cpu: 4,
    },
    statusCode: 'ACTIVE',
    description: 'My custom AI model for testing',
    tags: ['ai', 'custom', 'test'],
  });

  console.log('✓ Custom container added to local registry');

  // ============================================
  // 11. Load Wallet from Keystore (Subsequent Sessions)
  // ============================================
  console.log('\n=== Loading Wallet from Keystore ===');
  console.log('In subsequent sessions, load the keystore instead of creating a new one:');
  console.log('  const ks = new KeystoreManager(keystorePath, password);');
  console.log('  await ks.load();');
  console.log('  const wm = await WalletManager.fromKeystoreManager(ks, provider);');

  // List payment wallets stored in keystore
  const paymentWallets = walletManager.listPaymentWallets();
  console.log('\n✓ Payment wallets in keystore:', paymentWallets.length);
  paymentWallets.forEach((wallet) => {
    console.log(`  - ${wallet.address} (subscription: ${wallet.subscriptionId || 'N/A'})`);
  });

  // ============================================
  // 12. Get Deterministic Payment Wallet
  // ============================================
  console.log('\n=== Deterministic Payment Wallet ===');
  const subscriptionId = 1n;
  const deterministicWallet = await walletManager.getDeterministicPaymentWallet(
    subscriptionId
  );

  console.log('Subscription ID:', subscriptionId.toString());
  console.log('Deterministic Wallet:', deterministicWallet);
  console.log('(Same wallet will always be generated for this subscription ID)');

  console.log('\n✅ Example completed successfully!');
}

// Run example
main().catch(console.error);
