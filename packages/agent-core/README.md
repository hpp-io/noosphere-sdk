# @noosphere/agent-core

Core modules for building Noosphere compute agents.

## Installation

```bash
npm install @noosphere/agent-core
```

For alpha version:
```bash
npm install @noosphere/agent-core@alpha
```

## Components

### NoosphereAgent

Main agent class that orchestrates compute request handling.

```typescript
import { NoosphereAgent } from '@noosphere/agent-core';

const agent = new NoosphereAgent({
  rpcUrl: 'https://sepolia.hpp.io',
  wsUrl: 'wss://sepolia.hpp.io',
  routerAddress: '0x89c76ee71E9cC8D57BEE3d414478B630AE41fF43',
  coordinatorAddress: '0x244D87a7CAe0D557C223C13a90Ae845e56430A50',
  keystore,
  containers: [
    {
      containerId: 'hello-world',
      imageName: 'noosphere/hello-world:latest',
    },
  ],
});

// Event handlers
agent.on('requestStarted', (event) => {
  console.log('Request started:', event.requestId);
});

agent.on('computeDelivered', (event) => {
  console.log('Compute delivered:', event.requestId);
});

// Start agent
await agent.start();
```

### EventMonitor

WebSocket-based blockchain event monitor with automatic reconnection.

```typescript
import { EventMonitor } from '@noosphere/agent-core';

const monitor = new EventMonitor(
  {
    rpcUrl: 'https://sepolia.hpp.io',
    wsUrl: 'wss://sepolia.hpp.io',
    routerAddress: '0x89c76ee71E9cC8D57BEE3d414478B630AE41fF43',
    coordinatorAddress: '0x244D87a7CAe0D557C223C13a90Ae845e56430A50',
  },
  routerAbi,
  coordinatorAbi,
  { enableHeartbeat: true }
);

monitor.on('RequestStarted', (event) => {
  console.log('New request:', event);
});

await monitor.start();
```

### ContainerManager

Docker container lifecycle management.

```typescript
import { ContainerManager } from '@noosphere/agent-core';

const manager = new ContainerManager();

// Run container
const result = await manager.runContainer({
  imageName: 'noosphere/hello-world:latest',
  input: { message: 'Hello' },
  timeout: 30000,
});

console.log('Output:', result.output);
```

### SchedulerService

Subscription scheduling and interval management.

```typescript
import { SchedulerService } from '@noosphere/agent-core';

const scheduler = new SchedulerService(
  coordinatorContract,
  walletManager,
  { intervalCheckMs: 60000 }
);

scheduler.on('intervalPrepared', (event) => {
  console.log('Interval prepared:', event);
});

await scheduler.start(subscriptions);
```

## Re-exports

For convenience, this package re-exports from other Noosphere packages:

```typescript
// From @noosphere/crypto
import { KeystoreManager, WalletManager } from '@noosphere/agent-core';

// From @noosphere/registry
import { RegistryManager } from '@noosphere/agent-core';
```

## Types

```typescript
import type {
  NoosphereAgentConfig,
  ContainerConfig,
  CheckpointData,
  ComputeDeliveredEvent,
  RequestStartedCallbackEvent,
} from '@noosphere/agent-core';
```

## License

MIT
