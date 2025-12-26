import { ethers } from 'ethers';

export class RequestIdUtils {
  /**
   * Pack subscriptionId and interval into requestId
   * Matches Solidity: keccak256(abi.encodePacked(subscriptionId, interval))
   */
  static pack(subscriptionId: bigint, interval: number): string {
    // encodePacked for uint64 and uint32
    const subscriptionIdBytes = ethers.zeroPadValue(
      ethers.toBeHex(subscriptionId),
      8
    );
    const intervalBytes = ethers.zeroPadValue(
      ethers.toBeHex(interval),
      4
    );

    const packed = ethers.concat([subscriptionIdBytes, intervalBytes]);
    return ethers.keccak256(packed);
  }

  /**
   * Unpack requestId into subscriptionId and interval (if stored separately)
   * Note: This is not possible from the hash alone - only for informational purposes
   * In practice, subscriptionId and interval are stored in events
   */
  static format(requestId: string, subscriptionId: bigint, interval: number): string {
    return `Request(id=${requestId.slice(0, 10)}..., sub=${subscriptionId}, interval=${interval})`;
  }
}
