# @noosphere/crypto

Cryptographic utilities and wallet management for Noosphere SDK.

This package provides secure keystore and wallet management functionality shared across agents, users, and verifiers.

## Features

- **KeystoreManager**: Secure storage for EOA and payment wallets
- **WalletManager**: Wallet operations and EIP-712 signing
- **Hub-Compatible**: Uses the same keystore structure as Noosphere Hub
- **Password-Protected**: AES-128-CTR encryption for EOA wallets
- **Payment Wallet Support**: Manage multiple payment wallets per subscription

## Installation

```bash
npm install @noosphere/crypto
```

## Usage

### Initialize Keystore (First Time)

```typescript
import { KeystoreManager } from '@noosphere/crypto';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/YOUR_KEY');

// First-time setup
const keystoreManager = await KeystoreManager.initialize(
  './.noosphere/keystore.json',
  'secure-password',
  '0x...your-private-key',
  provider
);
```

### Load Existing Keystore

```typescript
import { KeystoreManager, WalletManager } from '@noosphere/crypto';

// Load keystore
const keystoreManager = new KeystoreManager(
  './.noosphere/keystore.json',
  'secure-password'
);
await keystoreManager.load();

// Get EOA wallet
const provider = new ethers.JsonRpcProvider('...');
const wallet = await keystoreManager.getEOA(provider);

// Or use WalletManager
const walletManager = await WalletManager.fromKeystoreManager(
  keystoreManager,
  provider
);
```

### Payment Wallet Management

```typescript
// Create EOA payment wallet (automatically saved to keystore)
const { walletAddress } = await walletManager.createEOAPaymentWallet(
  'subscription-123'
);

// List all payment wallets
const wallets = walletManager.listPaymentWallets();
wallets.forEach(wallet => {
  console.log(`${wallet.address} - ${wallet.subscriptionId}`);
});

// Get specific payment wallet
const paymentWallet = await walletManager.getPaymentWallet(walletAddress);
```

### WalletFactory Integration

```typescript
// Create smart contract wallet via WalletFactory
const { walletAddress, txHash } = await walletManager.createPaymentWallet(
  walletFactoryAddress,
  subscriptionOwner
);

// Validate wallet
const isValid = await walletManager.isValidWallet(
  walletFactoryAddress,
  walletAddress
);
```

## API Reference

### KeystoreManager

#### Static Methods

- `initialize(keystorePath, password, privateKey, provider)` - Initialize new keystore
- `importKeystore(keystorePath, password, keystoreJson)` - Import keystore from backup

#### Instance Methods

- `load()` - Load existing keystore
- `getEOA(provider)` - Get decrypted EOA wallet
- `getEOAAddress()` - Get EOA address without decrypting
- `addPaymentWallet(address, privateKey, subscriptionId?, metadata?)` - Add payment wallet
- `getPaymentWallet(address, provider)` - Get payment wallet
- `listPaymentWallets()` - List all payment wallets
- `removePaymentWallet(address)` - Remove payment wallet
- `getInfo()` - Get keystore info without decrypting
- `hasPaymentWallet(address)` - Check if wallet exists
- `updateEOA(privateKey, provider)` - Update EOA
- `exportKeystore()` - Export for backup
- `changePassword(oldPassword, newPassword, provider)` - Change password

### WalletManager

#### Static Methods

- `fromKeystoreManager(keystoreManager, provider)` - **RECOMMENDED** initialization
- `fromKeystore(keystorePath, password, provider)` - Load from keystore file

#### Instance Methods

- `getAddress()` - Get wallet address
- `getWallet()` - Get wallet instance
- `getDeterministicPaymentWallet(subscriptionId)` - Generate deterministic wallet
- `signTypedData(domain, types, value)` - Sign EIP-712 data
- `getBalance()` - Get ETH balance
- `getTokenBalance(tokenAddress)` - Get ERC20 balance
- `createPaymentWallet(walletFactoryAddress, owner, subscriptionId?)` - Create via WalletFactory
- `createEOAPaymentWallet(subscriptionId?)` - Create EOA wallet
- `getPaymentWallet(address)` - Get payment wallet from keystore
- `listPaymentWallets()` - List payment wallets
- `isValidWallet(walletFactoryAddress, address)` - Validate factory wallet
- `fundWallet(address, amount)` - Fund wallet with ETH
- `getWalletBalance(address)` - Get wallet balance
- `toKeystore(password, outputPath)` - Save to keystore

## Types

### NoosphereKeystore

```typescript
interface NoosphereKeystore {
  version: string;
  eoa: {
    address: string;
    keystore: string; // Encrypted JSON
  };
  paymentWallets: {
    [address: string]: {
      address: string;
      privateKey: string; // Encrypted
      subscriptionId?: string;
      createdAt: string;
      metadata?: Record<string, any>;
    };
  };
  createdAt: string;
  updatedAt: string;
}
```

### PaymentWalletInfo

```typescript
interface PaymentWalletInfo {
  address: string;
  subscriptionId?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}
```

### KeystoreInfo

```typescript
interface KeystoreInfo {
  version: string;
  eoaAddress: string;
  paymentWalletCount: number;
  createdAt: string;
  updatedAt: string;
}
```

## Security

- **EOA Encryption**: Uses ethers.js native encryption (AES-128-CTR, PBKDF2)
- **Password Protection**: All wallets protected by password
- **No Plaintext Keys**: Private keys never stored in plaintext
- **Metadata Support**: Store additional info securely

## License

BSD-3-Clause-Clear
