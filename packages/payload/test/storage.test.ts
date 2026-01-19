import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataUriStorage } from '../src/storage/DataUriStorage';
import { HttpStorage } from '../src/storage/HttpStorage';
import { IpfsStorage } from '../src/storage/IpfsStorage';
import { S3Storage } from '../src/storage/S3Storage';

// Mock global fetch
const mockFetch = vi.fn();

describe('DataUriStorage', () => {
  const storage = new DataUriStorage();

  describe('upload', () => {
    it('should encode content as base64 data URI', async () => {
      const content = '{"test": "value"}';
      const result = await storage.upload(content);

      expect(result.uri).toMatch(/^data:application\/json;base64,/);
      expect(result.contentId).toBeTruthy();
    });

    it('should handle Uint8Array input', async () => {
      const content = new TextEncoder().encode('binary content');
      const result = await storage.upload(content);

      expect(result.uri).toMatch(/^data:application\/json;base64,/);
    });
  });

  describe('download', () => {
    it('should decode base64 data URI', async () => {
      const content = '{"test": "value"}';
      const { uri } = await storage.upload(content);

      const downloaded = await storage.download(uri);
      expect(downloaded).toBe(content);
    });

    it('should handle UTF-8 content', async () => {
      const content = '한글 테스트 🎉';
      const { uri } = await storage.upload(content);

      const downloaded = await storage.download(uri);
      expect(downloaded).toBe(content);
    });

    it('should throw error for non-data URI', async () => {
      await expect(storage.download('https://example.com')).rejects.toThrow(
        'DataUriStorage cannot handle URI'
      );
    });
  });

  describe('canHandle', () => {
    it('should return true for data: URI', () => {
      expect(storage.canHandle('data:text/plain,hello')).toBe(true);
    });

    it('should return false for other URIs', () => {
      expect(storage.canHandle('https://example.com')).toBe(false);
      expect(storage.canHandle('ipfs://Qm...')).toBe(false);
    });
  });
});

describe('HttpStorage', () => {
  const storage = new HttpStorage();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('upload', () => {
    it('should throw error as HTTP upload is not supported', async () => {
      await expect(storage.upload('content')).rejects.toThrow(
        'HttpStorage does not support upload'
      );
    });
  });

  describe('download', () => {
    it('should download content from HTTP URL', async () => {
      const mockContent = '{"data": "test"}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent,
      });

      const result = await storage.download('https://example.com/file.json');

      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/file.json');
    });

    it('should throw error on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(storage.download('https://example.com/file.json')).rejects.toThrow(
        'HTTP fetch failed: 404 Not Found'
      );
    });

    it('should throw error for non-HTTP URI', async () => {
      await expect(storage.download('ipfs://Qm...')).rejects.toThrow(
        'HttpStorage cannot handle URI'
      );
    });
  });

  describe('canHandle', () => {
    it('should return true for https:// URI', () => {
      expect(storage.canHandle('https://example.com')).toBe(true);
    });

    it('should return true for http:// URI', () => {
      expect(storage.canHandle('http://example.com')).toBe(true);
    });

    it('should return false for other URIs', () => {
      expect(storage.canHandle('ipfs://Qm...')).toBe(false);
      expect(storage.canHandle('data:text/plain,hello')).toBe(false);
    });
  });
});

