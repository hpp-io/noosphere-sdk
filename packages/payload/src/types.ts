/**
 * PayloadData: On-chain payload reference structure
 *
 * Used to reference off-chain data with integrity verification.
 * Supports multiple URI schemes: data:, ipfs://, https://, chain://
 */
export interface PayloadData {
  /** keccak256(content) - for integrity verification */
  contentHash: `0x${string}`;
  /** Full URI string (e.g., "ipfs://Qm...", "https://...", "data:...") */
  uri: string;
}

/**
 * Supported URI schemes
 */
export type PayloadScheme = 'data' | 'ipfs' | 'https' | 'http';

/**
 * Payload type detection enum
 */
export enum PayloadType {
  /** Empty URI - data is inline/on-chain */
  INLINE = 'inline',
  /** data: URI scheme (base64 encoded) */
  DATA_URI = 'data_uri',
  /** ipfs:// URI scheme */
  IPFS = 'ipfs',
  /** https:// URI scheme */
  HTTPS = 'https',
  /** http:// URI scheme */
  HTTP = 'http',
  /** Unknown scheme */
  UNKNOWN = 'unknown',
}

/**
 * Result of resolving a payload
 */
export interface ResolvedPayload {
  /** The resolved content */
  content: string;
  /** Whether the content hash was verified */
  verified: boolean;
  /** The payload type that was resolved */
  type: PayloadType;
}

/**
 * Upload result from storage providers
 */
export interface UploadResult {
  /** Full URI (e.g., "ipfs://Qm...", "https://...") */
  uri: string;
  /** Content identifier (CID for IPFS, key for S3) */
  contentId: string;
}

/**
 * IPFS storage configuration
 */
export interface IpfsConfig {
  /** IPFS gateway URL for downloads (default: https://ipfs.io/ipfs/) */
  gateway?: string;
  /** Pinata API key (for uploads) */
  pinataApiKey?: string;
  /** Pinata API secret (for uploads) */
  pinataApiSecret?: string;
  /** Local IPFS API URL (for uploads, default: http://localhost:5001) */
  apiUrl?: string;
}

/**
 * S3/R2 storage configuration
 */
export interface S3Config {
  /** S3-compatible endpoint URL */
  endpoint: string;
  /** Bucket name */
  bucket: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Region (default: auto) */
  region?: string;
  /** Public URL base for downloads */
  publicUrlBase?: string;
  /** Optional key prefix */
  keyPrefix?: string;
  /** Use path-style URLs (required for MinIO) */
  forcePathStyle?: boolean;
}

/**
 * PayloadResolver configuration
 */
export interface PayloadResolverConfig {
  /** Size threshold for auto-upload (bytes, default: 1024) */
  uploadThreshold?: number;
  /** Default storage for large outputs: 'ipfs' | 's3' | 'data' */
  defaultStorage?: 'ipfs' | 's3' | 'data';
  /** IPFS configuration */
  ipfs?: IpfsConfig;
  /** S3/R2 configuration */
  s3?: S3Config;
}
