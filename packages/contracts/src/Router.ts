import { Contract, Provider, Signer, EventLog, ContractTransactionResponse, ethers } from 'ethers';
import RouterABI from './abis/Router.abi.json';
import type {
  ComputeSubscription,
  Commitment,
  Payment,
  ProofVerificationRequest,
  FulfillResult,
  PayloadData,
} from './types';

/**
 * RouterContract
 * TypeScript wrapper for the Noosphere Router contract
 * Based on IRouter interface from noosphere-evm
 */
export class RouterContract {
  private contract: Contract;

  constructor(address: string, providerOrSigner: Provider | Signer) {
    this.contract = new Contract(address, RouterABI, providerOrSigner);
  }

  /*//////////////////////////////////////////////////////////////////////////
                            REQUEST LIFECYCLE - READ / SEND
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Create and announce a new request for a given subscription interval
   */
  async sendRequest(
    subscriptionId: bigint,
    interval: number
  ): Promise<{ requestId: string; commitment: Commitment }> {
    const result = await this.contract.sendRequest(subscriptionId, interval);
    return {
      requestId: result.requestId,
      commitment: this.parseCommitment(result.commitment),
    };
  }

  /**
   * Query whether the given subscription has a next interval
   */
  async hasSubscriptionNextInterval(
    subscriptionId: bigint,
    currentInterval: number
  ): Promise<boolean> {
    return this.contract.hasSubscriptionNextInterval(subscriptionId, currentInterval);
  }

  /**
   * Get a ComputeSubscription by ID
   */
  async getComputeSubscription(subscriptionId: bigint): Promise<ComputeSubscription> {
    const sub = await this.contract.getComputeSubscription(subscriptionId);
    return this.parseComputeSubscription(sub);
  }

  /*//////////////////////////////////////////////////////////////////////////
                       FULFILLMENT & PAYMENT HANDLERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Accept fulfillment results and attempt on-chain settlement
   * @param input - PayloadData containing contentHash and uri for input
   * @param output - PayloadData containing contentHash and uri for output
   * @param proof - PayloadData containing contentHash and uri for proof
   * @param nodeWallet - Address of the node's payment wallet
   * @param payments - Array of payment instructions
   * @param commitment - The commitment data
   */
  async fulfill(
    input: PayloadData,
    output: PayloadData,
    proof: PayloadData,
    nodeWallet: string,
    payments: Payment[],
    commitment: Commitment
  ): Promise<FulfillResult> {
    const result = await this.contract.fulfill(
      this.encodePayloadData(input),
      this.encodePayloadData(output),
      this.encodePayloadData(proof),
      nodeWallet,
      payments,
      commitment
    );
    return result as FulfillResult;
  }

  /**
   * Encode PayloadData for contract call
   * @param payload - PayloadData to encode
   * @returns Tuple format expected by contract
   */
  private encodePayloadData(payload: PayloadData): [string, Uint8Array] {
    return [payload.contentHash, ethers.toUtf8Bytes(payload.uri)];
  }

  /**
   * Execute coordinator-driven payouts
   */
  async payFromCoordinator(
    subscriptionId: bigint,
    spenderWallet: string,
    spenderAddress: string,
    payments: Payment[]
  ): Promise<ContractTransactionResponse> {
    return this.contract.payFromCoordinator(
      subscriptionId,
      spenderWallet,
      spenderAddress,
      payments
    );
  }

  /*//////////////////////////////////////////////////////////////////////////
                        VERIFICATION ESCROW (LOCK / UNLOCK)
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Lock consumer funds for proof verification
   */
  async lockForVerification(
    proofRequest: ProofVerificationRequest,
    commitmentHash: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.lockForVerification(proofRequest, commitmentHash);
  }

  /**
   * Release previously locked funds
   */
  async unlockForVerification(
    proofRequest: ProofVerificationRequest
  ): Promise<ContractTransactionResponse> {
    return this.contract.unlockForVerification(proofRequest);
  }

  /**
   * Prepare node-side verification parameters
   */
  async prepareNodeVerification(
    subscriptionId: bigint,
    nextInterval: number,
    nodeWallet: string,
    token: string,
    amount: bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.prepareNodeVerification(
      subscriptionId,
      nextInterval,
      nodeWallet,
      token,
      amount
    );
  }

