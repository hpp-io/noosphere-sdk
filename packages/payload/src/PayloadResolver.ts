/**
 * PayloadResolver - Resolves and encodes PayloadData
 *
 * Responsibilities:
 * 1. Resolving PayloadData from various URI schemes (data:, ipfs://, https://)
 * 2. Verifying content integrity via contentHash
 * 3. Encoding content as PayloadData with automatic storage selection
 */
import type {
  PayloadData,
  PayloadResolverConfig,
  ResolvedPayload,
} from './types';
import { PayloadType } from './types';
import {
  detectPayloadType,
  verifyContentHash,
  computeContentHash,
  createDataUriPayload,
  createIpfsPayload,
  createHttpsPayload,
  isZeroHash,
} from './PayloadUtils';
import type { IPayloadStorage } from './storage/IPayloadStorage';
import { DataUriStorage } from './storage/DataUriStorage';
import { HttpStorage } from './storage/HttpStorage';
import { IpfsStorage } from './storage/IpfsStorage';
import { S3Storage } from './storage/S3Storage';

const DEFAULT_UPLOAD_THRESHOLD = 1024; // 1KB

export class PayloadResolver {
  private dataUriStorage: DataUriStorage;
  private httpStorage: HttpStorage;
  private ipfsStorage?: IpfsStorage;
  private s3Storage?: S3Storage;
  private uploadThreshold: number;
  private defaultStorage: 'ipfs' | 's3' | 'data';

  constructor(config: PayloadResolverConfig = {}) {
    this.dataUriStorage = new DataUriStorage();
    this.httpStorage = new HttpStorage();
    this.uploadThreshold = config.uploadThreshold ?? DEFAULT_UPLOAD_THRESHOLD;
    this.defaultStorage = config.defaultStorage ?? 'data';

    // Initialize IPFS storage if configured
    if (config.ipfs) {
      this.ipfsStorage = new IpfsStorage(config.ipfs);
    }

    // Initialize S3 storage if configured
    if (config.s3) {
      this.s3Storage = new S3Storage(config.s3);
    }
  }

  /**
   * Resolve PayloadData to actual content with verification
   *
   * @param payload - PayloadData to resolve
   * @param inlineData - For inline payloads, the raw data from contract
   * @returns Resolved content with verification status
   */
  async resolve(payload: PayloadData, inlineData?: string): Promise<ResolvedPayload> {
    const type = detectPayloadType(payload);
    let content: string;

    switch (type) {
      case PayloadType.INLINE:
        if (!inlineData) {
          throw new Error('Inline data required for inline payload');
        }
        content = inlineData;
        break;

      case PayloadType.DATA_URI:
        content = await this.dataUriStorage.download(payload.uri);
        break;

      case PayloadType.IPFS:
        if (!this.ipfsStorage) {
          // Create temporary IPFS storage with default gateway
          const tempIpfs = new IpfsStorage();
          content = await tempIpfs.download(payload.uri);
        } else {
          content = await this.ipfsStorage.download(payload.uri);
        }
        break;

      case PayloadType.HTTPS:
      case PayloadType.HTTP:
        content = await this.httpStorage.download(payload.uri);
        break;

      default:
        throw new Error(`Unsupported payload type: ${type}`);
    }

    // Verify content hash if not zero hash
    let verified = false;
    if (!isZeroHash(payload.contentHash)) {
      verified = verifyContentHash(content, payload.contentHash);
      if (!verified) {
        console.warn('Content hash verification failed');
      }
    }

    return { content, verified, type };
  }

  /**
   * Encode content as PayloadData
   *
   * Automatically uploads to external storage if content exceeds threshold.
   *
   * @param content - Content to encode
   * @param options - Encoding options
   * @returns PayloadData with appropriate URI scheme
   */
  async encode(
    content: string,
    options: {
      forceUpload?: boolean;
      storage?: 'ipfs' | 's3' | 'data';
    } = {}
  ): Promise<PayloadData> {
    const contentSize = new TextEncoder().encode(content).length;
    const shouldUpload = options.forceUpload || contentSize > this.uploadThreshold;
    const storage = options.storage ?? this.defaultStorage;

    if (!shouldUpload || storage === 'data') {
      // Use inline data URI
      return createDataUriPayload(content);
    }

    // Upload to external storage
    if (storage === 'ipfs') {
      return this.uploadToIpfs(content);
    } else if (storage === 's3') {
      return this.uploadToS3(content);
    }

    // Fallback to data URI
    return createDataUriPayload(content);
  }

  /**
   * Upload content to IPFS and create PayloadData
   */
  private async uploadToIpfs(content: string): Promise<PayloadData> {
    if (!this.ipfsStorage) {
      throw new Error('IPFS storage not configured');
    }

    try {
      const result = await this.ipfsStorage.upload(content);
      return createIpfsPayload(content, result.contentId);
    } catch (error) {
      console.warn(`IPFS upload failed, falling back to data URI: ${(error as Error).message}`);
      return createDataUriPayload(content);
    }
  }

  /**
   * Upload content to S3 and create PayloadData
   */
  private async uploadToS3(content: string): Promise<PayloadData> {
    if (!this.s3Storage) {
      throw new Error('S3 storage not configured');
    }

    try {
      const result = await this.s3Storage.upload(content);
      return createHttpsPayload(content, result.uri);
    } catch (error) {
      console.warn(`S3 upload failed, falling back to data URI: ${(error as Error).message}`);
      return createDataUriPayload(content);
    }
  }

  /**
   * Get the storage provider that can handle a given URI
   */
  getStorageForUri(uri: string): IPayloadStorage | null {
    if (this.dataUriStorage.canHandle(uri)) return this.dataUriStorage;
    if (this.ipfsStorage?.canHandle(uri)) return this.ipfsStorage;
    if (this.s3Storage?.canHandle(uri)) return this.s3Storage;
    if (this.httpStorage.canHandle(uri)) return this.httpStorage;
    return null;
  }

  /**
   * Check if content should be uploaded based on size
   */
  shouldUpload(content: string): boolean {
    const contentSize = new TextEncoder().encode(content).length;
    return contentSize > this.uploadThreshold;
  }

  /**
   * Get the current upload threshold
   */
  getUploadThreshold(): number {
    return this.uploadThreshold;
  }

  /**
   * Set the upload threshold
   */
  setUploadThreshold(threshold: number): void {
    this.uploadThreshold = threshold;
  }
}
