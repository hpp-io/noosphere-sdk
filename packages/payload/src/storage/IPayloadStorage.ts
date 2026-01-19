/**
 * IPayloadStorage - Interface for payload storage providers
 *
 * Implementations: IpfsStorage, S3Storage, DataUriStorage, HttpStorage
 */
import type { UploadResult } from '../types';

/**
 * Storage provider interface
 */
export interface IPayloadStorage {
  /** Provider name (e.g., 'ipfs', 's3', 'data') */
  readonly name: string;

  /**
   * Upload content to storage
   * @param content - Content to upload (string or Buffer)
   * @returns Upload result with URI and content ID
   */
  upload(content: string | Uint8Array): Promise<UploadResult>;

  /**
   * Download content from storage
   * @param uri - URI to download from
   * @returns Downloaded content as string
   */
  download(uri: string): Promise<string>;

  /**
   * Check if this provider can handle the given URI
   * @param uri - URI to check
   * @returns true if this provider can handle the URI
   */
  canHandle(uri: string): boolean;
}
