import { CommitmentUtils } from '../../src/utils/CommitmentUtils';
import type { Commitment } from '../../src/types';

describe('CommitmentUtils', () => {
  const mockCommitment: Commitment = {
    requestId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    subscriptionId: 1n,
    containerId: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    interval: 0,
    redundancy: 1,
    useDeliveryInbox: false,
    feeToken: '0x0000000000000000000000000000000000000000',
    feeAmount: 1000000000000000n, // 0.001 ETH
    walletAddress: '0x1111111111111111111111111111111111111111',
    verifier: '0x0000000000000000000000000000000000000000',
    coordinator: '0x2222222222222222222222222222222222222222',
  };

  describe('hash', () => {
    it('should calculate commitment hash', () => {
      const hash = CommitmentUtils.hash(mockCommitment);

      // Should be a valid hex string
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should be deterministic', () => {
      const hash1 = CommitmentUtils.hash(mockCommitment);
      const hash2 = CommitmentUtils.hash(mockCommitment);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different commitments', () => {
      const commitment2: Commitment = {
        ...mockCommitment,
        interval: 1, // Different interval
      };

      const hash1 = CommitmentUtils.hash(mockCommitment);
      const hash2 = CommitmentUtils.hash(commitment2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle different redundancy values', () => {
      const commitment1: Commitment = { ...mockCommitment, redundancy: 1 };
      const commitment2: Commitment = { ...mockCommitment, redundancy: 3 };

      const hash1 = CommitmentUtils.hash(commitment1);
      const hash2 = CommitmentUtils.hash(commitment2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify', () => {
    it('should verify valid commitment hash', () => {
      const expectedHash = CommitmentUtils.hash(mockCommitment);
      const isValid = CommitmentUtils.verify(mockCommitment, expectedHash);

      expect(isValid).toBe(true);
    });

    it('should reject invalid commitment hash', () => {
      const wrongHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const isValid = CommitmentUtils.verify(mockCommitment, wrongHash);

      expect(isValid).toBe(false);
    });

    it('should reject modified commitment', () => {
      const expectedHash = CommitmentUtils.hash(mockCommitment);

      const modifiedCommitment: Commitment = {
        ...mockCommitment,
        feeAmount: 2000000000000000n, // Modified fee
      };

      const isValid = CommitmentUtils.verify(modifiedCommitment, expectedHash);

      expect(isValid).toBe(false);
    });
  });
});
