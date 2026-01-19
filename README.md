# Noosphere SDK

> TypeScript SDK for building decentralized compute agents on the Noosphere protocol

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18.0.0-green)](https://nodejs.org/)

[![npm @noosphere/sdk](https://img.shields.io/npm/v/@noosphere/sdk.svg?label=@noosphere/sdk)](https://www.npmjs.com/package/@noosphere/sdk)
[![npm @noosphere/agent-core](https://img.shields.io/npm/v/@noosphere/agent-core.svg?label=@noosphere/agent-core)](https://www.npmjs.com/package/@noosphere/agent-core)
[![npm @noosphere/contracts](https://img.shields.io/npm/v/@noosphere/contracts.svg?label=@noosphere/contracts)](https://www.npmjs.com/package/@noosphere/contracts)
[![npm @noosphere/crypto](https://img.shields.io/npm/v/@noosphere/crypto.svg?label=@noosphere/crypto)](https://www.npmjs.com/package/@noosphere/crypto)
[![npm @noosphere/registry](https://img.shields.io/npm/v/@noosphere/registry.svg?label=@noosphere/registry)](https://www.npmjs.com/package/@noosphere/registry)

## Overview

Noosphere SDK enables you to build and run compute agents that participate in the Noosphere decentralized compute network. Deploy AI models, data processing pipelines, or custom compute workloads as containerized services and earn fees for processing requests.

### Key Features

- 🔐 **Secure Wallet Management** - Built-in keystore for EOA and payment wallets
- 🎯 **Type-Safe Contract Integration** - Auto-generated TypeScript types for all contracts
- 🐳 **Docker-Based Execution** - Run any containerized workload
- 📡 **Real-Time Event Monitoring** - WebSocket-first architecture with automatic fallback
- ♻️ **Event Replay** - Never miss events with automatic checkpointing
- 🔄 **Self-Coordination** - No central hub required

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker (for running compute containers)

### Installation

```bash
# Install all packages at once
npm install @noosphere/sdk

# Or install individual packages
npm install @noosphere/agent-core @noosphere/crypto @noosphere/contracts @noosphere/registry @noosphere/payload
```

### Basic Example

```typescript
import { NoosphereAgent } from '@noosphere/agent-core';
import { KeystoreManager } from '@noosphere/crypto';
import { ethers } from 'ethers';

// 1. Initialize keystore (first time only)
const keystoreManager = await KeystoreManager.initialize(
  './.noosphere/keystore.json',
  process.env.KEYSTORE_PASSWORD!,
  process.env.PRIVATE_KEY!,
  provider
);

// 2. Create agent
const agent = await NoosphereAgent.fromKeystore(
  './.noosphere/keystore.json',
  process.env.KEYSTORE_PASSWORD!,
  {
    config: {
      routerAddress: '0x...',
      coordinatorAddress: '0x...',
      rpcUrl: 'https://...',
      wsUrl: 'wss://...',
    },
    getContainer: async (containerId) => {
      // Return your container configuration
      return {
        image: 'my-compute-image:latest',
        command: ['python', 'process.py'],
      };
    },
  }
);

// 3. Start processing requests
await agent.start();
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  @noosphere/sdk (meta package - includes all below)     │
├─────────────────────────────────────────────────────────┤
│  @noosphere/agent-core                                  │
│    ├── NoosphereAgent    (orchestrator)                 │
│    ├── EventMonitor      (blockchain events)            │
│    └── ContainerManager  (Docker execution)             │
├─────────────────────────────────────────────────────────┤
│  @noosphere/payload      (browser & Node.js)            │
│    ├── PayloadResolver   (URI-based payload handling)   │
│    └── Storage providers                                │
│         ├── IpfsStorage    (IPFS/Pinata)                │
│         ├── S3Storage      (S3/R2/MinIO)                │
│         ├── DataUriStorage (inline data)                │
│         └── HttpStorage    (HTTP/HTTPS)                 │
├─────────────────────────────────────────────────────────┤
│  @noosphere/contracts                                   │
│    ├── ABIs              (contract interfaces)          │
│    ├── TypeChain types   (type-safe wrappers)           │
│    └── Contract wrappers (convenience methods)          │
├─────────────────────────────────────────────────────────┤
│  @noosphere/crypto                                      │
│    ├── KeystoreManager   (secure key storage)           │
│    └── WalletManager     (signing & payments)           │
├─────────────────────────────────────────────────────────┤
│  @noosphere/registry                                    │
│    └── RegistryManager   (container discovery)          │
└─────────────────────────────────────────────────────────┘
```

## Packages

### [@noosphere/agent-core](./packages/agent-core) · [npm](https://www.npmjs.com/package/@noosphere/agent-core)

Core agent functionality for processing compute requests.

```typescript
import { NoosphereAgent, EventMonitor, ContainerManager } from '@noosphere/agent-core';

// Create and start an agent
const agent = new NoosphereAgent(config);
await agent.start();
```

**Key Components:**
- `NoosphereAgent` - Main orchestrator
- `EventMonitor` - Blockchain event listener with WebSocket support
- `ContainerManager` - Docker container execution

### [@noosphere/payload](./packages/payload) · [npm](https://www.npmjs.com/package/@noosphere/payload)

PayloadData utilities for URI-based payload handling. Works in both browser and Node.js environments.

```typescript
import { PayloadResolver, createDataUriPayload } from '@noosphere/payload';

// Create PayloadData
const payload = createDataUriPayload('{"action": "ping"}');

// Resolve PayloadData
const resolver = new PayloadResolver({ ipfs: { gateway: 'https://ipfs.io/ipfs/' } });
const { content, verified } = await resolver.resolve(payload);
```

**Key Components:**
- `PayloadResolver` - Resolves and encodes PayloadData with verification
- `IpfsStorage` - IPFS/Pinata storage provider
- `S3Storage` - S3/R2/MinIO storage provider
- `DataUriStorage` - Inline base64 data URI provider

**Supported URI Schemes:**
- `data:` - Inline base64-encoded data
- `ipfs://` - IPFS content addressing
- `https://` / `http://` - HTTP(S) URLs

### [@noosphere/contracts](./packages/contracts) · [npm](https://www.npmjs.com/package/@noosphere/contracts)

Type-safe contract interfaces and ABIs.

```typescript
import { ABIs, RouterContract, WalletFactoryAbi__factory } from '@noosphere/contracts';

// Use type-safe contract wrappers
const router = new RouterContract(routerAddress, signer);
const subscription = await router.getComputeSubscription(subscriptionId);

// Or use TypeChain factories directly
const walletFactory = WalletFactoryAbi__factory.connect(factoryAddress, signer);
const tx = await walletFactory.createWallet(owner);
```

**Available ABIs:**
- Router (main protocol contract)
- Coordinator (compute orchestration)
- WalletFactory (payment wallet creation)
- Wallet (escrow and payments)
- SubscriptionBatchReader (batch queries)

### [@noosphere/crypto](./packages/crypto) · [npm](https://www.npmjs.com/package/@noosphere/crypto)

Secure wallet and keystore management.

```typescript
import { KeystoreManager, WalletManager } from '@noosphere/crypto';

// Initialize keystore (first time)
const keystore = await KeystoreManager.initialize(
  keystorePath,
  password,
  privateKey,
  provider
);

// Create payment wallets
const walletManager = await WalletManager.fromKeystoreManager(keystore, provider);
const { walletAddress } = await walletManager.createPaymentWallet(
  walletFactoryAddress,
  owner,
  subscriptionId
);

// List all wallets
const wallets = walletManager.listPaymentWallets();
```

**Features:**
- Single encrypted file for all keys
- EOA + payment wallet management
- EIP-712 signing support
- Hub-compatible keystore format

### [@noosphere/registry](./packages/registry) · [npm](https://www.npmjs.com/package/@noosphere/registry)

Container and verifier discovery with integrated proof generation support.

```typescript
import { RegistryManager } from '@noosphere/registry';

// Load container registry
const registry = new RegistryManager();
await registry.load();

// Get container configuration
const container = registry.getContainer(containerId);

// Get verifier with proof service configuration
const verifier = registry.getVerifier(verifierAddress);
if (verifier.requiresProof && verifier.proofService) {
  // Start proof generation service
  console.log('Proof service:', verifier.proofService.imageName);
}
```

### Payload Resolution

The SDK includes `PayloadResolver` for handling URI-based payload data with multiple storage backends.

```typescript
import { PayloadResolver } from '@noosphere/agent-core';

const resolver = new PayloadResolver({
  // IPFS configuration
  ipfs: {
    gateway: 'https://gateway.pinata.cloud/ipfs/',
    apiEndpoint: 'https://api.pinata.cloud',
    apiKey: process.env.PINATA_API_KEY,
    apiSecret: process.env.PINATA_API_SECRET,
  },
  // S3-compatible storage (R2, S3, MinIO)
  s3: {
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicUrlBase: process.env.R2_PUBLIC_URL,
  },
  // Auto-upload threshold (bytes)
  uploadThreshold: 1024,
  // Default storage for large payloads
  defaultStorage: 's3', // 'ipfs' | 's3' | 'data'
});

// Resolve PayloadData from various URI schemes
const { content, verified } = await resolver.resolve(payloadData);
// Supports: data:, ipfs://, https://, http://

// Encode output (auto-uploads if > threshold)
const outputPayload = await resolver.encode(outputContent);
```

**Supported URI Schemes:**
- `data:` - Inline base64-encoded data
- `ipfs://` - IPFS content addressing
- `https://` / `http://` - HTTP(S) URLs

**Storage Backends:**
- `IpfsStorage` - Pinata IPFS pinning service
- `S3Storage` - S3-compatible storage (AWS S3, Cloudflare R2, MinIO)
- `DataUriStorage` - Inline data URI encoding
- `HttpStorage` - HTTP(S) fetch

## Usage Examples

### Running a Compute Agent

```typescript
import { NoosphereAgent } from '@noosphere/agent-core';
import { RegistryManager } from '@noosphere/registry';

// Load container registry
const registry = new RegistryManager();
await registry.load();

// Create agent with container resolver
const agent = await NoosphereAgent.fromKeystore(
  keystorePath,
  password,
  {
    config: {
      routerAddress: process.env.ROUTER_ADDRESS!,
      coordinatorAddress: process.env.COORDINATOR_ADDRESS!,
      rpcUrl: process.env.RPC_URL!,
      wsUrl: process.env.WS_URL,
    },
    getContainer: async (containerId) => {
      return registry.getContainer(containerId);
    },
  }
);

await agent.start();
console.log('Agent running and processing requests...');
```

### Creating Payment Wallets

```typescript
import { WalletManager } from '@noosphere/crypto';
import { WalletFactoryAbi__factory } from '@noosphere/contracts';

const walletManager = new WalletManager(privateKey, provider, keystoreManager);

// Create smart contract wallet via WalletFactory
const { walletAddress, txHash } = await walletManager.createPaymentWallet(
  walletFactoryAddress,
  ownerAddress,
  'subscription-123'
);

// Or create simple EOA wallet
const { walletAddress: eoaAddress } = await walletManager.createEOAPaymentWallet(
  'subscription-456'
);

// Fund wallet
await walletManager.fundWallet(walletAddress, '0.1'); // 0.1 ETH
```

### Monitoring Events

```typescript
import { EventMonitor } from '@noosphere/agent-core';

const monitor = new EventMonitor({
  routerAddress,
  coordinatorAddress,
  rpcUrl,
  wsUrl,
  checkpointPath: './.noosphere/checkpoint.json',
});

// Listen for compute requests
monitor.on('RequestStarted', async (event) => {
  console.log('New request:', event);
  // Process request...
});

// Start monitoring (with automatic replay from checkpoint)
await monitor.start();
```

### Using Contract Wrappers

```typescript
import { RouterContract, CoordinatorContract } from '@noosphere/contracts';

const router = new RouterContract(routerAddress, signer);
const coordinator = new CoordinatorContract(coordinatorAddress, signer);

// Get subscription details
const subscription = await router.getComputeSubscription(subscriptionId);
console.log('Subscription:', subscription);

// Send request
const { requestId, commitment } = await router.sendRequest(
  subscriptionId,
  interval
);

// Listen for events
router.on('RequestStarted', (requestId, subscriptionId, containerId, commitment, event) => {
  console.log('Request started:', { requestId, subscriptionId, containerId });
});
```

## Configuration

### Environment Variables

```bash
# Required
KEYSTORE_PASSWORD=your-secure-password
PRIVATE_KEY=0x...
ROUTER_ADDRESS=0x...
COORDINATOR_ADDRESS=0x...
RPC_URL=https://...

# Optional
WS_URL=wss://...
WALLET_FACTORY_ADDRESS=0x...

# Payload Storage (S3/R2)
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=your-bucket
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Payload Storage (IPFS/Pinata)
PINATA_API_KEY=your-api-key
PINATA_API_SECRET=your-api-secret
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

### Keystore Structure

```json
{
  "version": "1.0.0",
  "eoa": {
    "address": "0x...",
    "keystore": "{ encrypted JSON }"
  },
  "paymentWallets": {
    "0xWallet1": {
      "address": "0xWallet1",
      "privateKey": "{ encrypted }",
      "subscriptionId": "sub-123",
      "metadata": {
        "type": "SmartContract",
        "factoryAddress": "0x..."
      }
    }
  },
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

## Development

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage report
```

### Lint & Format

```bash
npm run lint
npm run format
```

## Related Projects

- [noosphere-evm](https://github.com/hpp-io/noosphere-evm) - Smart contracts (Router, Coordinator)

## License

MIT - see [LICENSE](LICENSE) file for details


---

Built with ❤️ for the decentralized compute revolution
