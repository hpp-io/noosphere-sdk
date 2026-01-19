/**
 * Storage Providers
 *
 * Re-export all storage provider implementations from @noosphere/payload.
 * This module exists for backward compatibility.
 * New code should use @noosphere/payload directly.
 */

export {
  IpfsStorage,
  DataUriStorage,
  HttpStorage,
  S3Storage,
  type IPayloadStorage,
  type UploadResult,
  type IpfsConfig,
  type S3Config,
} from '@noosphere/payload';

// Legacy re-exports for compatibility
export type { IpfsConfig as IpfsStorageConfig } from '@noosphere/payload';
export type { S3Config as S3StorageConfig } from '@noosphere/payload';
