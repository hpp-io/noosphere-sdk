/**
 * @noosphere/payload
 *
 * PayloadData utilities for URI-based payload handling.
 * Works in both browser and Node.js environments.
 *
 * @example
 * ```typescript
 * import { PayloadResolver, createDataUriPayload } from '@noosphere/payload';
 *
 * // Create PayloadData
 * const payload = createDataUriPayload('{"action": "ping"}');
 *
 * // Resolve PayloadData
 * const resolver = new PayloadResolver({ ipfs: { gateway: 'https://ipfs.io/ipfs/' } });
 * const { content, verified } = await resolver.resolve(payload);
 * ```
 */

// Types
export type {
  PayloadData,
  PayloadScheme,
  ResolvedPayload,
  UploadResult,
  IpfsConfig,
  S3Config,
  PayloadResolverConfig,
} from './types';

export { PayloadType } from './types';

// Utils
export {
  computeContentHash,
  detectPayloadType,
  getScheme,
  verifyContentHash,
  createInlinePayload,
  createDataUriPayload,
  createIpfsPayload,
  createHttpsPayload,
  createPayload,
  parseDataUri,
  extractIpfsCid,
  parsePayloadFromBytes,
  isValidPayloadUri,
  encodeBase64,
  decodeBase64,
  ZERO_HASH,
  isZeroHash,
} from './PayloadUtils';

// Resolver
export { PayloadResolver } from './PayloadResolver';

// Storage providers
export {
  type IPayloadStorage,
  DataUriStorage,
  HttpStorage,
  IpfsStorage,
  S3Storage,
} from './storage';
