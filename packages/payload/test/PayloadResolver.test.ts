import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayloadResolver } from '../src/PayloadResolver';
import { createDataUriPayload, createInlinePayload, computeContentHash, createHttpsPayload, createIpfsPayload } from '../src/PayloadUtils';
import { PayloadType } from '../src/types';

describe('PayloadResolver', () => {
  let resolver: PayloadResolver;

  beforeEach(() => {
    resolver = new PayloadResolver();
  });

  describe('resolve', () => {
    it('should resolve inline payload with provided data', async () => {
      const content = '{"action": "test"}';
      const payload = createInlinePayload(content);

      const result = await resolver.resolve(payload, content);

      expect(result.content).toBe(content);
      expect(result.verified).toBe(true);
      expect(result.type).toBe(PayloadType.INLINE);
    });

    it('should throw error for inline payload without data', async () => {
      const payload = createInlinePayload('content');

      await expect(resolver.resolve(payload)).rejects.toThrow(
        'Inline data required for inline payload'
      );
    });

    it('should resolve data: URI payload', async () => {
      const content = '{"test": "value"}';
      const payload = createDataUriPayload(content);

      const result = await resolver.resolve(payload);

      expect(result.content).toBe(content);
      expect(result.verified).toBe(true);
      expect(result.type).toBe(PayloadType.DATA_URI);
    });

    it('should handle UTF-8 content in data: URI', async () => {
      const content = '{"message": "안녕하세요"}';
      const payload = createDataUriPayload(content);

      const result = await resolver.resolve(payload);

      expect(result.content).toBe(content);
      expect(result.verified).toBe(true);
    });

    it('should detect verification failure for tampered content', async () => {
      const content = '{"original": true}';
      const payload = createDataUriPayload(content);

      // Tamper with the hash
      const tamperedPayload = {
        ...payload,
        contentHash: computeContentHash('different content'),
      };

      const result = await resolver.resolve(tamperedPayload);

      expect(result.verified).toBe(false);
    });
  });

  describe('encode', () => {
    it('should encode small content as data: URI', async () => {
      resolver = new PayloadResolver({ uploadThreshold: 1024 });
      const content = 'small content';

      const payload = await resolver.encode(content);

      expect(payload.uri).toMatch(/^data:/);
      expect(payload.contentHash).toBe(computeContentHash(content));
    });

    it('should respect forceUpload option with data storage', async () => {
      const content = 'small';

      const payload = await resolver.encode(content, { forceUpload: true, storage: 'data' });

      expect(payload.uri).toMatch(/^data:/);
    });
  });

  describe('shouldUpload', () => {
    it('should return false for content below threshold', () => {
      resolver = new PayloadResolver({ uploadThreshold: 1024 });

      expect(resolver.shouldUpload('small content')).toBe(false);
    });

    it('should return true for content above threshold', () => {
      resolver = new PayloadResolver({ uploadThreshold: 10 });

      expect(resolver.shouldUpload('this content is larger than 10 bytes')).toBe(true);
    });
  });

  describe('getUploadThreshold / setUploadThreshold', () => {
    it('should return default threshold', () => {
      expect(resolver.getUploadThreshold()).toBe(1024);
    });

    it('should use custom threshold from config', () => {
      resolver = new PayloadResolver({ uploadThreshold: 2048 });
      expect(resolver.getUploadThreshold()).toBe(2048);
    });

    it('should update threshold', () => {
      resolver.setUploadThreshold(512);
      expect(resolver.getUploadThreshold()).toBe(512);
    });
  });

  describe('getStorageForUri', () => {
    it('should return DataUriStorage for data: URI', () => {
      const storage = resolver.getStorageForUri('data:text/plain,hello');
      expect(storage?.name).toBe('data');
    });

    it('should return HttpStorage for https:// URI', () => {
      const storage = resolver.getStorageForUri('https://example.com');
      expect(storage?.name).toBe('http');
    });

    it('should return null for unsupported URI', () => {
      const storage = resolver.getStorageForUri('ftp://example.com');
      expect(storage).toBeNull();
    });
  });

  describe('configuration options', () => {
    it('should use custom upload threshold', () => {
      const customResolver = new PayloadResolver({ uploadThreshold: 500 });
      expect(customResolver.getUploadThreshold()).toBe(500);
    });

    it('should use default upload threshold of 1024', () => {
      expect(resolver.getUploadThreshold()).toBe(1024);
    });

    it('should use custom default storage', async () => {
      const customResolver = new PayloadResolver({ defaultStorage: 's3' });
      // Without S3 config, should fallback to data URI
      const content = 'test content that exceeds nothing';
      const payload = await customResolver.encode(content);
      // Falls back to data URI since S3 is not configured
      expect(payload.uri).toMatch(/^data:/);
    });
  });

  describe('resolve with IPFS storage', () => {
    it('should create temporary IPFS storage when not configured', async () => {
      // This test verifies the code path, actual download would fail without network
      const ipfsPayload = {
        contentHash: computeContentHash('content'),
        uri: 'ipfs://QmInvalidCidForTest',
      };

      // Should throw due to network error, not configuration error
      await expect(resolver.resolve(ipfsPayload)).rejects.toThrow();
    });
  });

  describe('encode with storage options', () => {
    it('should throw when IPFS upload requested but not configured', async () => {
      const largeContent = 'x'.repeat(2000);

      await expect(
        resolver.encode(largeContent, { storage: 'ipfs', forceUpload: true })
      ).rejects.toThrow('IPFS storage not configured');
    });

    it('should throw when S3 upload requested but not configured', async () => {
      const largeContent = 'x'.repeat(2000);

      await expect(
        resolver.encode(largeContent, { storage: 's3', forceUpload: true })
      ).rejects.toThrow('S3 storage not configured');
    });

    it('should use data URI for small content even with storage option', async () => {
      const smallContent = 'tiny';
      const payload = await resolver.encode(smallContent, { storage: 'ipfs' });

      // Small content should use data URI regardless of storage option
      expect(payload.uri).toMatch(/^data:/);
    });
  });

  describe('resolve with unsupported payload type', () => {
    it('should throw error for unknown payload type', async () => {
      const unknownPayload = {
        contentHash: computeContentHash('content'),
        uri: 'ftp://example.com/file',
      };

      await expect(resolver.resolve(unknownPayload)).rejects.toThrow('Unsupported payload type');
    });
  });

  describe('content verification', () => {
    it('should skip verification for zero hash', async () => {
      const content = '{"test": "value"}';
      const zeroHashPayload = {
        contentHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        uri: '',
      };

      const result = await resolver.resolve(zeroHashPayload, content);

      expect(result.content).toBe(content);
      expect(result.verified).toBe(false); // Zero hash means no verification
    });
  });
});

