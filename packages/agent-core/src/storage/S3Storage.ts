/**
 * S3-Compatible Storage Provider
 *
 * Supports AWS S3, Cloudflare R2, MinIO, and other S3-compatible storage services.
 * Uses the AWS SDK v3 for S3 operations.
 *
 * @example
 * ```typescript
 * // Cloudflare R2
 * const storage = new S3Storage({
 *   endpoint: 'https://xxx.r2.cloudflarestorage.com',
 *   bucket: 'my-bucket',
 *   region: 'auto',
 *   accessKeyId: 'your-access-key',
 *   secretAccessKey: 'your-secret-key',
 *   publicUrlBase: 'https://pub-xxx.r2.dev'
 * });
 *
 * // AWS S3
 * const storage = new S3Storage({
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: 'your-access-key',
 *   secretAccessKey: 'your-secret-key',
 *   publicUrlBase: 'https://my-bucket.s3.us-east-1.amazonaws.com'
 * });
 *
 * // MinIO (local)
 * const storage = new S3Storage({
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   publicUrlBase: 'http://localhost:9000/my-bucket',
 *   forcePathStyle: true
 * });
 *
 * const result = await storage.upload('Hello, S3!');
 * console.log(result.uri); // "https://pub-xxx.r2.dev/abc123.json"
 * ```
 */

import { createHash } from 'crypto';
import type { IPayloadStorage, UploadResult } from './IPayloadStorage';

/**
 * S3-compatible storage configuration
 */
export interface S3StorageConfig {
  /** S3-compatible endpoint URL (required for R2/MinIO, optional for AWS S3) */
  endpoint?: string;

  /** Bucket name */
  bucket: string;

  /** AWS region (default: 'auto' for R2, 'us-east-1' for others) */
  region?: string;

  /** Access key ID */
  accessKeyId: string;

  /** Secret access key */
  secretAccessKey: string;

  /**
   * Public URL base for generating accessible URLs
   * e.g., "https://pub-xxx.r2.dev" or "https://cdn.example.com"
   */
  publicUrlBase: string;

  /**
   * Key prefix for organizing files
   * e.g., "noosphere/outputs/"
   */
  keyPrefix?: string;

  /**
   * Use path-style URLs (required for MinIO)
   * Default: false (uses virtual-hosted style)
   */
  forcePathStyle?: boolean;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Content type for uploaded files (default: 'application/json') */
  contentType?: string;
}

// Type definitions for AWS SDK (to avoid hard dependency)
interface S3Client {
  send(command: unknown): Promise<unknown>;
}

interface PutObjectCommand {
  new (input: {
    Bucket: string;
    Key: string;
    Body: string | Buffer;
    ContentType?: string;
  }): unknown;
}

export class S3Storage implements IPayloadStorage {
  private config: S3StorageConfig;
  private client: S3Client | null = null;
  private PutObjectCommandClass: PutObjectCommand | null = null;
  private initialized: boolean = false;
  private initError: Error | null = null;

  constructor(config: S3StorageConfig) {
    this.config = {
      region: config.endpoint ? 'auto' : 'us-east-1',
      keyPrefix: '',
      forcePathStyle: false,
      timeout: 30000,
      contentType: 'application/json',
      ...config,
    };

    // Ensure publicUrlBase doesn't end with /
    if (this.config.publicUrlBase.endsWith('/')) {
      this.config.publicUrlBase = this.config.publicUrlBase.slice(0, -1);
    }

    // Ensure keyPrefix ends with / if not empty
    if (this.config.keyPrefix && !this.config.keyPrefix.endsWith('/')) {
      this.config.keyPrefix += '/';
    }
  }

  /**
   * Lazily initialize the S3 client
   * This allows the class to be instantiated even if @aws-sdk/client-s3 is not installed
   */
  private async initClient(): Promise<void> {
    if (this.initialized) {
      if (this.initError) throw this.initError;
      return;
    }

    try {
      // Dynamic import to make @aws-sdk/client-s3 optional
      const s3Module = await import('@aws-sdk/client-s3');
      const { S3Client, PutObjectCommand } = s3Module;

      this.client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: this.config.forcePathStyle,
      });

      this.PutObjectCommandClass = PutObjectCommand as unknown as PutObjectCommand;
      this.initialized = true;
    } catch (error) {
      this.initError = new Error(
        'S3 storage requires @aws-sdk/client-s3. Install it with: npm install @aws-sdk/client-s3'
      );
      this.initialized = true;
      throw this.initError;
    }
  }

  getScheme(): string {
    return 'https';
  }

  isConfigured(): boolean {
    return !!(
      this.config.bucket &&
      this.config.accessKeyId &&
      this.config.secretAccessKey &&
      this.config.publicUrlBase
    );
  }

  /**
   * Generate a unique key for the content based on its hash
   */
  private generateKey(content: string): string {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const timestamp = Date.now();
    return `${this.config.keyPrefix}${hash}-${timestamp}.json`;
  }

  async upload(content: string | Buffer): Promise<UploadResult> {
    await this.initClient();

    if (!this.client || !this.PutObjectCommandClass) {
      throw new Error('S3 client not initialized');
    }

    const data = typeof content === 'string' ? content : content.toString('utf-8');
    const size = Buffer.byteLength(data, 'utf-8');
    const key = this.generateKey(data);

    const command = new (this.PutObjectCommandClass as any)({
      Bucket: this.config.bucket,
      Key: key,
      Body: data,
      ContentType: this.config.contentType,
    });

    await this.client.send(command);

    const publicUrl = `${this.config.publicUrlBase}/${key}`;

    return {
      uri: publicUrl,
      contentId: key,
      size,
    };
  }

  async download(uri: string): Promise<string> {
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      throw new Error('Invalid HTTP/HTTPS URI');
    }

    const response = await fetch(uri, {
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`S3 download failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Get the public URL for a given key
   */
  getPublicUrl(key: string): string {
    return `${this.config.publicUrlBase}/${key}`;
  }
}
