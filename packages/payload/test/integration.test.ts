/**
 * Integration tests for @noosphere/payload
 *
 * Tests end-to-end scenarios including:
 * - Round-trip encoding and decoding
 * - Cross-storage compatibility
 * - Hash verification workflows
 */
import { describe, it, expect } from 'vitest';
import {
  PayloadResolver,
  createDataUriPayload,
  createInlinePayload,
  computeContentHash,
  verifyContentHash,
  detectPayloadType,
  parseDataUri,
  encodeBase64,
  decodeBase64,
  isZeroHash,
  ZERO_HASH,
} from '../src/index';
import { PayloadType } from '../src/types';

describe('Integration: Round-trip encoding/decoding', () => {
  const resolver = new PayloadResolver();

  it('should round-trip JSON content via data URI', async () => {
    const original = JSON.stringify({ action: 'test', data: [1, 2, 3] });

    // Encode
    const payload = await resolver.encode(original);

    // Decode
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });

  it('should round-trip UTF-8 content via data URI', async () => {
    const original = '한글 테스트 with emoji 🚀';

    const payload = await resolver.encode(original);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });

  it('should round-trip multiline content', async () => {
    const original = `Line 1
Line 2
  Indented line
Last line`;

    const payload = await resolver.encode(original);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });

  it('should round-trip special characters', async () => {
    const original = 'Special chars: <>&"\'\\n\\t\\r';

    const payload = await resolver.encode(original);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });

  it('should round-trip empty string', async () => {
    const original = '';

    const payload = await resolver.encode(original);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });

  it('should round-trip large content', async () => {
    const original = 'x'.repeat(10000);

    const payload = await resolver.encode(original);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(original);
    expect(result.verified).toBe(true);
  });
});

describe('Integration: Hash verification workflow', () => {
  it('should verify hash after encoding and decoding', async () => {
    const content = 'Content to verify';

    const payload = createDataUriPayload(content);

    // Manually verify
    const isValid = verifyContentHash(content, payload.contentHash);
    expect(isValid).toBe(true);

    // Verify through resolver
    const resolver = new PayloadResolver();
    const result = await resolver.resolve(payload);
    expect(result.verified).toBe(true);
  });

  it('should detect tampered content', async () => {
    const originalContent = 'Original content';
    const tamperedContent = 'Tampered content';

    const payload = createDataUriPayload(originalContent);

    // Verification with original should pass
    expect(verifyContentHash(originalContent, payload.contentHash)).toBe(true);

    // Verification with tampered should fail
    expect(verifyContentHash(tamperedContent, payload.contentHash)).toBe(false);
  });

  it('should compute consistent hashes', () => {
    const content = 'Consistent hash test';

    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    const hash3 = computeContentHash(content);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });
});

describe('Integration: Payload type detection', () => {
  it('should detect inline payload', () => {
    const payload = createInlinePayload('content');
    expect(detectPayloadType(payload)).toBe(PayloadType.INLINE);
  });

  it('should detect data URI payload', () => {
    const payload = createDataUriPayload('content');
    expect(detectPayloadType(payload)).toBe(PayloadType.DATA_URI);
  });

  it('should detect IPFS payload', () => {
    const payload = {
      contentHash: computeContentHash('content'),
      uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    };
    expect(detectPayloadType(payload)).toBe(PayloadType.IPFS);
  });

  it('should detect HTTPS payload', () => {
    const payload = {
      contentHash: computeContentHash('content'),
      uri: 'https://example.com/data.json',
    };
    expect(detectPayloadType(payload)).toBe(PayloadType.HTTPS);
  });
});

describe('Integration: Base64 encoding workflow', () => {
  it('should encode and decode via data URI', async () => {
    const original = 'Test content for base64';

    // Manual base64 encoding
    const base64 = encodeBase64(original);
    const dataUri = `data:application/json;base64,${base64}`;

    // Parse data URI
    const parsed = parseDataUri(dataUri);
    expect(parsed.content).toBe(original);
    expect(parsed.mimeType).toBe('application/json');
    expect(parsed.encoding).toBe('base64');
  });

  it('should handle binary-like content in base64', () => {
    const binaryLike = String.fromCharCode(0, 1, 2, 255, 254, 253);

    const encoded = encodeBase64(binaryLike);
    const decoded = decodeBase64(encoded);

    expect(decoded).toBe(binaryLike);
  });
});

describe('Integration: Zero hash handling', () => {
  it('should create zero hash for inline payload', () => {
    // Inline payloads should have proper content hash
    const payload = createInlinePayload('content');
    expect(isZeroHash(payload.contentHash)).toBe(false);
  });

  it('should correctly identify zero hash', () => {
    expect(isZeroHash(ZERO_HASH)).toBe(true);
    expect(isZeroHash(computeContentHash('any content'))).toBe(false);
  });

  it('should not verify zero hash payloads', async () => {
    const resolver = new PayloadResolver();
    const payload = {
      contentHash: ZERO_HASH,
      uri: '',
    };

    const result = await resolver.resolve(payload, 'any content');
    // Zero hash means verification is skipped, so verified should be false
    expect(result.verified).toBe(false);
  });
});

describe('Integration: Multiple resolver instances', () => {
  it('should work independently with different thresholds', async () => {
    const smallThresholdResolver = new PayloadResolver({ uploadThreshold: 10 });
    const largeThresholdResolver = new PayloadResolver({ uploadThreshold: 10000 });

    const mediumContent = 'x'.repeat(100);

    expect(smallThresholdResolver.shouldUpload(mediumContent)).toBe(true);
    expect(largeThresholdResolver.shouldUpload(mediumContent)).toBe(false);
  });

  it('should resolve payloads created by another resolver', async () => {
    const resolver1 = new PayloadResolver();
    const resolver2 = new PayloadResolver();

    const content = 'Shared content';
    const payload = await resolver1.encode(content);
    const result = await resolver2.resolve(payload);

    expect(result.content).toBe(content);
    expect(result.verified).toBe(true);
  });
});

describe('Integration: Edge cases', () => {
  it('should handle JSON with nested structures', async () => {
    const resolver = new PayloadResolver();
    const complex = JSON.stringify({
      level1: {
        level2: {
          level3: {
            array: [1, 2, { nested: true }],
            unicode: '한글 🎉',
          },
        },
      },
    });

    const payload = await resolver.encode(complex);
    const result = await resolver.resolve(payload);

    expect(JSON.parse(result.content)).toEqual(JSON.parse(complex));
  });

  it('should handle content with only whitespace', async () => {
    const resolver = new PayloadResolver();
    const whitespace = '   \n\t\r\n   ';

    const payload = await resolver.encode(whitespace);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(whitespace);
  });

  it('should handle very long single-line content', async () => {
    const resolver = new PayloadResolver();
    const longLine = 'a'.repeat(50000);

    const payload = await resolver.encode(longLine);
    const result = await resolver.resolve(payload);

    expect(result.content).toBe(longLine);
    expect(result.content.length).toBe(50000);
  });
});
