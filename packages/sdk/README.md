# @noosphere/sdk

Unified SDK for building Noosphere decentralized compute agents.

## Installation

```bash
npm install @noosphere/sdk
```

For alpha version:
```bash
npm install @noosphere/sdk@alpha
```

## Overview

This package re-exports all Noosphere SDK modules:

- **@noosphere/agent-core** - Core agent components (NoosphereAgent, EventMonitor, ContainerManager)
- **@noosphere/contracts** - Smart contract wrappers and ABIs
- **@noosphere/crypto** - Key management and wallet utilities
- **@noosphere/registry** - Container and verifier registry management

## Quick Start

```typescript
import {
  NoosphereAgent,
  KeystoreManager,
  WalletManager,
  RegistryManager,
  contracts,
  crypto,
  registry,
} from '@noosphere/sdk';

// Initialize keystore
const keystoreManager = new KeystoreManager();
const keystore = await keystoreManager.loadKeystore('./keystore.json', 'password');

// Create agent
const agent = new NoosphereAgent({
  rpcUrl: 'https://sepolia.hpp.io',
  wsUrl: 'wss://sepolia.hpp.io',
  routerAddress: '0x89c76ee71E9cC8D57BEE3d414478B630AE41fF43',
  coordinatorAddress: '0x244D87a7CAe0D557C223C13a90Ae845e56430A50',
  keystore,
});

// Start listening for compute requests
await agent.start();
```

## Modules

### Agent Core

```typescript
import { NoosphereAgent, EventMonitor, ContainerManager } from '@noosphere/sdk';
```

### Contracts (namespaced)

```typescript
import { contracts } from '@noosphere/sdk';

const router = new contracts.RouterContract(address, provider);
```

### Crypto (namespaced)

```typescript
import { crypto } from '@noosphere/sdk';

const keystore = new crypto.KeystoreManager();
```

### Registry (namespaced)

```typescript
import { registry } from '@noosphere/sdk';

const registryManager = new registry.RegistryManager(config);
```

## Individual Packages

You can also install individual packages:

```bash
npm install @noosphere/agent-core@alpha
npm install @noosphere/contracts@alpha
npm install @noosphere/crypto@alpha
npm install @noosphere/registry@alpha
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (for TypeScript users)

## License

MIT
