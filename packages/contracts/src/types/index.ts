/**
 * Noosphere Contract Types
 * Based on noosphere-evm Solidity types
 */

/**
 * PayloadData struct for gas-optimized payload references
 * Supports multiple URI schemes: data:, ipfs://, ar://, https://, chain://
 */
export interface PayloadData {
  contentHash: string; // bytes32 - keccak256(content) for integrity verification
  uri: string; // bytes - Full URI string (e.g., "ipfs://Qm...", "https://...")
}

/**
 * Input type for compute requests
 */
export enum InputType {
  RAW_DATA = 0, // Raw inline data (<1KB)
  URI_STRING = 1, // URI string
  PAYLOAD_DATA = 2, // PayloadData struct
}

export interface ComputeSubscription {
  routeId: string; // bytes32
  containerId: string; // bytes32
  feeAmount: bigint; // uint256
  client: string; // address
  activeAt: number; // uint32
  intervalSeconds: number; // uint32
  maxExecutions: number; // uint32
  wallet: string; // address payable
  feeToken: string; // address
  verifier: string; // address payable
  useDeliveryInbox: boolean; // bool
}

export interface Commitment {
  requestId: string; // bytes32
  subscriptionId: bigint; // uint64
  containerId: string; // bytes32
  interval: number; // uint32
  useDeliveryInbox: boolean; // bool
  walletAddress: string; // address
  feeAmount: bigint; // uint256
  feeToken: string; // address
  verifier: string; // address
  coordinator: string; // address
  verifierFee: bigint; // uint256
}

export interface Payment {
  recipient: string; // address
  token: string; // address
  amount: bigint; // uint256
}

export interface ProofVerificationRequest {
  subscriptionId: bigint; // uint64
  interval: number; // uint32
  verifier: string; // address
  token: string; // address
  amount: bigint; // uint256
}

export interface IntervalStatus {
  commitmentExists: boolean; // bool
}

export enum FulfillResult {
  FULFILLED = 0,
  INVALID_REQUEST_ID = 1,
  INVALID_COMMITMENT = 2,
  INSUFFICIENT_PAYMENT = 3,
  VERIFICATION_REQUIRED = 4,
  VERIFICATION_FAILED = 5,
}

/**
 * Event types
 */

export interface RequestStartedEvent {
  requestId: string;
  subscriptionId: bigint;
  containerId: string;
  commitment: Commitment;
}

export interface RequestCancelledEvent {
  requestId: string;
}

export interface ComputeDeliveredEvent {
  requestId: string;
  nodeWallet: string;
  input: PayloadData;
  output: PayloadData;
  proof: PayloadData;
}

export interface ProofVerifiedEvent {
  subscriptionId: bigint;
  interval: number;
  node: string;
  valid: boolean;
  verifier: string;
}

export interface SubscriptionCreatedEvent {
  subscriptionId: bigint;
  client: string;
  routeId: string;
  containerId: string;
}
