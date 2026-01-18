/**
 * PayloadResolver - Unified Payload Resolution
 *
 * This module wraps @noosphere/payload for backward compatibility.
 * New code should use @noosphere/payload directly.
 *
 * Resolves PayloadData to actual content by:
 * 1. Detecting URI scheme (data:, ipfs://, https://, http://)
 * 2. Fetching content from appropriate storage
 * 3. Verifying content hash for integrity
 *
 * Also handles encoding output as PayloadData with automatic
 * storage selection based on content size.
 *
 * @example
 * ```typescript
 * const resolver = new PayloadResolver({
 *   ipfs: { gateway: 'http://localhost:8080/ipfs/' },
 *   uploadThreshold: 1024,
 *   defaultStorage: 'ipfs'
 * });
 *
 * // Resolve input from PayloadData
 * const content = await resolver.resolve(payloadData);
 *
 * // Encode output as PayloadData (auto-uploads if large)
 * const outputPayload = await resolver.encode(outputContent);
 * ```
 */

import { ethers } from 'ethers';
import {
  PayloadResolver as BasePayloadResolver,
  IpfsStorage,
  S3Storage,
  DataUriStorage,
  HttpStorage,
  PayloadType,
  computeContentHash,
  verifyContentHash,
  createDataUriPayload,
  createIpfsPayload,
  createHttpsPayload,
  detectPayloadType as baseDetectPayloadType,
  type PayloadResolverConfig as BaseConfig,
  type IpfsConfig,
  type S3Config,
  type PayloadData as BasePayloadData,
} from '@noosphere/payload';
import type { PayloadData } from './types';

/**
 * Supported URI schemes
 */
export enum PayloadScheme {
  DATA = 'data',
  IPFS = 'ipfs',
  HTTPS = 'https',
  HTTP = 'http',
}

/**
 * PayloadResolver configuration
 */
export interface PayloadResolverConfig {
  /** IPFS storage configuration */
  ipfs?: IpfsConfig;
  /** S3-compatible storage configuration (R2, S3, MinIO) */
  s3?: S3Config;
  /** Size threshold for auto-upload (bytes, default: 1024) */
  uploadThreshold?: number;
  /** Default storage for large payloads ('ipfs' | 's3' | 'data') */
  defaultStorage?: 'ipfs' | 's3' | 'data';
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Resolved payload result
 */
export interface ResolvedPayload {
  /** Actual content string */
  content: string;
  /** Original PayloadData */
  payload: PayloadData;
  /** Detected scheme */
  scheme: PayloadScheme;
  /** Whether content hash was verified */
  verified: boolean;
}

export class PayloadResolver {
  private baseResolver: BasePayloadResolver;
  private ipfsStorage: IpfsStorage;
  private s3Storage: S3Storage | null = null;
  private dataUriStorage: DataUriStorage;
  private httpStorage: HttpStorage;
  private uploadThreshold: number;
  private defaultStorage: 'ipfs' | 's3' | 'data';

  constructor(config: PayloadResolverConfig = {}) {
    // Initialize @noosphere/payload resolver
    this.baseResolver = new BasePayloadResolver({
      ipfs: config.ipfs,
      s3: config.s3,
      uploadThreshold: config.uploadThreshold,
      defaultStorage: config.defaultStorage,
    });

    // Keep individual storage references for compatibility
    this.ipfsStorage = new IpfsStorage(config.ipfs);
    this.dataUriStorage = new DataUriStorage();
    this.httpStorage = new HttpStorage();
    this.uploadThreshold = config.uploadThreshold ?? 1024;
    this.defaultStorage = config.defaultStorage ?? 'ipfs';

    // Initialize S3 storage if configured
    if (config.s3) {
      this.s3Storage = new S3Storage(config.s3);
    }
  }

  /**
   * Convert agent-core PayloadData to @noosphere/payload PayloadData
   * Note: URI is decoded from hex if needed
   */
  private toBasePayload(payload: PayloadData): BasePayloadData {
    // Decode hex-encoded URI if it starts with 0x
    let uri = payload.uri;
    if (uri && uri.startsWith('0x') && uri !== '0x') {
      try {
        uri = ethers.toUtf8String(uri);
      } catch {
        // Keep as-is if not valid UTF-8
      }
    }
    return {
      contentHash: payload.contentHash as `0x${string}`,
      uri: uri || '',
    };
  }

