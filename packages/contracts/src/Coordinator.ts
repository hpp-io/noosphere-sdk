import { Contract, Provider, Signer, EventLog, ContractTransactionResponse, ethers, AccessList } from 'ethers';
import CoordinatorABI from './abis/Coordinator.abi.json';
import type { Commitment, ProofVerificationRequest, PayloadData } from './types';

/**
 * Transaction options for reportComputeResult
 */
export interface ReportComputeResultOptions {
  /** Pre-computed access list for gas optimization */
  accessList?: AccessList;
  /** Auto-generate access list using eth_createAccessList (default: false) */
  autoAccessList?: boolean;
  /** Gas limit override */
  gasLimit?: bigint;
}

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
   * @param options - Optional transaction options (accessList, autoAccessList, gasLimit)
   */
  async reportComputeResult(
    deliveryInterval: number,
    input: PayloadData,
    output: PayloadData,
    proof: PayloadData,
    commitmentData: Uint8Array | string,
    nodeWallet: string,
    options?: ReportComputeResultOptions
  ): Promise<ContractTransactionResponse> {
    const args = [
      deliveryInterval,
      this.encodePayloadData(input),
      this.encodePayloadData(output),
      this.encodePayloadData(proof),
      commitmentData,
      nodeWallet
    ];

    // Build transaction overrides
    const overrides: any = {};

    if (options?.gasLimit) {
      overrides.gasLimit = options.gasLimit;
    }

    // Handle access list
    if (options?.accessList) {
      // Use provided access list
      overrides.accessList = options.accessList;
      console.log('  📋 Using provided access list');
    } else if (options?.autoAccessList) {
      // Auto-generate access list
      console.log('  📋 Auto-generating access list...');
      const accessList = await this.createAccessList(
        deliveryInterval,
        input,
        output,
        proof,
        commitmentData,
        nodeWallet
      );
      if (accessList) {
        overrides.accessList = accessList;
      }
    }

    // Call with or without overrides
    if (Object.keys(overrides).length > 0) {
      return this.contract.reportComputeResult(...args, overrides);
    }
    return this.contract.reportComputeResult(...args);
  }

  /**
   * Create access list for reportComputeResult transaction
   * Uses eth_createAccessList RPC to determine optimal access list
   * @returns AccessList or null if creation fails
   */
  async createAccessList(
    deliveryInterval: number,
    input: PayloadData,
    output: PayloadData,
    proof: PayloadData,
    commitmentData: Uint8Array | string,
    nodeWallet: string
  ): Promise<AccessList | null> {
    try {
      const provider = this.contract.runner?.provider as ethers.JsonRpcProvider | undefined;
      console.log(`  📋 createAccessList: provider=${!!provider}, send=${typeof provider?.send}`);
      if (!provider || typeof provider.send !== 'function') {
        console.warn('  ⚠️ No JsonRpcProvider available for access list creation');
        return null;
      }

      // Encode the function call
      const calldata = this.contract.interface.encodeFunctionData('reportComputeResult', [
        deliveryInterval,
        this.encodePayloadData(input),
        this.encodePayloadData(output),
        this.encodePayloadData(proof),
        commitmentData,
        nodeWallet
      ]);

      // Get signer address
      const signer = this.contract.runner as Signer;
      const from = await signer.getAddress();

      // Call eth_createAccessList
      const result = await provider.send('eth_createAccessList', [{
        from,
        to: this.contract.target,
        data: calldata,
      }]);

      if (result?.accessList) {
        console.log(`  📋 Access list created with ${result.accessList.length} entries`);
        return result.accessList;
      }

      return null;
    } catch (error) {
      console.warn('Failed to create access list:', error);
      return null;
    }
  }

  /**
   * Encode PayloadData for contract call
   * @param payload - PayloadData to encode
   * @returns Tuple format expected by contract
   */
  private encodePayloadData(payload: PayloadData): [string, Uint8Array] {
    // If URI is already hex-encoded (starts with 0x), convert directly to bytes
    // Otherwise, encode as UTF-8 bytes
    const uriBytes = payload.uri.startsWith('0x')
      ? ethers.getBytes(payload.uri)
      : ethers.toUtf8Bytes(payload.uri);
    return [payload.contentHash, uriBytes];
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
