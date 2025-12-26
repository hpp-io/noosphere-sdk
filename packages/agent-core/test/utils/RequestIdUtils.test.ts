import { ethers } from 'ethers';
import { RequestIdUtils } from '../../src/utils/RequestIdUtils';

describe('RequestIdUtils', () => {
  describe('pack', () => {
    it('should pack subscriptionId and interval into requestId', () => {
      const subscriptionId = 1n;
      const interval = 0;

      const requestId = RequestIdUtils.pack(subscriptionId, interval);

      // Should be a valid hex string
      expect(requestId).toMatch(/^0x[0-9a-f]{64}$/);

      // Should be deterministic
      const requestId2 = RequestIdUtils.pack(subscriptionId, interval);
      expect(requestId).toBe(requestId2);
    });

    it('should produce different requestIds for different subscriptionIds', () => {
      const requestId1 = RequestIdUtils.pack(1n, 0);
      const requestId2 = RequestIdUtils.pack(2n, 0);

      expect(requestId1).not.toBe(requestId2);
    });

    it('should produce different requestIds for different intervals', () => {
      const requestId1 = RequestIdUtils.pack(1n, 0);
      const requestId2 = RequestIdUtils.pack(1n, 1);

      expect(requestId1).not.toBe(requestId2);
    });

    it('should handle large subscription IDs', () => {
      const largeSubId = 18446744073709551615n; // max uint64
      const requestId = RequestIdUtils.pack(largeSubId, 0);

      expect(requestId).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle large intervals', () => {
      const largeInterval = 4294967295; // max uint32
      const requestId = RequestIdUtils.pack(1n, largeInterval);

      expect(requestId).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('format', () => {
    it('should format requestId with subscriptionId and interval', () => {
      const requestId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const subscriptionId = 1n;
      const interval = 0;

      const formatted = RequestIdUtils.format(requestId, subscriptionId, interval);

      expect(formatted).toContain('0x12345678'); // First 8 hex chars after 0x
      expect(formatted).toContain('sub=1');
      expect(formatted).toContain('interval=0');
    });
  });
});