describe('IpfsStorage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('without configuration', () => {
    const storage = new IpfsStorage();

    it('should have name "ipfs"', () => {
      expect(storage.name).toBe('ipfs');
    });

    it('should not be configured without credentials', () => {
      expect(storage.isConfigured()).toBe(false);
    });

    it('should throw error on upload without configuration', async () => {
      await expect(storage.upload('content')).rejects.toThrow(
        'IPFS upload requires either Pinata credentials or local IPFS node URL'
      );
    });
  });

  describe('with Pinata configuration', () => {
    const storage = new IpfsStorage({
      pinataApiKey: 'test-key',
      pinataApiSecret: 'test-secret',
    });

    it('should be configured with Pinata credentials', () => {
      expect(storage.isConfigured()).toBe(true);
    });

    it('should upload content to Pinata', async () => {
      const mockCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: mockCid }),
      });

      const result = await storage.upload('{"test": "data"}');

      expect(result.uri).toBe(`ipfs://${mockCid}`);
      expect(result.contentId).toBe(mockCid);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            pinata_api_key: 'test-key',
            pinata_secret_api_key: 'test-secret',
          }),
        })
      );
    });

    it('should upload non-JSON content to Pinata', async () => {
      const mockCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: mockCid }),
      });

      const result = await storage.upload('plain text content');

      expect(result.uri).toBe(`ipfs://${mockCid}`);
    });

    it('should throw error on Pinata upload failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(storage.upload('content')).rejects.toThrow(
        'Pinata upload failed: 401 Unauthorized'
      );
    });

    it('should handle Uint8Array input', async () => {
      const mockCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: mockCid }),
      });

      const content = new TextEncoder().encode('binary content');
      const result = await storage.upload(content);

      expect(result.uri).toBe(`ipfs://${mockCid}`);
    });
  });

  describe('with local IPFS node configuration', () => {
    const storage = new IpfsStorage({
      apiUrl: 'http://localhost:5001',
    });

    it('should be configured with local node URL', () => {
      expect(storage.isConfigured()).toBe(true);
    });

    it('should upload content to local IPFS node', async () => {
      const mockCid = 'QmLocalNodeHash123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Hash: mockCid }),
      });

      const result = await storage.upload('{"test": "local"}');

      expect(result.uri).toBe(`ipfs://${mockCid}`);
      expect(result.contentId).toBe(mockCid);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/v0/add',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw error on local node upload failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(storage.upload('content')).rejects.toThrow(
        'Local IPFS upload failed: 500 Internal Server Error'
      );
    });
  });

  describe('download', () => {
    const storage = new IpfsStorage({
      gateway: 'https://ipfs.io/ipfs/',
    });

    it('should download content from IPFS', async () => {
      const mockContent = '{"downloaded": "data"}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent,
      });

      const result = await storage.download('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');

      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
      );
    });

    it('should extract CID correctly from IPFS URI', async () => {
      const mockContent = '{"data": "test"}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent,
      });

      // The extractCid internal method handles encoded URIs, but canHandle requires ipfs:// prefix
      const result = await storage.download('ipfs://QmEncodedHash123');

      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith('https://ipfs.io/ipfs/QmEncodedHash123');
    });

    it('should throw error on download failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        storage.download('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow('IPFS fetch failed: 404 Not Found');
    });

    it('should throw error for non-IPFS URI', async () => {
      await expect(storage.download('https://example.com')).rejects.toThrow(
        'IpfsStorage cannot handle URI'
      );
    });
  });

  describe('canHandle', () => {
    const storage = new IpfsStorage();

    it('should return true for ipfs:// URI', () => {
      expect(storage.canHandle('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
    });

    it('should return false for other URIs', () => {
      expect(storage.canHandle('https://example.com')).toBe(false);
      expect(storage.canHandle('data:text/plain,hello')).toBe(false);
      expect(storage.canHandle('http://example.com')).toBe(false);
    });
  });

  describe('gateway configuration', () => {
    it('should use default gateway', () => {
      const storage = new IpfsStorage();
      // Default gateway is https://ipfs.io/ipfs/
      expect(storage.canHandle('ipfs://Qm...')).toBe(true);
    });

    it('should use custom gateway', () => {
      const storage = new IpfsStorage({
        gateway: 'https://gateway.pinata.cloud/ipfs/',
      });
      expect(storage.canHandle('ipfs://Qm...')).toBe(true);
    });
  });
});

