import { ethers } from 'ethers';
import { PayloadUtils } from '../../src/utils/CommitmentUtils';
import type { PayloadData } from '../../src/types';

describe('PayloadUtils', () => {
  /*//////////////////////////////////////////////////////////////////////////
                              fromInlineData
  //////////////////////////////////////////////////////////////////////////*/

  describe('fromInlineData', () => {
    it('should create PayloadData from content string', () => {
      const content = '{"action":"ping"}';
      const payload = PayloadUtils.fromInlineData(content);

      expect(payload).toBeDefined();
      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      // URI is hex-encoded data: URI for Solidity bytes type
      expect(payload.uri).toMatch(/^0x[0-9a-f]+$/);
      expect(payload.uri).toContain('646174613a'); // "data:" in hex
    });

    it('should compute correct content hash', () => {
      const content = 'test content';
      const payload = PayloadUtils.fromInlineData(content);

      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes(content));
      expect(payload.contentHash).toBe(expectedHash);
    });

    it('should handle empty content', () => {
      const payload = PayloadUtils.fromInlineData('');

      expect(payload).toBeDefined();
      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      // URI is hex-encoded data: URI for Solidity bytes type
      expect(payload.uri).toMatch(/^0x[0-9a-f]+$/);
    });

    it('should handle JSON content', () => {
      const content = JSON.stringify({ result: 'success', value: 42 });
      const payload = PayloadUtils.fromInlineData(content);

      expect(payload.contentHash).toBe(ethers.keccak256(ethers.toUtf8Bytes(content)));
    });

    it('should handle unicode content', () => {
      const content = '한글 테스트 🚀';
      const payload = PayloadUtils.fromInlineData(content);

      expect(payload).toBeDefined();
      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                              fromExternalUri
  //////////////////////////////////////////////////////////////////////////*/

  describe('fromExternalUri', () => {
    it('should create PayloadData with IPFS URI', () => {
      const content = 'large payload content';
      const uri = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
      expect(payload.contentHash).toBe(ethers.keccak256(ethers.toUtf8Bytes(content)));
    });

    it('should create PayloadData with HTTPS URI', () => {
      const content = 'external content';
      const uri = 'https://api.example.com/data/12345';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should create PayloadData with Arweave URI', () => {
      const content = 'arweave content';
      const uri = 'ar://bNbA3TEQVL60xlgCcqdz4ZPH';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
    });

    it('should create PayloadData with chain URI', () => {
      const content = 'on-chain reference';
      const uri = 'chain://1/0xabc123def456789012345678901234567890123456789012345678901234abcd/0';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
    });

    it('should handle long HTTPS URLs with query params', () => {
      const content = 'api response';
      const uri = 'https://api.noosphere.io/v1/payloads/request-12345678-abcd?token=eyJhbGciOiJIUzI1NiJ9&timestamp=1234567890';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
      expect(uri.length).toBeGreaterThan(100);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                              fromHashAndUri
  //////////////////////////////////////////////////////////////////////////*/

  describe('fromHashAndUri', () => {
    it('should create PayloadData from pre-computed hash', () => {
      const contentHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const uri = 'ipfs://QmTestHash';
      const payload = PayloadUtils.fromHashAndUri(contentHash, uri);

      expect(payload.contentHash).toBe(contentHash);
      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
    });

    it('should create PayloadData with empty URI (inline)', () => {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes('inline data'));
      const payload = PayloadUtils.fromHashAndUri(contentHash, '');

      expect(payload.contentHash).toBe(contentHash);
      // Empty URI becomes '0x' (empty bytes)
      expect(payload.uri).toBe('0x');
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                                  empty
  //////////////////////////////////////////////////////////////////////////*/

  describe('empty', () => {
    it('should create empty PayloadData', () => {
      const payload = PayloadUtils.empty();

      expect(payload.contentHash).toBe(ethers.ZeroHash);
      // Empty bytes for Solidity
      expect(payload.uri).toBe('0x');
    });

    it('should be usable for empty proof', () => {
      const proof = PayloadUtils.empty();

      // Verify it's a valid bytes32 zero hash
      expect(proof.contentHash).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                              computeHash
  //////////////////////////////////////////////////////////////////////////*/

  describe('computeHash', () => {
    it('should compute keccak256 hash of content', () => {
      const content = 'test content';
      const hash = PayloadUtils.computeHash(content);

      expect(hash).toBe(ethers.keccak256(ethers.toUtf8Bytes(content)));
    });

    it('should be deterministic', () => {
      const content = 'deterministic test';
      const hash1 = PayloadUtils.computeHash(content);
      const hash2 = PayloadUtils.computeHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = PayloadUtils.computeHash('content A');
      const hash2 = PayloadUtils.computeHash('content B');

      expect(hash1).not.toBe(hash2);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                              verifyContent
  //////////////////////////////////////////////////////////////////////////*/

  describe('verifyContent', () => {
    it('should verify matching content', () => {
      const content = 'original content';
      const payload = PayloadUtils.fromInlineData(content);

      expect(PayloadUtils.verifyContent(payload, content)).toBe(true);
    });

    it('should reject tampered content', () => {
      const originalContent = 'original content';
      const tamperedContent = 'tampered content';
      const payload = PayloadUtils.fromInlineData(originalContent);

      expect(PayloadUtils.verifyContent(payload, tamperedContent)).toBe(false);
    });

    it('should verify external URI content', () => {
      const content = 'external payload data';
      const payload = PayloadUtils.fromExternalUri(content, 'ipfs://QmTest');

      expect(PayloadUtils.verifyContent(payload, content)).toBe(true);
    });

    it('should reject modified JSON content', () => {
      const original = JSON.stringify({ result: 'success' });
      const modified = JSON.stringify({ result: 'failure' });
      const payload = PayloadUtils.fromInlineData(original);

      expect(PayloadUtils.verifyContent(payload, modified)).toBe(false);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                          Integration Tests
  //////////////////////////////////////////////////////////////////////////*/

  describe('integration', () => {
    it('should support full workflow: create -> verify', () => {
      // Simulate container execution
      const inputContent = '{"action": "compute", "params": [1, 2, 3]}';
      const outputContent = '{"result": 6}';

      // Create PayloadData
      const input = PayloadUtils.fromInlineData(inputContent);
      const output = PayloadUtils.fromInlineData(outputContent);
      const proof = PayloadUtils.empty(); // No verifier

      // Verify created payloads
      expect(PayloadUtils.verifyContent(input, inputContent)).toBe(true);
      expect(PayloadUtils.verifyContent(output, outputContent)).toBe(true);
      expect(proof.contentHash).toBe(ethers.ZeroHash);
    });

    it('should support external storage workflow', () => {
      // Simulate large payload stored externally
      const largeContent = 'x'.repeat(10000);
      const ipfsUri = 'ipfs://QmLargePayloadHash123456789';

      const payload = PayloadUtils.fromExternalUri(largeContent, ipfsUri);

      // Later, verify downloaded content
      expect(PayloadUtils.verifyContent(payload, largeContent)).toBe(true);
      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(ipfsUri)));
    });

    it('should support mixed URI schemes in single transaction', () => {
      // Input from IPFS
      const inputContent = 'input data';
      const input = PayloadUtils.fromExternalUri(inputContent, 'ipfs://QmInput');

      // Output inline (small)
      const outputContent = '42';
      const output = PayloadUtils.fromInlineData(outputContent);

      // Proof from HTTPS
      const proofContent = 'zkproof-data';
      const proof = PayloadUtils.fromExternalUri(proofContent, 'https://proofs.example.com/abc123');

      // Hex-encoded URIs contain the original URI bytes
      expect(input.uri).toContain('697066733a2f2f'); // 'ipfs://' in hex
      expect(output.uri).toContain('646174613a'); // 'data:' in hex
      expect(proof.uri).toContain('68747470733a2f2f'); // 'https://' in hex
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                          Edge Cases
  //////////////////////////////////////////////////////////////////////////*/

  describe('edge cases', () => {
    it('should handle very long content', () => {
      const longContent = 'x'.repeat(100000);
      const payload = PayloadUtils.fromInlineData(longContent);

      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(PayloadUtils.verifyContent(payload, longContent)).toBe(true);
    });

    it('should handle special characters in URI', () => {
      const content = 'test';
      const uri = 'https://api.example.com/data?key=value&foo=bar%20baz#fragment';
      const payload = PayloadUtils.fromExternalUri(content, uri);

      // URI is hex-encoded for Solidity bytes type
      expect(payload.uri).toBe(ethers.hexlify(ethers.toUtf8Bytes(uri)));
    });

    it('should handle data URI scheme', () => {
      const content = '{"action":"ping"}';
      const dataUri = 'data:application/json;base64,eyJhY3Rpb24iOiJwaW5nIn0=';
      const payload = PayloadUtils.fromExternalUri(content, dataUri);

      // Hex-encoded URI contains 'data:' bytes
      expect(payload.uri).toContain('646174613a'); // 'data:' in hex
    });

    it('should maintain content hash consistency across methods', () => {
      const content = 'consistent content';
      const hash = PayloadUtils.computeHash(content);
      const inlinePayload = PayloadUtils.fromInlineData(content);
      const externalPayload = PayloadUtils.fromExternalUri(content, 'ipfs://Qm...');
      const manualPayload = PayloadUtils.fromHashAndUri(hash, '');

      expect(inlinePayload.contentHash).toBe(hash);
      expect(externalPayload.contentHash).toBe(hash);
      expect(manualPayload.contentHash).toBe(hash);
    });
  });
});
