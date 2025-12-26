import { Contract, Provider } from 'ethers';
import SubscriptionBatchReaderABI from './abis/SubscriptionBatchReader.abi.json';
import type { ComputeSubscription, IntervalStatus } from './types';

/**
 * SubscriptionBatchReaderContract
 * TypeScript wrapper for the Noosphere SubscriptionBatchReader contract
 * Based on SubscriptionBatchReader from noosphere-evm
 */
export class SubscriptionBatchReaderContract {
  private contract: Contract;

  constructor(
    address: string,
    provider: Provider
  ) {
    this.contract = new Contract(address, SubscriptionBatchReaderABI, provider);
  }

  /*//////////////////////////////////////////////////////////////////////////
                              READ HELPERS
  //////////////////////////////////////////////////////////////////////////*/

  /**
   * Get a batch of subscriptions from the blockchain
   * @param startId Inclusive start subscription ID
   * @param endId Inclusive end subscription ID
   * @param blockNumber Optional block number to query at
   * @returns Array of ComputeSubscription structs
   */
  async getSubscriptions(
    startId: bigint,
    endId: bigint,
    blockNumber?: number
  ): Promise<ComputeSubscription[]> {
    const options = blockNumber ? { blockTag: blockNumber } : {};

    const subscriptions = await this.contract.getSubscriptions(
      startId,
      endId,
      options
    );

    return subscriptions.map((sub: any) => this.parseComputeSubscription(sub));
  }

  /**
   * Get interval statuses for multiple subscription-interval pairs
   * @param ids Array of subscription IDs
   * @param intervals Array of interval indices (matched element-wise with ids)
   * @returns Array of IntervalStatus for each pair
   */
  async getIntervalStatuses(
    ids: bigint[],
    intervals: number[]
  ): Promise<IntervalStatus[]> {
    if (ids.length !== intervals.length) {
      throw new Error('ids and intervals arrays must have the same length');
    }

    const statuses = await this.contract.getIntervalStatuses(ids, intervals);

    return statuses.map((status: any) => ({
      redundancyCount: Number(status.redundancyCount),
      commitmentExists: status.commitmentExists,
    }));
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
      redundancy: Number(sub.redundancy),
      useDeliveryInbox: sub.useDeliveryInbox,
    };
  }
}
