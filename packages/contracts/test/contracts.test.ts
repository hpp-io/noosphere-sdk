import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JsonRpcProvider } from 'ethers';
import { RouterContract } from '../src/Router';
import { CoordinatorContract } from '../src/Coordinator';
import { SubscriptionBatchReaderContract } from '../src/SubscriptionBatchReader';

// Mock provider
const mockProvider = new JsonRpcProvider('http://localhost:8545');
const testAddress = '0x1234567890123456789012345678901234567890';

describe('Contract Wrappers', () => {
  describe('RouterContract', () => {
    let router: RouterContract;

    beforeEach(() => {
      router = new RouterContract(testAddress, mockProvider);
    });

    it('should create RouterContract instance', () => {
      expect(router).toBeInstanceOf(RouterContract);
    });

    it('should have correct address', () => {
      expect(router.address).toBe(testAddress);
    });

    it('should expose raw contract', () => {
      expect(router.raw).toBeDefined();
      expect(router.raw.target).toBe(testAddress);
    });

    it('should have sendRequest method', () => {
      expect(typeof router.sendRequest).toBe('function');
    });

    it('should have hasSubscriptionNextInterval method', () => {
      expect(typeof router.hasSubscriptionNextInterval).toBe('function');
    });

    it('should have getComputeSubscription method', () => {
      expect(typeof router.getComputeSubscription).toBe('function');
    });

    it('should have fulfill method', () => {
      expect(typeof router.fulfill).toBe('function');
    });

    it('should have payFromCoordinator method', () => {
      expect(typeof router.payFromCoordinator).toBe('function');
    });

    it('should have lockForVerification method', () => {
      expect(typeof router.lockForVerification).toBe('function');
    });

    it('should have unlockForVerification method', () => {
      expect(typeof router.unlockForVerification).toBe('function');
    });

    it('should have prepareNodeVerification method', () => {
      expect(typeof router.prepareNodeVerification).toBe('function');
    });

    it('should have getLastSubscriptionId method', () => {
      expect(typeof router.getLastSubscriptionId).toBe('function');
    });

    it('should have getContractById method', () => {
      expect(typeof router.getContractById).toBe('function');
    });

    it('should have getProposedContractById method', () => {
      expect(typeof router.getProposedContractById).toBe('function');
    });

    it('should have getWalletFactory method', () => {
      expect(typeof router.getWalletFactory).toBe('function');
    });

    it('should have isValidWallet method', () => {
      expect(typeof router.isValidWallet).toBe('function');
    });

    it('should have pause method', () => {
      expect(typeof router.pause).toBe('function');
    });

    it('should have unpause method', () => {
      expect(typeof router.unpause).toBe('function');
    });

    it('should have timeoutRequest method', () => {
      expect(typeof router.timeoutRequest).toBe('function');
    });

    it('should have event filters', () => {
      expect(router.filters).toBeDefined();
      expect(typeof router.filters.RequestStarted).toBe('function');
      expect(typeof router.filters.SubscriptionCreated).toBe('function');
      expect(typeof router.filters.SubscriptionCancelled).toBe('function');
    });

    it('should have event listener methods', () => {
      expect(typeof router.on).toBe('function');
      expect(typeof router.removeAllListeners).toBe('function');
      expect(typeof router.queryFilter).toBe('function');
    });
  });

  describe('CoordinatorContract', () => {
    let coordinator: CoordinatorContract;

    beforeEach(() => {
      coordinator = new CoordinatorContract(testAddress, mockProvider);
    });

    it('should create CoordinatorContract instance', () => {
      expect(coordinator).toBeInstanceOf(CoordinatorContract);
    });

    it('should have correct address', () => {
      expect(coordinator.address).toBe(testAddress);
    });

    it('should expose raw contract', () => {
      expect(coordinator.raw).toBeDefined();
      expect(coordinator.raw.target).toBe(testAddress);
    });

    it('should have startRequest method', () => {
      expect(typeof coordinator.startRequest).toBe('function');
    });

    it('should have cancelRequest method', () => {
      expect(typeof coordinator.cancelRequest).toBe('function');
    });

    it('should have reportComputeResult method', () => {
      expect(typeof coordinator.reportComputeResult).toBe('function');
    });

    it('should have reportVerificationResult method', () => {
      expect(typeof coordinator.reportVerificationResult).toBe('function');
    });

    it('should have prepareNextInterval method', () => {
      expect(typeof coordinator.prepareNextInterval).toBe('function');
    });

    it('should have getCommitment method', () => {
      expect(typeof coordinator.getCommitment).toBe('function');
    });

    it('should have requestCommitments method', () => {
      expect(typeof coordinator.requestCommitments).toBe('function');
    });

    it('should have event filters', () => {
      expect(coordinator.filters).toBeDefined();
      expect(typeof coordinator.filters.RequestStarted).toBe('function');
      expect(typeof coordinator.filters.RequestCancelled).toBe('function');
      expect(typeof coordinator.filters.ComputeDelivered).toBe('function');
      expect(typeof coordinator.filters.ProofVerified).toBe('function');
    });

    it('should have event listener methods', () => {
      expect(typeof coordinator.on).toBe('function');
      expect(typeof coordinator.removeAllListeners).toBe('function');
      expect(typeof coordinator.queryFilter).toBe('function');
    });
  });

  describe('SubscriptionBatchReaderContract', () => {
    let reader: SubscriptionBatchReaderContract;

    beforeEach(() => {
      reader = new SubscriptionBatchReaderContract(testAddress, mockProvider);
    });

    it('should create SubscriptionBatchReaderContract instance', () => {
      expect(reader).toBeInstanceOf(SubscriptionBatchReaderContract);
    });

    it('should have correct address', () => {
      expect(reader.address).toBe(testAddress);
    });

    it('should expose raw contract', () => {
      expect(reader.raw).toBeDefined();
      expect(reader.raw.target).toBe(testAddress);
    });

    it('should have getSubscriptions method', () => {
      expect(typeof reader.getSubscriptions).toBe('function');
    });

    it('should have getIntervalStatuses method', () => {
      expect(typeof reader.getIntervalStatuses).toBe('function');
    });
  });
});
