import { Contract, Provider, Signer, EventLog, ContractTransactionResponse, ethers } from 'ethers';
import CoordinatorABI from './abis/Coordinator.abi.json';
import type { Commitment, ProofVerificationRequest, PayloadData } from './types';

/**
 * CoordinatorContract
 * TypeScript wrapper for the Noosphere Coordinator contract
 * Based on ICoordinator interface from noosphere-evm
 */
export class CoordinatorContract {
  private contract: Contract;

  constructor(address: string, providerOrSigner: Provider | Signer) {
    this.contract = new Contract(address, CoordinatorABI, providerOrSigner);
  }

  /*//////////////////////////////////////////////////////////////////////////
                       REQUEST LIFECYCLE (CREATION/CANCELLATION)
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Start a new request for a subscription interval
   */
  async startRequest(
    requestId: string,
    subscriptionId: bigint,
    containerId: string,
    interval: number,
    redundancy: number,
    useDeliveryInbox: boolean,
    feeToken: string,
    feeAmount: bigint,
    wallet: string,
    verifier: string
  ): Promise<Commitment> {
    const commitment = await this.contract.startRequest(
      requestId,
      subscriptionId,
      containerId,
      interval,
      redundancy,
      useDeliveryInbox,
      feeToken,
      feeAmount,
      wallet,
      verifier
    );
    return this.parseCommitment(commitment);
  }

  /**
   * Cancel a pending request
   */
  async cancelRequest(requestId: string): Promise<ContractTransactionResponse> {
    return this.contract.cancelRequest(requestId);
  }

  /*//////////////////////////////////////////////////////////////////////////
                      DELIVERY & FULFILLMENT HANDLERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Report compute result for an interval
   * @param deliveryInterval - The interval number for this delivery
   * @param input - PayloadData containing contentHash and uri for input
   * @param output - PayloadData containing contentHash and uri for output
   * @param proof - PayloadData containing contentHash and uri for proof
   * @param commitmentData - ABI-encoded commitment data
   * @param nodeWallet - Address of the node's payment wallet
   */
  async reportComputeResult(
    deliveryInterval: number,
    input: PayloadData,
    output: PayloadData,
    proof: PayloadData,
    commitmentData: Uint8Array,
    nodeWallet: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.reportComputeResult(
      deliveryInterval,
      this.encodePayloadData(input),
      this.encodePayloadData(output),
      this.encodePayloadData(proof),
      commitmentData,
      nodeWallet
    );
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
   * Parse PayloadData from contract response
   * @param data - Raw tuple from contract
   * @returns Parsed PayloadData
   */
  private parsePayloadData(data: any): PayloadData {
    return {
      contentHash: data.contentHash || data[0],
      uri: ethers.toUtf8String(data.uri || data[1]),
    };
  }

  /*//////////////////////////////////////////////////////////////////////////
                            VERIFICATION
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Report verification result
   */
  async reportVerificationResult(
    request: ProofVerificationRequest,
    valid: boolean
  ): Promise<ContractTransactionResponse> {
    return this.contract.reportVerificationResult(request, valid);
  }

  /*//////////////////////////////////////////////////////////////////////////
                      INTERVAL / SCHEDULING HELPERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Prepare internal state for the next interval
   */
  async prepareNextInterval(
    subscriptionId: bigint,
    nextInterval: number,
    nodeWallet: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.prepareNextInterval(subscriptionId, nextInterval, nodeWallet);
  }

  /**
   * Get commitment for a specific subscription and interval
   */
  async getCommitment(subscriptionId: bigint, interval: number): Promise<Commitment> {
    const commitment = await this.contract.getCommitment(subscriptionId, interval);
    return this.parseCommitment(commitment);
  }

  /**
   * Get request ID for a commitment
   */
  async requestCommitments(requestId: string): Promise<string> {
    return this.contract.requestCommitments(requestId);
  }

  /**
   * Get redundancy count for a request
   */
  async redundancyCount(requestId: string): Promise<number> {
    const count = await this.contract.redundancyCount(requestId);
    return Number(count);
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
      RequestCancelled: () => this.contract.filters.RequestCancelled(),
      ComputeDelivered: () => this.contract.filters.ComputeDelivered(),
      ProofVerified: () => this.contract.filters.ProofVerified(),
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

  private parseCommitment(commitment: any): Commitment {
    return {
      requestId: commitment.requestId,
      subscriptionId: BigInt(commitment.subscriptionId),
      interval: Number(commitment.interval),
      redundancy: Number(commitment.redundancy),
      containerId: commitment.containerId,
      client: commitment.client,
      wallet: commitment.wallet,
      feeToken: commitment.feeToken,
      feeAmount: BigInt(commitment.feeAmount),
      verifier: commitment.verifier,
      useDeliveryInbox: commitment.useDeliveryInbox,
    };
  }
}