  /*//////////////////////////////////////////////////////////////////////////
                         SUBSCRIPTION MANAGEMENT
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Get the last subscription ID issued by the Router
   */
  async getLastSubscriptionId(): Promise<bigint> {
    return this.contract.getLastSubscriptionId();
  }

  /*//////////////////////////////////////////////////////////////////////////
                       CONTRACT REGISTRY & GOVERNANCE
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Resolve a registered contract address by its canonical ID
   */
  async getContractById(id: string): Promise<string> {
    return this.contract.getContractById(id);
  }

  /**
   * Resolve a proposed contract address by its canonical ID
   */
  async getProposedContractById(id: string): Promise<string> {
    return this.contract.getProposedContractById(id);
  }

  /*//////////////////////////////////////////////////////////////////////////
                       WALLET FACTORY / VALIDATION
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Get the WalletFactory contract address
   */
  async getWalletFactory(): Promise<string> {
    return this.contract.getWalletFactory();
  }

  /**
   * Validate whether the given address is a valid Wallet
   */
  async isValidWallet(walletAddr: string): Promise<boolean> {
    return this.contract.isValidWallet(walletAddr);
  }

  /*//////////////////////////////////////////////////////////////////////////
                                ADMIN
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Pause router operations
   */
  async pause(): Promise<ContractTransactionResponse> {
    return this.contract.pause();
  }

  /**
   * Resume router operations
   */
  async unpause(): Promise<ContractTransactionResponse> {
    return this.contract.unpause();
  }

  /*//////////////////////////////////////////////////////////////////////////
                              TIMEOUTS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Mark a request as timed out
   */
  async timeoutRequest(
    requestId: string,
    subscriptionId: bigint,
    interval: number
  ): Promise<ContractTransactionResponse> {
    return this.contract.timeoutRequest(requestId, subscriptionId, interval);
  }

  /*//////////////////////////////////////////////////////////////////////////
                            EVENT FILTERS & LISTENERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Event filters
   */
  get filters() {
    return {
      RequestStarted: () => this.contract.filters.RequestStarted(),
      SubscriptionCreated: () => this.contract.filters.SubscriptionCreated(),
      SubscriptionCancelled: () => this.contract.filters.SubscriptionCancelled(),
    };
  }

  /**
   * Listen for events
   */
  on(event: string, listener: (...args: any[]) => void): void {
    this.contract.on(event, listener);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: string): void {
    this.contract.removeAllListeners(event);
  }

  /**
   * Query past events
   */
  async queryFilter(
    filter: any,
    fromBlock?: number,
    toBlock?: number | string
  ): Promise<EventLog[]> {
    return this.contract.queryFilter(filter, fromBlock, toBlock) as Promise<EventLog[]>;
  }

  /*//////////////////////////////////////////////////////////////////////////
                              HELPERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Get the contract address
   */
  get address(): string {
    return this.contract.target as string;
  }

  /**
   * Get the underlying ethers Contract
   */
  get raw(): Contract {
    return this.contract;
  }

  /*//////////////////////////////////////////////////////////////////////////
                            PRIVATE PARSERS
  //////////////////////////////////////////////////////////////////////////*/

  private parseComputeSubscription(sub: any): ComputeSubscription {
    return {
      routeId: sub.routeId,
      containerId: sub.containerId,
      feeAmount: BigInt(sub.feeAmount),
      client: sub.client,
      activeAt: Number(sub.activeAt),
      intervalSeconds: Number(sub.intervalSeconds),
      maxExecutions: Number(sub.maxExecutions),
      wallet: sub.wallet,
      feeToken: sub.feeToken,
      verifier: sub.verifier,
      useDeliveryInbox: sub.useDeliveryInbox,
    };
  }

  private parseCommitment(commitment: any): Commitment {
    return {
      requestId: commitment.requestId,
      subscriptionId: BigInt(commitment.subscriptionId),
      containerId: commitment.containerId,
      interval: Number(commitment.interval),
      useDeliveryInbox: commitment.useDeliveryInbox,
      walletAddress: commitment.walletAddress,
      feeAmount: BigInt(commitment.feeAmount),
      feeToken: commitment.feeToken,
      verifier: commitment.verifier,
      coordinator: commitment.coordinator,
      verifierFee: BigInt(commitment.verifierFee),
    };
  }
}