describe('PayloadResolver with IPFS configuration', () => {
  it('should return IpfsStorage for ipfs:// URI when configured', () => {
    const resolver = new PayloadResolver({
      ipfs: {
        gateway: 'https://gateway.pinata.cloud/ipfs/',
        pinataApiKey: 'test-key',
        pinataApiSecret: 'test-secret',
      },
    });

    const storage = resolver.getStorageForUri('ipfs://Qm...');
    expect(storage?.name).toBe('ipfs');
  });
});

describe('PayloadResolver HTTP/HTTPS resolve', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should resolve HTTPS payload', async () => {
    const content = '{"resolved": "from https"}';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => content,
    });

    const resolver = new PayloadResolver();
    const payload = createHttpsPayload(content, 'https://example.com/data.json');

    const result = await resolver.resolve(payload);

    expect(result.content).toBe(content);
    expect(result.verified).toBe(true);
    expect(result.type).toBe(PayloadType.HTTPS);
  });

  it('should resolve HTTP payload', async () => {
    const content = '{"resolved": "from http"}';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => content,
    });

    const resolver = new PayloadResolver();
    const payload = {
      contentHash: computeContentHash(content),
      uri: 'http://example.com/data.json',
    };

    const result = await resolver.resolve(payload);

    expect(result.content).toBe(content);
    expect(result.verified).toBe(true);
    expect(result.type).toBe(PayloadType.HTTP);
  });

  it('should resolve IPFS payload with configured storage', async () => {
    const content = '{"resolved": "from ipfs"}';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => content,
    });

    const resolver = new PayloadResolver({
      ipfs: {
        gateway: 'https://ipfs.io/ipfs/',
        pinataApiKey: 'test-key',
        pinataApiSecret: 'test-secret',
      },
    });
    const payload = createIpfsPayload(content, 'QmTestCid123');

    const result = await resolver.resolve(payload);

    expect(result.content).toBe(content);
    expect(result.verified).toBe(true);
    expect(result.type).toBe(PayloadType.IPFS);
  });
});

