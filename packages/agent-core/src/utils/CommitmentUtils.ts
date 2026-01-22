import { ethers } from 'ethers';
import type { Commitment, PayloadData } from '../types';

/**
 * Utility class for PayloadData creation and encoding
 */
export class PayloadUtils {
  /**
   * Create PayloadData from content with data: URI scheme (inline)
   * Best for small payloads (<1KB)
   * @param content - The content to embed
   * @returns PayloadData with contentHash and data: URI
   */
  static fromInlineData(content: string): PayloadData {
    const contentBytes = ethers.toUtf8Bytes(content);
    const contentHash = ethers.keccak256(contentBytes);
    // Encode as data: URI (base64) and convert to hex bytes
    const base64Content = Buffer.from(content, 'utf-8').toString('base64');
    const dataUri = `data:;base64,${base64Content}`;
    // Convert URI string to hex bytes for Solidity bytes type
    const uriBytes = ethers.hexlify(ethers.toUtf8Bytes(dataUri));
    return {
      contentHash,
      uri: uriBytes,
    };
  }

  /**
   * Create PayloadData from content with external URI
   * Best for large payloads that are stored externally
   * @param content - The original content (for hash computation)
   * @param uri - The external URI (ipfs://, https://, ar://, etc.)
   * @returns PayloadData with contentHash and URI
   */
  static fromExternalUri(content: string, uri: string): PayloadData {
    const contentBytes = ethers.toUtf8Bytes(content);
    const contentHash = ethers.keccak256(contentBytes);
    // Convert URI string to hex bytes for Solidity bytes type
    const uriBytes = ethers.hexlify(ethers.toUtf8Bytes(uri));
    return {
      contentHash,
      uri: uriBytes,
    };
  }

  /**
   * Create PayloadData from pre-computed hash and URI
   * @param contentHash - Pre-computed keccak256 hash of content
   * @param uri - The URI (empty for inline, or external URI)
   * @returns PayloadData
   */
  static fromHashAndUri(contentHash: string, uri: string): PayloadData {
    // Convert URI string to hex bytes for Solidity bytes type (if not already hex)
    const uriBytes = uri.startsWith('0x') ? uri : ethers.hexlify(ethers.toUtf8Bytes(uri));
    return {
      contentHash,
      uri: uriBytes,
    };
  }

  /**
   * Create empty PayloadData (no content)
   * @returns PayloadData with zero hash and empty URI
   */
  static empty(): PayloadData {
    return {
      contentHash: ethers.ZeroHash,
      uri: '0x', // Empty bytes
    };
  }

  /**
   * Compute content hash using keccak256
   * @param content - Content string to hash
   * @returns bytes32 hash string
   */
  static computeHash(content: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(content));
  }

  /**
   * Verify that content matches the hash in PayloadData
   * @param payload - PayloadData to verify
   * @param content - Content to verify against
   * @returns true if content hash matches
   */
  static verifyContent(payload: PayloadData, content: string): boolean {
    const computedHash = this.computeHash(content);
    return computedHash === payload.contentHash;
  }
}

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
        'address', // walletAddress
        'uint256', // feeAmount
        'address', // feeToken
        'address', // verifier
        'address', // coordinator
        'uint256', // verifierFee
      ],
      [
        commitment.requestId,
        commitment.subscriptionId,
        commitment.containerId,
        commitment.interval,
        commitment.useDeliveryInbox,
        commitment.walletAddress,
        commitment.feeAmount,
        commitment.feeToken,
        commitment.verifier,
        commitment.coordinator,
        commitment.verifierFee,
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
        'address', // walletAddress
        'uint256', // feeAmount
        'address', // feeToken
        'address', // verifier
        'address', // coordinator
        'uint256', // verifierFee
      ],
      [
        commitment.requestId,
        commitment.subscriptionId,
        commitment.containerId,
        commitment.interval,
        commitment.useDeliveryInbox,
        commitment.walletAddress,
        commitment.feeAmount,
        commitment.feeToken,
        commitment.verifier,
        commitment.coordinator,
        commitment.verifierFee,
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
      useDeliveryInbox: event.useDeliveryInbox || false,
      walletAddress: walletAddress, // Client wallet from subscription
      feeAmount: event.feeAmount,
      feeToken: event.feeToken,
      verifier: event.verifier || ethers.ZeroAddress,
      coordinator: event.coordinator,
      verifierFee: event.verifierFee || BigInt(0),
    };
  }
}
