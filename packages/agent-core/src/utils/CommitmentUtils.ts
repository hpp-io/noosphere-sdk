import { ethers } from 'ethers';
import type { Commitment } from '../types';

export class CommitmentUtils {
  /**
   * Calculate commitment hash
   * Matches the keccak256(abi.encode(commitment)) in Solidity
   */
  static hash(commitment: Commitment): string {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'bytes32', // requestId
        'uint64', // subscriptionId
        'bytes32', // containerId
        'uint32', // interval
        'bool', // useDeliveryInbox
        'uint16', // redundancy
        'address', // walletAddress
        'uint256', // feeAmount
        'address', // feeToken
        'address', // verifier
        'address', // coordinator
      ],
      [
        commitment.requestId,
        commitment.subscriptionId,
        commitment.containerId,
        commitment.interval,
        commitment.useDeliveryInbox,
        commitment.redundancy,
        commitment.walletAddress,
        commitment.feeAmount,
        commitment.feeToken,
        commitment.verifier,
        commitment.coordinator,
      ]
    );

    return ethers.keccak256(encoded);
  }

  /**
   * Verify commitment hash matches expected value
   */
  static verify(commitment: Commitment, expectedHash: string): boolean {
    const actualHash = this.hash(commitment);
    return actualHash === expectedHash;
  }

  /**
   * Encode commitment data for reportComputeResult
   * Returns ABI-encoded commitment struct
   */
  static encode(commitment: Commitment): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'bytes32', // requestId
        'uint64', // subscriptionId
        'bytes32', // containerId
        'uint32', // interval
        'bool', // useDeliveryInbox
        'uint16', // redundancy
        'address', // walletAddress
        'uint256', // feeAmount
        'address', // feeToken
        'address', // verifier
        'address', // coordinator
      ],
      [
        commitment.requestId,
        commitment.subscriptionId,
        commitment.containerId,
        commitment.interval,
        commitment.useDeliveryInbox,
        commitment.redundancy,
        commitment.walletAddress,
        commitment.feeAmount,
        commitment.feeToken,
        commitment.verifier,
        commitment.coordinator,
      ]
    );
  }

  /**
   * Create Commitment from RequestStartedEvent
   */
  static fromEvent(event: any, walletAddress: string): Commitment {
    return {
      requestId: event.requestId,
      subscriptionId: event.subscriptionId,
      containerId: event.containerId,
      interval: event.interval,
      redundancy: event.redundancy,
      useDeliveryInbox: event.useDeliveryInbox || false,
      feeToken: event.feeToken,
      feeAmount: event.feeAmount,
      walletAddress: walletAddress, // Client wallet from subscription
      verifier: event.verifier || ethers.ZeroAddress,
      coordinator: event.coordinator,
    };
  }
}
