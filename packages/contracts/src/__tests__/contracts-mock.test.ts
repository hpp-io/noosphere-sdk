import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JsonRpcProvider } from 'ethers';
import { RouterContract } from '../Router';
import { CoordinatorContract } from '../Coordinator';

const testAddress = '0x1234567890123456789012345678901234567890';
const mockProvider = new JsonRpcProvider('http://localhost:8545');

describe('Contract Wrappers with Mocked Calls', () => {
  describe('RouterContract', () => {
    let router: RouterContract;

    beforeEach(() => {
      router = new RouterContract(testAddress, mockProvider);
    });

    it('should call getWalletFactory and return address', async () => {
      const expectedAddress = '0xWalletFactory123456789012345678901234567890';

      // Mock the contract method
      vi.spyOn(router.raw, 'getWalletFactory').mockResolvedValue(expectedAddress);

      const result = await router.getWalletFactory();

      expect(result).toBe(expectedAddress);
      expect(router.raw.getWalletFactory).toHaveBeenCalled();
    });

    it('should call getLastSubscriptionId and return bigint', async () => {
      const expectedId = BigInt(42);

      vi.spyOn(router.raw, 'getLastSubscriptionId').mockResolvedValue(expectedId);

      const result = await router.getLastSubscriptionId();

      expect(result).toBe(expectedId);
      expect(router.raw.getLastSubscriptionId).toHaveBeenCalled();
    });

    it('should call isValidWallet and return boolean', async () => {
      const walletAddress = '0xWallet123';

      vi.spyOn(router.raw, 'isValidWallet').mockResolvedValue(true);

      const result = await router.isValidWallet(walletAddress);

      expect(result).toBe(true);
      expect(router.raw.isValidWallet).toHaveBeenCalledWith(walletAddress);
    });

    it('should call hasSubscriptionNextInterval', async () => {
      const subscriptionId = BigInt(1);
      const currentInterval = 100;

      vi.spyOn(router.raw, 'hasSubscriptionNextInterval').mockResolvedValue(true);

      const result = await router.hasSubscriptionNextInterval(subscriptionId, currentInterval);

      expect(result).toBe(true);
      expect(router.raw.hasSubscriptionNextInterval).toHaveBeenCalledWith(
        subscriptionId,
        currentInterval
      );
    });

    it('should call getComputeSubscription and parse result', async () => {
      const subscriptionId = BigInt(1);
      const mockSubscription = {
        routeId: '0xroute123',
        containerId: '0xcontainer123',
        feeAmount: BigInt(1000),
        client: '0xClient',
        activeAt: 123456,
        intervalSeconds: 3600,
        maxExecutions: 100,
        wallet: '0xWallet',
        feeToken: '0xToken',
        verifier: '0xVerifier',
        redundancy: 3,
        useDeliveryInbox: true,
      };

      vi.spyOn(router.raw, 'getComputeSubscription').mockResolvedValue(mockSubscription);

      const result = await router.getComputeSubscription(subscriptionId);

      expect(result).toEqual(mockSubscription);
      expect(router.raw.getComputeSubscription).toHaveBeenCalledWith(subscriptionId);
    });

    it('should call sendRequest and return commitment', async () => {
      const subscriptionId = BigInt(1);
      const interval = 100;
      const mockResponse = {
        requestId: '0xrequest123',
        commitment: {
          requestId: '0xrequest123',
          subscriptionId: BigInt(1),
          interval: 100,
          redundancy: 3,
          containerId: '0xcontainer',
          client: '0xClient',
          wallet: '0xWallet',
          feeToken: '0xToken',
          feeAmount: BigInt(500),
          verifier: '0xVerifier',
          useDeliveryInbox: true,
        },
      };

      vi.spyOn(router.raw, 'sendRequest').mockResolvedValue(mockResponse);

      const result = await router.sendRequest(subscriptionId, interval);

      expect(result.requestId).toBe(mockResponse.requestId);
      expect(result.commitment.subscriptionId).toBe(BigInt(1));
      expect(router.raw.sendRequest).toHaveBeenCalledWith(subscriptionId, interval);
    });

    it('should call getContractById and return address', async () => {
      const contractId = '0xid123';
      const expectedAddress = '0xContract123';

      vi.spyOn(router.raw, 'getContractById').mockResolvedValue(expectedAddress);

      const result = await router.getContractById(contractId);

      expect(result).toBe(expectedAddress);
      expect(router.raw.getContractById).toHaveBeenCalledWith(contractId);
    });
  });

  describe('CoordinatorContract', () => {
    let coordinator: CoordinatorContract;

    beforeEach(() => {
      coordinator = new CoordinatorContract(testAddress, mockProvider);
    });

    it('should call redundancyCount and return number', async () => {
      const requestId = '0xrequest123';
      const expectedCount = BigInt(3);

      vi.spyOn(coordinator.raw, 'redundancyCount').mockResolvedValue(expectedCount);

      const result = await coordinator.redundancyCount(requestId);

      expect(result).toBe(3);
      expect(coordinator.raw.redundancyCount).toHaveBeenCalledWith(requestId);
    });

    it('should call getCommitment and parse result', async () => {
      const subscriptionId = BigInt(1);
      const interval = 100;
      const mockCommitment = {
        requestId: '0xrequest',
        subscriptionId: BigInt(1),
        interval: 100,
        redundancy: 3,
        containerId: '0xcontainer',
        client: '0xClient',
        wallet: '0xWallet',
        feeToken: '0xToken',
        feeAmount: BigInt(500),
        verifier: '0xVerifier',
        useDeliveryInbox: true,
      };

      vi.spyOn(coordinator.raw, 'getCommitment').mockResolvedValue(mockCommitment);

      const result = await coordinator.getCommitment(subscriptionId, interval);

      expect(result.subscriptionId).toBe(BigInt(1));
      expect(result.interval).toBe(100);
      expect(coordinator.raw.getCommitment).toHaveBeenCalledWith(subscriptionId, interval);
    });

    it('should call requestCommitments and return string', async () => {
      const requestId = '0xrequest123';
      const expectedCommitment = '0xcommitment456';

      vi.spyOn(coordinator.raw, 'requestCommitments').mockResolvedValue(expectedCommitment);

      const result = await coordinator.requestCommitments(requestId);

      expect(result).toBe(expectedCommitment);
      expect(coordinator.raw.requestCommitments).toHaveBeenCalledWith(requestId);
    });
  });
});