  /**
   * Convert @noosphere/payload PayloadData to agent-core PayloadData
   * Note: URI is hex-encoded for on-chain compatibility
   */
  private fromBasePayload(payload: BasePayloadData): PayloadData {
    // Convert URI string to hex bytes for Solidity bytes type
    const uriBytes = payload.uri
      ? ethers.hexlify(ethers.toUtf8Bytes(payload.uri))
      : '0x';
    return {
      contentHash: payload.contentHash,
      uri: uriBytes,
    };
  }

  /**
   * Detect URI scheme from PayloadData
   */
  detectScheme(payload: PayloadData): PayloadScheme {
    const type = baseDetectPayloadType(this.toBasePayload(payload));
    switch (type) {
      case PayloadType.IPFS:
        return PayloadScheme.IPFS;
      case PayloadType.HTTPS:
        return PayloadScheme.HTTPS;
      case PayloadType.HTTP:
        return PayloadScheme.HTTP;
      case PayloadType.DATA_URI:
      default:
        return PayloadScheme.DATA;
    }
  }

  /**
   * Resolve PayloadData to actual content
   *
   * @param payload - PayloadData to resolve
   * @param verifyHash - Whether to verify content hash (default: true)
   * @returns Resolved content and metadata
   */
  async resolve(payload: PayloadData, verifyHash: boolean = true): Promise<ResolvedPayload> {
    const scheme = this.detectScheme(payload);
    const basePayload = this.toBasePayload(payload);

    const result = await this.baseResolver.resolve(basePayload);

    // Override verification if needed
    let verified = result.verified;
    if (!verifyHash) {
      verified = false;
    }

    return {
      content: result.content,
      payload,
      scheme,
      verified,
    };
  }

  /**
   * Encode content as PayloadData
   *
   * Automatically uploads to external storage if content exceeds threshold.
   *
   * @param content - Content to encode
   * @param options - Encoding options
   * @returns PayloadData ready for on-chain submission
   */
  async encode(
    content: string,
    options: {
      forceUpload?: boolean;
      storage?: 'ipfs' | 's3' | 'data';
    } = {}
  ): Promise<PayloadData> {
    const result = await this.baseResolver.encode(content, options);
    return this.fromBasePayload(result);
  }

  /**
   * Create empty PayloadData
   */
  createEmpty(): PayloadData {
    return {
      contentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      uri: '',
    };
  }

  /**
   * Verify content matches PayloadData hash
   */
  verifyContent(payload: PayloadData, content: string): boolean {
    return verifyContentHash(content, payload.contentHash as `0x${string}`);
  }

  /**
   * Get the configured IPFS storage instance
   */
  getIpfsStorage(): IpfsStorage {
    return this.ipfsStorage;
  }

  /**
   * Get the configured S3 storage instance
   */
  getS3Storage(): S3Storage | null {
    return this.s3Storage;
  }

  /**
   * Check if IPFS is configured
   */
  isIpfsConfigured(): boolean {
    return this.ipfsStorage.isConfigured();
  }

  /**
   * Check if S3 is configured
   */
  isS3Configured(): boolean {
    return this.s3Storage?.isConfigured() ?? false;
  }

  /**
   * Get the default storage type
   */
  getDefaultStorage(): 'ipfs' | 's3' | 'data' {
    return this.defaultStorage;
  }

  /**
   * Serialize PayloadData for database storage
   */
  serialize(payload: PayloadData): string {
    return JSON.stringify({
      contentHash: payload.contentHash,
      uri: payload.uri,
    });
  }

  /**
   * Deserialize PayloadData from database storage
   */
  deserialize(serialized: string): PayloadData {
    try {
      const parsed = JSON.parse(serialized);
      return {
        contentHash: parsed.contentHash,
        uri: parsed.uri || '',
      };
    } catch {
      // Legacy format - treat as raw content
      const hash = computeContentHash(serialized);
      const base64 = Buffer.from(serialized, 'utf-8').toString('base64');
      return {
        contentHash: hash,
        uri: `data:application/json;base64,${base64}`,
      };
    }
  }
}

// Re-export from @noosphere/payload for convenience
export {
  computeContentHash,
  verifyContentHash,
  createDataUriPayload,
  createIpfsPayload,
  createHttpsPayload,
  PayloadType,
} from '@noosphere/payload';

// For backward compatibility, also export detectPayloadType
export { detectPayloadType } from '@noosphere/payload';