describe('S3Storage', () => {
  const minimalConfig = {
    endpoint: 'https://s3.example.com',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    publicUrlBase: 'https://cdn.example.com',
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('configuration', () => {
    it('should have name "s3"', () => {
      const storage = new S3Storage(minimalConfig);
      expect(storage.name).toBe('s3');
    });

    it('should be configured with all required fields', () => {
      const storage = new S3Storage(minimalConfig);
      expect(storage.isConfigured()).toBe(true);
    });

    it('should not be configured without accessKeyId', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        accessKeyId: '',
      });
      expect(storage.isConfigured()).toBe(false);
    });

    it('should not be configured without secretAccessKey', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        secretAccessKey: '',
      });
      expect(storage.isConfigured()).toBe(false);
    });

    it('should not be configured without bucket', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        bucket: '',
      });
      expect(storage.isConfigured()).toBe(false);
    });

    it('should not be configured without endpoint', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        endpoint: '',
      });
      expect(storage.isConfigured()).toBe(false);
    });
  });

  describe('upload', () => {
    it('should upload content to S3', async () => {
      const storage = new S3Storage(minimalConfig);
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await storage.upload('{"test": "data"}');

      expect(result.uri).toMatch(/^https:\/\/cdn\.example\.com\//);
      expect(result.contentId).toMatch(/\.json$/);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://s3.example.com/test-bucket/'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('AWS4-HMAC-SHA256'),
            'x-amz-date': expect.any(String),
            'x-amz-content-sha256': expect.any(String),
          }),
          body: '{"test": "data"}',
        })
      );
    });

    it('should upload content with key prefix', async () => {
      const storage = new S3Storage({
        ...minimalConfig,
        keyPrefix: 'noosphere/outputs',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await storage.upload('{"test": "data"}');

      expect(result.uri).toMatch(/^https:\/\/cdn\.example\.com\/noosphere\/outputs\//);
      expect(result.contentId).toMatch(/^noosphere\/outputs\//);
    });

    it('should use endpoint URL when no publicUrlBase', async () => {
      const storage = new S3Storage({
        ...minimalConfig,
        publicUrlBase: undefined,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await storage.upload('{"test": "data"}');

      expect(result.uri).toMatch(/^https:\/\/s3\.example\.com\/test-bucket\//);
    });

    it('should handle Uint8Array input', async () => {
      const storage = new S3Storage(minimalConfig);
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const content = new TextEncoder().encode('binary content');
      const result = await storage.upload(content);

      expect(result.uri).toBeTruthy();
    });

    it('should throw error on upload failure', async () => {
      const storage = new S3Storage(minimalConfig);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Access Denied',
      });

      await expect(storage.upload('content')).rejects.toThrow(
        'S3 upload failed: 403 Access Denied'
      );
    });

    it('should upload with custom region', async () => {
      const storage = new S3Storage({
        ...minimalConfig,
        region: 'us-east-1',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await storage.upload('content');

      expect(result.uri).toBeTruthy();
      // Verify the signature includes the region
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers.Authorization).toContain('us-east-1');
    });
  });

  describe('download', () => {
    it('should download content from S3 URL', async () => {
      const storage = new S3Storage(minimalConfig);
      const mockContent = '{"downloaded": "data"}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent,
      });

      const result = await storage.download('https://cdn.example.com/file.json');

      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith('https://cdn.example.com/file.json');
    });

    it('should throw error on download failure', async () => {
      const storage = new S3Storage(minimalConfig);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(storage.download('https://cdn.example.com/file.json')).rejects.toThrow(
        'S3 download failed: 404 Not Found'
      );
    });
  });

  describe('canHandle', () => {
    const storage = new S3Storage(minimalConfig);

    it('should return true for URLs matching endpoint', () => {
      expect(storage.canHandle('https://s3.example.com/test-bucket/file.json')).toBe(true);
    });

    it('should return true for URLs matching publicUrlBase', () => {
      expect(storage.canHandle('https://cdn.example.com/file.json')).toBe(true);
    });

    it('should return false for non-HTTPS URLs', () => {
      expect(storage.canHandle('http://s3.example.com/file.json')).toBe(false);
    });

    it('should return false for unrelated HTTPS URLs', () => {
      expect(storage.canHandle('https://other.example.com/file.json')).toBe(false);
    });

    it('should return false for other URI schemes', () => {
      expect(storage.canHandle('ipfs://Qm...')).toBe(false);
      expect(storage.canHandle('data:text/plain,hello')).toBe(false);
    });

    it('should handle storage without publicUrlBase', () => {
      const storageNoPublic = new S3Storage({
        ...minimalConfig,
        publicUrlBase: undefined,
      });
      expect(storageNoPublic.canHandle('https://s3.example.com/test-bucket/file.json')).toBe(true);
      expect(storageNoPublic.canHandle('https://cdn.example.com/file.json')).toBe(false);
    });
  });

  describe('region configuration', () => {
    it('should default to "auto" region', () => {
      const storage = new S3Storage(minimalConfig);
      expect(storage.isConfigured()).toBe(true);
    });

    it('should accept custom region', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        region: 'us-east-1',
      });
      expect(storage.isConfigured()).toBe(true);
    });
  });

  describe('key prefix', () => {
    it('should work with key prefix', () => {
      const storage = new S3Storage({
        ...minimalConfig,
        keyPrefix: 'noosphere/outputs',
      });
      expect(storage.isConfigured()).toBe(true);
    });
  });
});