describe('PayloadResolver with S3 configuration', () => {
  const s3Config = {
    endpoint: 'https://s3.example.com',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    publicUrlBase: 'https://cdn.example.com',
  };

  it('should return S3Storage for matching S3 URL when configured', () => {
    const resolver = new PayloadResolver({ s3: s3Config });

    const storage = resolver.getStorageForUri('https://cdn.example.com/file.json');
    expect(storage?.name).toBe('s3');
  });

  it('should prefer S3Storage over HttpStorage for matching URLs', () => {
    const resolver = new PayloadResolver({ s3: s3Config });

    const storage = resolver.getStorageForUri('https://cdn.example.com/file.json');
    // S3Storage should be checked before HttpStorage
    expect(storage?.name).toBe('s3');
  });
});

describe('PayloadResolver upload fallback behavior', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('IPFS upload fallback', () => {
    it('should fallback to data URI when IPFS upload fails', async () => {
      // Mock Pinata to fail
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const resolver = new PayloadResolver({
        ipfs: {
          pinataApiKey: 'test-key',
          pinataApiSecret: 'test-secret',
        },
        uploadThreshold: 10, // Force upload for small content
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const content = 'content that should trigger upload';
      const payload = await resolver.encode(content, { storage: 'ipfs', forceUpload: true });

      // Should fallback to data URI
      expect(payload.uri).toMatch(/^data:/);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('IPFS upload failed'));
      consoleSpy.mockRestore();
    });

    it('should successfully upload to IPFS when configured', async () => {
      const mockCid = 'QmTestCid123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: mockCid }),
      });

      const resolver = new PayloadResolver({
        ipfs: {
          pinataApiKey: 'test-key',
          pinataApiSecret: 'test-secret',
        },
        uploadThreshold: 10,
      });

      const content = 'content that should trigger upload';
      const payload = await resolver.encode(content, { storage: 'ipfs', forceUpload: true });

      expect(payload.uri).toBe(`ipfs://${mockCid}`);
    });
  });

  describe('S3 upload fallback', () => {
    const s3Config = {
      endpoint: 'https://s3.example.com',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      publicUrlBase: 'https://cdn.example.com',
    };

    it('should fallback to data URI when S3 upload fails', async () => {
      // Mock S3 to fail
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Access Denied',
      });

      const resolver = new PayloadResolver({
        s3: s3Config,
        uploadThreshold: 10,
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const content = 'content that should trigger upload';
      const payload = await resolver.encode(content, { storage: 's3', forceUpload: true });

      // Should fallback to data URI
      expect(payload.uri).toMatch(/^data:/);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('S3 upload failed'));
      consoleSpy.mockRestore();
    });

    it('should successfully upload to S3 when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const resolver = new PayloadResolver({
        s3: s3Config,
        uploadThreshold: 10,
      });

      const content = 'content that should trigger upload';
      const payload = await resolver.encode(content, { storage: 's3', forceUpload: true });

      expect(payload.uri).toMatch(/^https:\/\/cdn\.example\.com\//);
    });
  });

  describe('default storage upload behavior', () => {
    it('should use IPFS as default storage when configured', async () => {
      const mockCid = 'QmDefaultStorageTest';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: mockCid }),
      });

      const resolver = new PayloadResolver({
        ipfs: {
          pinataApiKey: 'test-key',
          pinataApiSecret: 'test-secret',
        },
        defaultStorage: 'ipfs',
        uploadThreshold: 10,
      });

      const content = 'large content that exceeds threshold';
      const payload = await resolver.encode(content);

      expect(payload.uri).toBe(`ipfs://${mockCid}`);
    });

    it('should use S3 as default storage when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const resolver = new PayloadResolver({
        s3: {
          endpoint: 'https://s3.example.com',
          bucket: 'test-bucket',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          publicUrlBase: 'https://cdn.example.com',
        },
        defaultStorage: 's3',
        uploadThreshold: 10,
      });

      const content = 'large content that exceeds threshold';
      const payload = await resolver.encode(content);

      expect(payload.uri).toMatch(/^https:\/\/cdn\.example\.com\//);
    });
  });
});
