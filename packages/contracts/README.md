# @noosphere/contracts

TypeScript wrappers and ABIs for Noosphere smart contracts.

## Installation

```bash
npm install @noosphere/contracts
```

## Usage

### Basic Example

```typescript
import { RouterContract, CoordinatorContract, SubscriptionBatchReaderContract } from '@noosphere/contracts';
import { ethers } from 'ethers';

// Setup provider
const provider = new ethers.JsonRpcProvider('https://sepolia.hpp.io');

// Create contract instances
const router = new RouterContract(
  '0x89c76ee71E9cC8D57BEE3d414478B630AE41fF43',
  provider
);

const coordinator = new CoordinatorContract(
  '0x244D87a7CAe0D557C223C13a90Ae845e56430A50',
  provider
);

// Read subscription
const subscription = await router.getComputeSubscription(1n);
console.log('Subscription:', subscription);

// Check if request has commitment
const commitmentHash = await coordinator.requestCommitments('0x123...');
const hasCommitment = commitmentHash !== '0x' + '0'.repeat(64);
console.log('Has commitment:', hasCommitment);
```

### SubscriptionBatchReader

```typescript
import { SubscriptionBatchReaderContract } from '@noosphere/contracts';

// Get BatchReader address from coordinator
const batchReaderAddress = await coordinator.raw.getSubscriptionBatchReader();

// Create BatchReader instance
const batchReader = new SubscriptionBatchReaderContract(
  batchReaderAddress,
  provider
);

// Read subscriptions in batch
const subscriptions = await batchReader.getSubscriptions(
  0n,    // startId
  100n,  // endId
  await provider.getBlockNumber() // optional: specific block
);

console.log(`Loaded ${subscriptions.length} subscriptions`);
```

### Event Listening

```typescript
// Listen for RequestStarted events
router.on('RequestStarted', (requestId, subscriptionId, containerId, commitment, event) => {
  console.log('New request:', {
    requestId,
    subscriptionId,
    containerId,
    commitment,
  });
});

// Query past events
const events = await router.queryFilter(
  router.filters.RequestStarted(),
  1000,  // from block
  'latest'
);

console.log(`Found ${events.length} RequestStarted events`);
```

### Write Operations (requires Signer)

```typescript
import { ethers } from 'ethers';

// Create signer
const wallet = new ethers.Wallet(privateKey, provider);

// Create contract with signer
const coordinatorWithSigner = new CoordinatorContract(
  coordinatorAddress,
  wallet
);

// Prepare next interval
const tx = await coordinatorWithSigner.prepareNextInterval(
  1n,           // subscriptionId
  5,            // nextInterval
  walletAddress // nodeWallet
);

await tx.wait();
console.log('Transaction confirmed:', tx.hash);
```

## API

### RouterContract

**Read Methods:**
- `getComputeSubscription(subscriptionId)` - Get subscription details
- `hasSubscriptionNextInterval(subscriptionId, currentInterval)` - Check if next interval exists
- `getLastSubscriptionId()` - Get last subscription ID
- `getContractById(id)` - Get contract address by ID
- `getWalletFactory()` - Get WalletFactory address
- `isValidWallet(address)` - Check if address is valid wallet

**Write Methods:**
- `sendRequest(subscriptionId, interval)` - Create new request
- `fulfill(...)` - Fulfill request
- `timeoutRequest(requestId, subscriptionId, interval)` - Timeout request

**Events:**
- `RequestStarted`
- `SubscriptionCreated`
- `SubscriptionCancelled`

### CoordinatorContract

**Read Methods:**
- `getCommitment(subscriptionId, interval)` - Get commitment
- `requestCommitments(requestId)` - Get commitment hash for request

**Write Methods:**
- `startRequest(...)` - Start new request
- `cancelRequest(requestId)` - Cancel request
- `reportComputeResult(...)` - Report compute result
- `prepareNextInterval(subscriptionId, interval, wallet)` - Prepare interval

**Events:**
- `RequestStarted`
- `RequestCancelled`
- `ComputeDelivered`
- `ProofVerified`

### SubscriptionBatchReaderContract

**Read Methods:**
- `getSubscriptions(startId, endId, blockNumber?)` - Get batch of subscriptions
- `getIntervalStatuses(ids, intervals)` - Get interval statuses

## Types

All TypeScript types are exported:

```typescript
import type {
  ComputeSubscription,
  Commitment,
  Payment,
  ProofVerificationRequest,
  IntervalStatus,
  FulfillResult,
  RequestStartedEvent,
} from '@noosphere/contracts';
```

## ABIs

Access raw ABIs:

```typescript
import { ABIs } from '@noosphere/contracts';

console.log(ABIs.Router);
console.log(ABIs.Coordinator);
console.log(ABIs.SubscriptionBatchReader);
```

## License

MIT
