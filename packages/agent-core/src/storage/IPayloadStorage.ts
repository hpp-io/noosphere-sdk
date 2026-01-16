/**
 * Payload Storage Interface
 *
 * Defines the contract for storage providers that can upload/download payload data.
 * Implementations: IpfsStorage, ArweaveStorage, HttpStorage, etc.
 */

/**
 * Storage provider configuration
 */
export interface StorageConfig {
  /** API endpoint URL */
  apiUrl?: string;
  /** Gateway URL for fetching content */
  gateway?: string;
  /** API key for authentication */
  apiKey?: string;
  /** API secret for authentication */
  apiSecret?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Upload result containing the URI and metadata
 */
export interface UploadResult {
  /** Full URI (e.g., "ipfs://Qm...", "ar://...") */
  uri: string;
  /** Content identifier (CID for IPFS, txId for Arweave) */
  contentId: string;
  /** Size of uploaded content in bytes */
  size: number;
}

/**
 * Storage provider interface
 */
export interface IPayloadStorage {
  /**
   * Upload content to storage
   * @param content - Content to upload (string or Buffer)
   * @returns Upload result with URI
   */
  upload(content: string | Buffer): Promise<UploadResult>;

  /**
   * Download content from storage
   * @param uri - Full URI (e.g., "ipfs://Qm...")
   * @returns Downloaded content as string
   */
  download(uri: string): Promise<string>;

  /**
   * Check if the storage provider is configured and available
   * @returns true if storage is ready to use
   */
  isConfigured(): boolean;

  /**
   * Get the URI scheme this storage provider handles
   * @returns Scheme string (e.g., "ipfs", "ar", "https")
   */
  getScheme(): string;
}
