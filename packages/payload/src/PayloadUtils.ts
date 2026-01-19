/**
 * PayloadUtils - Utility functions for PayloadData creation and manipulation
 */
import { keccak256, stringToHex, hexToString } from 'viem';
import type { PayloadData, PayloadScheme, PayloadType } from './types';

/**
 * Compute content hash using keccak256
 */
export function computeContentHash(content: string): `0x${string}` {
  return keccak256(stringToHex(content));
}

/**
 * Detect the type of payload from PayloadData
 */
export function detectPayloadType(payload: PayloadData): PayloadType {
  if (!payload.uri || payload.uri === '') {
    return 'inline' as PayloadType;
  }

  if (payload.uri.startsWith('data:')) {
    return 'data_uri' as PayloadType;
  }

  if (payload.uri.startsWith('ipfs://')) {
    return 'ipfs' as PayloadType;
  }

  if (payload.uri.startsWith('https://')) {
    return 'https' as PayloadType;
  }

  if (payload.uri.startsWith('http://')) {
    return 'http' as PayloadType;
  }

  return 'unknown' as PayloadType;
}

/**
 * Extract scheme from URI
 */
export function getScheme(uri: string): PayloadScheme | null {
  const match = uri.match(/^([a-z]+):\/\//);
  if (match) {
    return match[1] as PayloadScheme;
  }
  if (uri.startsWith('data:')) {
    return 'data';
  }
  return null;
}

/**
 * Verify content hash matches PayloadData
 */
export function verifyContentHash(content: string, expectedHash: `0x${string}`): boolean {
  const computedHash = computeContentHash(content);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Create PayloadData with inline data (empty URI)
 */
export function createInlinePayload(content: string): PayloadData {
  return {
    contentHash: computeContentHash(content),
    uri: '',
  };
}

/**
 * Create PayloadData with data: URI (base64 encoded)
 */
export function createDataUriPayload(
  content: string,
  mimeType: string = 'application/json'
): PayloadData {
  const base64Content = encodeBase64(content);
  const uri = `data:${mimeType};base64,${base64Content}`;
  return {
    contentHash: computeContentHash(content),
    uri,
  };
}

/**
 * Create PayloadData with IPFS URI
 */
export function createIpfsPayload(content: string, cid: string): PayloadData {
  return {
    contentHash: computeContentHash(content),
    uri: `ipfs://${cid}`,
  };
}

/**
 * Create PayloadData with HTTPS URI
 */
export function createHttpsPayload(content: string, url: string): PayloadData {
  return {
    contentHash: computeContentHash(content),
    uri: url,
  };
}

/**
 * Create PayloadData from pre-computed values
 */
export function createPayload(contentHash: `0x${string}`, uri: string): PayloadData {
  return { contentHash, uri };
}

/**
 * Parse data: URI and extract content
 */
export function parseDataUri(dataUri: string): {
  mimeType: string;
  encoding: string;
  content: string;
} {
  const match = dataUri.match(/^data:([^;,]+)?(;([^,]+))?,(.*)$/);
  if (!match) {
    throw new Error('Invalid data URI format');
  }

  const mimeType = match[1] || 'text/plain';
  const encoding = match[3] || 'utf-8';
  const encodedContent = match[4];

  let content: string;
  if (encoding === 'base64') {
    content = decodeBase64(encodedContent);
  } else {
    content = decodeURIComponent(encodedContent);
  }

  return { mimeType, encoding, content };
}

/**
 * Extract CID from IPFS URI
 */
export function extractIpfsCid(ipfsUri: string): string {
  if (!ipfsUri.startsWith('ipfs://')) {
    throw new Error('Invalid IPFS URI format');
  }
  return ipfsUri.slice(7);
}

/**
 * Parse PayloadData from contract output bytes
 */
export function parsePayloadFromBytes(
  contentHash: `0x${string}`,
  uriBytes: `0x${string}`
): PayloadData {
  let uri = '';
  if (uriBytes && uriBytes !== '0x') {
    try {
      uri = hexToString(uriBytes);
    } catch {
      uri = uriBytes;
    }
  }
  return { contentHash, uri };
}

/**
 * Check if a string is a valid URI for PayloadData
 */
export function isValidPayloadUri(str: string): boolean {
  return (
    str === '' ||
    str.startsWith('data:') ||
    str.startsWith('ipfs://') ||
    str.startsWith('https://') ||
    str.startsWith('http://')
  );
}

/**
 * Encode string to base64 (works in both browser and Node.js)
 */
export function encodeBase64(content: string): string {
  if (typeof btoa !== 'undefined') {
    // Browser
    return btoa(unescape(encodeURIComponent(content)));
  } else {
    // Node.js
    return Buffer.from(content, 'utf-8').toString('base64');
  }
}

/**
 * Decode base64 to string (works in both browser and Node.js)
 */
export function decodeBase64(base64: string): string {
  if (typeof atob !== 'undefined') {
    // Browser - handle UTF-8 properly
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } else {
    // Node.js
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Zero hash constant (used for empty/invalid payloads)
 */
export const ZERO_HASH: `0x${string}` =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Check if a hash is the zero hash
 */
export function isZeroHash(hash: `0x${string}`): boolean {
  return hash === ZERO_HASH;
}
