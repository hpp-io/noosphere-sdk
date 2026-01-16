/**
 * PayloadResolver - Unified Payload Resolution
 *
 * Resolves PayloadData to actual content by:
 * 1. Detecting URI scheme (data:, ipfs://, https://, ar://)
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
import type { PayloadData } from './types';
import { PayloadUtils } from './utils/CommitmentUtils';
import { IpfsStorage, type IpfsStorageConfig } from './storage/IpfsStorage';
import { DataUriStorage } from './storage/DataUriStorage';
import { HttpStorage } from './storage/HttpStorage';
import { S3Storage, type S3StorageConfig } from './storage/S3Storage';
import type { IPayloadStorage } from './storage/IPayloadStorage';

/**
 * Supported URI schemes
 */
export enum PayloadScheme {
  DATA = 'data',
  IPFS = 'ipfs',
  HTTPS = 'https',
  HTTP = 'http',
  ARWEAVE = 'ar',
  CHAIN = 'chain',
}

/**
 * PayloadResolver configuration
 */
export interface PayloadResolverConfig {
  /** IPFS storage configuration */
  ipfs?: IpfsStorageConfig;
  /** S3-compatible storage configuration (R2, S3, MinIO) */
  s3?: S3StorageConfig;
  /** Arweave gateway URL */
  arweaveGateway?: string;
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
  private ipfsStorage: IpfsStorage;
  private s3Storage: S3Storage | null = null;
  private dataUriStorage: DataUriStorage;
  private httpStorage: HttpStorage;
  private uploadThreshold: number;
  private defaultStorage: 'ipfs' | 's3' | 'data';
  private arweaveGateway: string;

  constructor(config: PayloadResolverConfig = {}) {
    this.ipfsStorage = new IpfsStorage(config.ipfs);
    this.dataUriStorage = new DataUriStorage();
    this.httpStorage = new HttpStorage({ timeout: config.timeout });
    this.uploadThreshold = config.uploadThreshold ?? 1024;
    this.defaultStorage = config.defaultStorage ?? 'ipfs';
    this.arweaveGateway = config.arweaveGateway || 'https://arweave.net';

    // Initialize S3 storage if configured
    if (config.s3) {
      this.s3Storage = new S3Storage(config.s3);
    }
  }

  /**
   * Detect URI scheme from PayloadData
   */
  detectScheme(payload: PayloadData): PayloadScheme {
    const uri = payload.uri;

    if (!uri || uri === '' || uri === '0x') {
      return PayloadScheme.DATA; // Empty URI treated as inline
    }

    if (uri.startsWith('data:')) return PayloadScheme.DATA;
    if (uri.startsWith('ipfs://')) return PayloadScheme.IPFS;
    if (uri.startsWith('https://')) return PayloadScheme.HTTPS;
    if (uri.startsWith('http://')) return PayloadScheme.HTTP;
    if (uri.startsWith('ar://')) return PayloadScheme.ARWEAVE;
    if (uri.startsWith('chain://')) return PayloadScheme.CHAIN;

    // Default to data if unrecognized
    return PayloadScheme.DATA;
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
    let content: string;

    switch (scheme) {
      case PayloadScheme.DATA:
        content = await this.dataUriStorage.download(payload.uri);
        break;

      case PayloadScheme.IPFS:
        content = await this.ipfsStorage.download(payload.uri);
        break;

      case PayloadScheme.HTTPS:
      case PayloadScheme.HTTP:
        content = await this.httpStorage.download(payload.uri);
        break;

      case PayloadScheme.ARWEAVE:
        content = await this.resolveArweave(payload.uri);
        break;

      case PayloadScheme.CHAIN:
        throw new Error('Chain scheme not yet implemented');

      default:
        throw new Error(`Unsupported URI scheme: ${scheme}`);
    }

    // Verify content hash if requested
    let verified = false;
    if (verifyHash && payload.contentHash && payload.contentHash !== ethers.ZeroHash) {
      verified = PayloadUtils.verifyContent(payload, content);
      if (!verified) {
        console.warn('PayloadResolver: Content hash verification failed');
      }
    }

    return {
      content,
      payload,
      scheme,
      verified,
    };
  }

  /**
   * Resolve Arweave URI
   */
  private async resolveArweave(uri: string): Promise<string> {
    const txId = uri.replace('ar://', '');
    const url = `${this.arweaveGateway}/${txId}`;
    return this.httpStorage.download(url);
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
    const contentSize = Buffer.byteLength(content, 'utf-8');
    const shouldUpload = options.forceUpload || contentSize > this.uploadThreshold;

    if (!shouldUpload) {
      // Inline as data: URI
      return PayloadUtils.fromInlineData(content);
    }

    // Upload to external storage
    const storage = options.storage || this.defaultStorage;

    if (storage === 'ipfs') {
      if (!this.ipfsStorage.isConfigured()) {
        console.warn('IPFS not configured, falling back to data URI');
        return PayloadUtils.fromInlineData(content);
      }

      try {
        const result = await this.ipfsStorage.upload(content);
        return PayloadUtils.fromExternalUri(content, result.uri);
      } catch (error) {
        console.warn(`IPFS upload failed, falling back to data URI: ${(error as Error).message}`);
        return PayloadUtils.fromInlineData(content);
      }
    } else if (storage === 's3') {
      if (!this.s3Storage || !this.s3Storage.isConfigured()) {
        console.warn('S3 not configured, falling back to data URI');
        return PayloadUtils.fromInlineData(content);
      }

      try {
        const result = await this.s3Storage.upload(content);
        return PayloadUtils.fromExternalUri(content, result.uri);
      } catch (error) {
        console.warn(`S3 upload failed, falling back to data URI: ${(error as Error).message}`);
        return PayloadUtils.fromInlineData(content);
      }
    } else {
      // Use data: URI for inline storage
      const result = await this.dataUriStorage.upload(content);
      return PayloadUtils.fromExternalUri(content, result.uri);
    }
  }

  /**
   * Create empty PayloadData
   */
  createEmpty(): PayloadData {
    return PayloadUtils.empty();
  }

  /**
   * Verify content matches PayloadData hash
   */
  verifyContent(payload: PayloadData, content: string): boolean {
    return PayloadUtils.verifyContent(payload, content);
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
      return PayloadUtils.fromInlineData(serialized);
    }
  }
}
