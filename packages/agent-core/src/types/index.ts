// Re-export PayloadData from contracts
export { PayloadData, InputType } from '@noosphere/contracts';

export interface Commitment {
  requestId: string;
  subscriptionId: bigint;
  containerId: string;
  interval: number;
  useDeliveryInbox: boolean;
  walletAddress: string;
  feeAmount: bigint;
  feeToken: string;
  verifier: string;
  coordinator: string;
  verifierFee: bigint;
}

export interface Payment {
  recipient: string;
  feeToken: string;
  feeAmount: bigint;
}

export interface ProofVerificationRequest {
  subscriptionId: bigint;
  interval: number;
  submitterAddress: string;
  escrowedAmount: bigint;
}

export interface RequestStartedEvent {
  requestId: string;
  subscriptionId: bigint;
  containerId: string;
  interval: number;
  useDeliveryInbox: boolean;
  walletAddress: string;
  feeAmount: bigint;
  feeToken: string;
  verifier: string;
  coordinator: string;
  verifierFee: bigint;
  blockNumber: number;
}

export interface ComputeSubscription {
  owner: string;
  wallet: string;
  containerId: string;
  intervalSeconds: number;
  maxExecutions: number;
  feeToken: string;
  feeAmount: bigint;
  verifier: string;
  routeId: string;
  activeAt: number;
  useDeliveryInbox: boolean;
}

export interface AgentConfig {
  rpcUrl: string;
  wsRpcUrl?: string;
  privateKey?: string; // Optional - use keystore initialization instead
  routerAddress: string;
  coordinatorAddress: string;
  deploymentBlock?: number;
  pollingInterval?: number;
}

// Extended config for full agent configuration (matches Java agent config.json)
export interface NoosphereAgentConfig {
  forwardStats?: boolean;
  manageContainers?: boolean;
  startupWait?: number;
  agent?: {
    name: string;
    apiKey?: string;
    email?: string;
  };
  server?: {
    port: number;
    rateLimit?: {
      numRequests: number;
      period: number;
    };
  };
  hub?: {
    register: boolean;
    url: string;
    keepAlive?: {
      enabled: boolean;
      intervalMs: number;
      batchSize?: number;
    };
  };
  chain: {
    enabled: boolean;
    rpcUrl: string;
    wsRpcUrl?: string;
    trailHeadBlocks?: number;
    routerAddress: string;
    coordinatorAddress?: string;
    deploymentBlock?: number;
    processingInterval?: number;
    wallet: {
      maxGasLimit?: number;
      paymentAddress?: string;
      allowedSimErrors?: string[];
      keystore?: {
        path: string;
        password: string;
        keys?: {
          eth?: string;
        };
      };
    };
    snapshotSync?: {
      sleep?: number;
      batchSize?: number;
      startingSubId?: number;
      syncPeriod?: number;
    };
    connection?: {
      timeout?: number;
      readTimeout?: number;
      writeTimeout?: number;
    };
    gasConfig?: {
      priceMultiplier?: number;
      limitMultiplier?: number;
    };
  };
  docker?: {
    username?: string;
    password?: string;
  };
  containers: ContainerConfig[];
}

export interface ContainerConfig {
  id: string;
  image: string;
  port?: string;
  env?: Record<string, string>;
  volumes?: string[];
  verifierAddress?: string;
  acceptedPayments?: Record<string, number>;
}

export interface ContainerMetadata {
  id: string;
  name: string;
  image: string;
  tag?: string;
  port?: string;
  env?: Record<string, string>;
  requirements?: {
    memory?: string;
    cpu?: number;
    gpu?: boolean;
  };
  payments?: {
    basePrice: string;
    unit: string;
    per: string;
  };
  verified?: boolean;
}

export interface VerifierMetadata {
  address: string;
  name: string;
  image: string;
  tag?: string;
}

export enum FulfillResult {
  FULFILLED = 0,
  INVALID_REQUEST_ID = 1,
  INVALID_COMMITMENT = 2,
  SUBSCRIPTION_BALANCE_INVARIANT_VIOLATION = 3,
  INSUFFICIENT_SUBSCRIPTION_BALANCE = 4,
  COST_EXCEEDS_COMMITMENT = 5,
}

/**
 * Event emitted when scheduler successfully prepares next interval
 */
export interface CommitmentSuccessEvent {
  subscriptionId: bigint;
  interval: bigint;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  gasPrice: string;
  gasCost: string;
  requestStartedEvent?: RequestStartedEvent;
}
