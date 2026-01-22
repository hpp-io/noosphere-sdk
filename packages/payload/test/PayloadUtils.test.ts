import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  detectPayloadType,
  getScheme,
  verifyContentHash,
  createInlinePayload,
  createDataUriPayload,
  createIpfsPayload,
  createHttpsPayload,
  parseDataUri,
  extractIpfsCid,
  isValidPayloadUri,
  encodeBase64,
  decodeBase64,
  ZERO_HASH,
  isZeroHash,
  parsePayloadFromBytes,
} from '../src/PayloadUtils';
import { stringToHex } from 'viem';
import { PayloadType } from '../src/types';

describe('PayloadUtils', () => {
  describe('computeContentHash', () => {
    it('should compute keccak256 hash of content', () => {
      const hash = computeContentHash('hello');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const hash1 = computeContentHash('test content');
      const hash2 = computeContentHash('test content');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = computeContentHash('content1');
      const hash2 = computeContentHash('content2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('detectPayloadType', () => {
    it('should detect inline payload (empty URI)', () => {
      const type = detectPayloadType({ contentHash: ZERO_HASH, uri: '' });
      expect(type).toBe(PayloadType.INLINE);
    });

    it('should detect data: URI', () => {
      const type = detectPayloadType({
        contentHash: ZERO_HASH,
        uri: 'data:application/json;base64,eyJ0ZXN0IjoidmFsdWUifQ==',
      });
      expect(type).toBe(PayloadType.DATA_URI);
    });

    it('should detect ipfs:// URI', () => {
      const type = detectPayloadType({
        contentHash: ZERO_HASH,
        uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      });
      expect(type).toBe(PayloadType.IPFS);
    });

    it('should detect https:// URI', () => {
      const type = detectPayloadType({
        contentHash: ZERO_HASH,
        uri: 'https://example.com/data.json',
      });
      expect(type).toBe(PayloadType.HTTPS);
    });

    it('should detect http:// URI', () => {
      const type = detectPayloadType({
        contentHash: ZERO_HASH,
        uri: 'http://example.com/data.json',
      });
      expect(type).toBe(PayloadType.HTTP);
    });

    it('should return unknown for unsupported schemes', () => {
      const type = detectPayloadType({
        contentHash: ZERO_HASH,
        uri: 'ftp://example.com/file',
      });
      expect(type).toBe(PayloadType.UNKNOWN);
    });
  });

  describe('getScheme', () => {
    it('should extract scheme from ipfs:// URI', () => {
      expect(getScheme('ipfs://Qm...')).toBe('ipfs');
    });

    it('should extract scheme from https:// URI', () => {
      expect(getScheme('https://example.com')).toBe('https');
    });

    it('should extract scheme from data: URI', () => {
      expect(getScheme('data:application/json;base64,...')).toBe('data');
    });

    it('should return null for invalid URI', () => {
      expect(getScheme('not-a-uri')).toBeNull();
    });
  });

  describe('verifyContentHash', () => {
    it('should return true for matching hash', () => {
      const content = 'test content';
      const hash = computeContentHash(content);
      expect(verifyContentHash(content, hash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const content = 'test content';
      expect(verifyContentHash(content, ZERO_HASH)).toBe(false);
    });

    it('should be case-insensitive for hash comparison', () => {
      const content = 'test';
      const hash = computeContentHash(content);
      const upperHash = hash.toUpperCase() as `0x${string}`;
      expect(verifyContentHash(content, upperHash)).toBe(true);
    });
  });

  describe('createInlinePayload', () => {
    it('should create payload with empty URI', () => {
      const payload = createInlinePayload('content');
      expect(payload.uri).toBe('');
      expect(payload.contentHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('createDataUriPayload', () => {
    it('should create data: URI payload with short format', () => {
      const payload = createDataUriPayload('{"test": "value"}');
      // Uses short format: data:;base64,... (no MIME type for gas optimization)
      expect(payload.uri).toMatch(/^data:;base64,/);
      expect(payload.contentHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should encode content correctly', () => {
      const payload = createDataUriPayload('plain text');
      expect(payload.uri).toMatch(/^data:;base64,/);
      // Verify base64 decodes back to original
      const base64Part = payload.uri.split(',')[1];
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(decoded).toBe('plain text');
    });
  });

  describe('createIpfsPayload', () => {
    it('should create ipfs:// URI payload', () => {
      const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const payload = createIpfsPayload('content', cid);
      expect(payload.uri).toBe(`ipfs://${cid}`);
    });
  });

  describe('createHttpsPayload', () => {
    it('should create https:// URI payload', () => {
      const url = 'https://example.com/data.json';
      const payload = createHttpsPayload('content', url);
      expect(payload.uri).toBe(url);
    });
  });

  describe('parseDataUri', () => {
    it('should parse base64 encoded data URI', () => {
      const content = '{"test": "value"}';
      const base64 = encodeBase64(content);
      const uri = `data:application/json;base64,${base64}`;

      const parsed = parseDataUri(uri);
      expect(parsed.mimeType).toBe('application/json');
      expect(parsed.encoding).toBe('base64');
      expect(parsed.content).toBe(content);
    });

    it('should parse URL-encoded data URI', () => {
      const uri = 'data:text/plain,hello%20world';
      const parsed = parseDataUri(uri);
      expect(parsed.mimeType).toBe('text/plain');
      expect(parsed.content).toBe('hello world');
    });

    it('should throw on invalid data URI', () => {
      expect(() => parseDataUri('not-a-data-uri')).toThrow('Invalid data URI format');
    });
  });

  describe('extractIpfsCid', () => {
    it('should extract CID from ipfs:// URI', () => {
      const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      expect(extractIpfsCid(`ipfs://${cid}`)).toBe(cid);
    });

    it('should throw on invalid IPFS URI', () => {
      expect(() => extractIpfsCid('https://example.com')).toThrow('Invalid IPFS URI format');
    });
  });

  describe('isValidPayloadUri', () => {
    it('should accept empty string', () => {
      expect(isValidPayloadUri('')).toBe(true);
    });

    it('should accept data: URI', () => {
      expect(isValidPayloadUri('data:text/plain,hello')).toBe(true);
    });

    it('should accept ipfs:// URI', () => {
      expect(isValidPayloadUri('ipfs://Qm...')).toBe(true);
    });

    it('should accept https:// URI', () => {
      expect(isValidPayloadUri('https://example.com')).toBe(true);
    });

    it('should reject invalid URI', () => {
      expect(isValidPayloadUri('ftp://example.com')).toBe(false);
    });
  });

  describe('base64 encoding/decoding', () => {
    it('should encode and decode ASCII text', () => {
      const text = 'Hello, World!';
      const encoded = encodeBase64(text);
      const decoded = decodeBase64(encoded);
      expect(decoded).toBe(text);
    });

    it('should handle UTF-8 text', () => {
      const text = '안녕하세요 🌍';
      const encoded = encodeBase64(text);
      const decoded = decodeBase64(encoded);
      expect(decoded).toBe(text);
    });

    it('should handle JSON content', () => {
      const json = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });
      const encoded = encodeBase64(json);
      const decoded = decodeBase64(encoded);
      expect(decoded).toBe(json);
    });
  });

  describe('ZERO_HASH and isZeroHash', () => {
    it('should have correct zero hash value', () => {
      expect(ZERO_HASH).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('should detect zero hash', () => {
      expect(isZeroHash(ZERO_HASH)).toBe(true);
    });

    it('should not detect non-zero hash as zero', () => {
      const hash = computeContentHash('test');
      expect(isZeroHash(hash)).toBe(false);
    });
  });

  describe('parsePayloadFromBytes', () => {
    it('should parse payload from hex-encoded URI bytes', () => {
      const uri = 'ipfs://QmTestCid';
      const uriHex = stringToHex(uri);
      const contentHash = computeContentHash('content');

      const payload = parsePayloadFromBytes(contentHash, uriHex);

      expect(payload.contentHash).toBe(contentHash);
      expect(payload.uri).toBe(uri);
    });

    it('should handle empty URI bytes (0x)', () => {
      const contentHash = computeContentHash('content');

      const payload = parsePayloadFromBytes(contentHash, '0x');

      expect(payload.contentHash).toBe(contentHash);
      expect(payload.uri).toBe('');
    });

    it('should handle undefined/empty URI bytes', () => {
      const contentHash = computeContentHash('content');

      const payload = parsePayloadFromBytes(contentHash, '' as `0x${string}`);

      expect(payload.contentHash).toBe(contentHash);
      expect(payload.uri).toBe('');
    });

    it('should handle bytes that decode to non-UTF8 characters', () => {
      const contentHash = computeContentHash('content');
      // Bytes that decode but might produce replacement characters
      const bytesHex = '0xffff' as `0x${string}`;

      const payload = parsePayloadFromBytes(contentHash, bytesHex);

      // hexToString decodes to replacement characters, not fallback
      expect(payload.contentHash).toBe(contentHash);
      // The decoded result contains replacement characters
      expect(payload.uri.length).toBeGreaterThan(0);
    });
  });
});
