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
  redundancy: number; // uint16
  useDeliveryInbox: boolean; // bool
}

export interface Commitment {
  requestId: string; // bytes32
  subscriptionId: bigint; // uint64
  interval: number; // uint32
  redundancy: number; // uint16
  containerId: string; // bytes32
  client: string; // address
  wallet: string; // address
  feeToken: string; // address
  feeAmount: bigint; // uint256
  verifier: string; // address
  useDeliveryInbox: boolean; // bool
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
  redundancyCount: number; // uint16
  commitmentExists: boolean; // bool
}

export enum FulfillResult {
  FULFILLED = 0,
  INVALID_REQUEST_ID = 1,
  INVALID_COMMITMENT = 2,
  REDUNDANCY_NOT_MET = 3,
  INSUFFICIENT_PAYMENT = 4,
  VERIFICATION_REQUIRED = 5,
  VERIFICATION_FAILED = 6,
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
  numRedundantDeliveries: number;
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
