import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JsonRpcProvider } from 'ethers';
import { RouterContract } from '../src/Router';
import { CoordinatorContract } from '../src/Coordinator';
import type { PayloadData, Payment, ProofVerificationRequest, Commitment } from '../src/types';

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

    it('should call getProposedContractById and return address', async () => {
      const contractId = '0xid123';
      const expectedAddress = '0xProposedContract123';

      vi.spyOn(router.raw, 'getProposedContractById').mockResolvedValue(expectedAddress);

      const result = await router.getProposedContractById(contractId);

      expect(result).toBe(expectedAddress);
      expect(router.raw.getProposedContractById).toHaveBeenCalledWith(contractId);
    });

    it('should call fulfill with PayloadData and return result', async () => {
      const input: PayloadData = { contentHash: '0xinput', uri: 'ipfs://input' };
      const output: PayloadData = { contentHash: '0xoutput', uri: 'ipfs://output' };
      const proof: PayloadData = { contentHash: '0xproof', uri: 'ipfs://proof' };
      const numRedundantDeliveries = 3;
      const nodeWallet = '0xNodeWallet';
      const payments: Payment[] = [
        { recipient: '0xRecipient', amount: BigInt(1000) },
      ];
      const commitment: Commitment = {
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

      const mockResult = { success: true, txHash: '0xtx123' };
      vi.spyOn(router.raw, 'fulfill').mockResolvedValue(mockResult);

      const result = await router.fulfill(
        input,
        output,
        proof,
        numRedundantDeliveries,
        nodeWallet,
        payments,
        commitment
      );

      expect(result).toEqual(mockResult);
      expect(router.raw.fulfill).toHaveBeenCalled();
    });

    it('should call payFromCoordinator', async () => {
      const subscriptionId = BigInt(1);
      const spenderWallet = '0xSpenderWallet';
      const spenderAddress = '0xSpender';
      const payments: Payment[] = [
        { recipient: '0xRecipient', amount: BigInt(1000) },
      ];

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'payFromCoordinator').mockResolvedValue(mockTx);

      const result = await router.payFromCoordinator(
        subscriptionId,
        spenderWallet,
        spenderAddress,
        payments
      );

      expect(result).toEqual(mockTx);
      expect(router.raw.payFromCoordinator).toHaveBeenCalledWith(
        subscriptionId,
        spenderWallet,
        spenderAddress,
        payments
      );
    });

    it('should call lockForVerification', async () => {
      const proofRequest: ProofVerificationRequest = {
        requestId: '0xrequest',
        nodeAddress: '0xNode',
        proof: '0xproof',
      };
      const commitmentHash = '0xcommitmentHash';

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'lockForVerification').mockResolvedValue(mockTx);

      const result = await router.lockForVerification(proofRequest, commitmentHash);

      expect(result).toEqual(mockTx);
      expect(router.raw.lockForVerification).toHaveBeenCalledWith(proofRequest, commitmentHash);
    });

    it('should call unlockForVerification', async () => {
      const proofRequest: ProofVerificationRequest = {
        requestId: '0xrequest',
        nodeAddress: '0xNode',
        proof: '0xproof',
      };

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'unlockForVerification').mockResolvedValue(mockTx);

      const result = await router.unlockForVerification(proofRequest);

      expect(result).toEqual(mockTx);
      expect(router.raw.unlockForVerification).toHaveBeenCalledWith(proofRequest);
    });

    it('should call prepareNodeVerification', async () => {
      const subscriptionId = BigInt(1);
      const nextInterval = 101;
      const nodeWallet = '0xNodeWallet';
      const token = '0xToken';
      const amount = BigInt(1000);

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'prepareNodeVerification').mockResolvedValue(mockTx);

      const result = await router.prepareNodeVerification(
        subscriptionId,
        nextInterval,
        nodeWallet,
        token,
        amount
      );

      expect(result).toEqual(mockTx);
      expect(router.raw.prepareNodeVerification).toHaveBeenCalledWith(
        subscriptionId,
        nextInterval,
        nodeWallet,
        token,
        amount
      );
    });

    it('should call pause', async () => {
      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'pause').mockResolvedValue(mockTx);

      const result = await router.pause();

      expect(result).toEqual(mockTx);
      expect(router.raw.pause).toHaveBeenCalled();
    });

    it('should call unpause', async () => {
      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'unpause').mockResolvedValue(mockTx);

      const result = await router.unpause();

      expect(result).toEqual(mockTx);
      expect(router.raw.unpause).toHaveBeenCalled();
    });

    it('should call timeoutRequest', async () => {
      const requestId = '0xrequest123';
      const subscriptionId = BigInt(1);
      const interval = 100;

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(router.raw, 'timeoutRequest').mockResolvedValue(mockTx);

      const result = await router.timeoutRequest(requestId, subscriptionId, interval);

      expect(result).toEqual(mockTx);
      expect(router.raw.timeoutRequest).toHaveBeenCalledWith(requestId, subscriptionId, interval);
    });

    it('should return correct address', () => {
      expect(router.address).toBe(testAddress);
    });

    it('should provide event filters', () => {
      expect(router.filters).toBeDefined();
      expect(router.filters.RequestStarted).toBeDefined();
      expect(router.filters.SubscriptionCreated).toBeDefined();
      expect(router.filters.SubscriptionCancelled).toBeDefined();
    });

    it('should call on for event listeners', () => {
      const listener = vi.fn();
      vi.spyOn(router.raw, 'on').mockImplementation(() => router.raw);

      router.on('RequestStarted', listener);

      expect(router.raw.on).toHaveBeenCalledWith('RequestStarted', listener);
    });

    it('should call removeAllListeners', () => {
      vi.spyOn(router.raw, 'removeAllListeners').mockImplementation(() => router.raw);

      router.removeAllListeners('RequestStarted');

      expect(router.raw.removeAllListeners).toHaveBeenCalledWith('RequestStarted');
    });

    it('should call removeAllListeners without event', () => {
      vi.spyOn(router.raw, 'removeAllListeners').mockImplementation(() => router.raw);

      router.removeAllListeners();

      expect(router.raw.removeAllListeners).toHaveBeenCalledWith(undefined);
    });

    it('should call queryFilter', async () => {
      const filter = {};
      const fromBlock = 1000;
      const toBlock = 2000;
      const mockEvents = [{ event: 'RequestStarted', args: {} }];

      vi.spyOn(router.raw, 'queryFilter').mockResolvedValue(mockEvents);

      const result = await router.queryFilter(filter, fromBlock, toBlock);

      expect(result).toEqual(mockEvents);
      expect(router.raw.queryFilter).toHaveBeenCalledWith(filter, fromBlock, toBlock);
    });

    it('should call queryFilter with string toBlock', async () => {
      const filter = {};
      const fromBlock = 1000;
      const toBlock = 'latest';
      const mockEvents: any[] = [];

      vi.spyOn(router.raw, 'queryFilter').mockResolvedValue(mockEvents);

      const result = await router.queryFilter(filter, fromBlock, toBlock);

      expect(result).toEqual(mockEvents);
      expect(router.raw.queryFilter).toHaveBeenCalledWith(filter, fromBlock, toBlock);
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

    it('should call startRequest and return commitment', async () => {
      const requestId = '0xrequest123';
      const subscriptionId = BigInt(1);
      const containerId = '0xcontainer123';
      const interval = 100;
      const redundancy = 3;
      const useDeliveryInbox = true;
      const feeToken = '0xToken';
      const feeAmount = BigInt(1000);
      const wallet = '0xWallet';
      const verifier = '0xVerifier';

      const mockCommitment = {
        requestId,
        subscriptionId: BigInt(1),
        interval: 100,
        redundancy: 3,
        containerId,
        client: '0xClient',
        wallet,
        feeToken,
        feeAmount: BigInt(1000),
        verifier,
        useDeliveryInbox: true,
      };

      vi.spyOn(coordinator.raw, 'startRequest').mockResolvedValue(mockCommitment);

      const result = await coordinator.startRequest(
        requestId,
        subscriptionId,
        containerId,
        interval,
        redundancy,
        useDeliveryInbox,
        feeToken,
        feeAmount,
        wallet,
        verifier
      );

      expect(result.requestId).toBe(requestId);
      expect(result.subscriptionId).toBe(BigInt(1));
      expect(coordinator.raw.startRequest).toHaveBeenCalledWith(
        requestId,
        subscriptionId,
        containerId,
        interval,
        redundancy,
        useDeliveryInbox,
        feeToken,
        feeAmount,
        wallet,
        verifier
      );
    });

    it('should call cancelRequest', async () => {
      const requestId = '0xrequest123';

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(coordinator.raw, 'cancelRequest').mockResolvedValue(mockTx);

      const result = await coordinator.cancelRequest(requestId);

      expect(result).toEqual(mockTx);
      expect(coordinator.raw.cancelRequest).toHaveBeenCalledWith(requestId);
    });

    it('should call reportComputeResult with PayloadData', async () => {
      const deliveryInterval = 100;
      const input: PayloadData = { contentHash: '0xinput', uri: 'ipfs://input' };
      const output: PayloadData = { contentHash: '0xoutput', uri: 'ipfs://output' };
      const proof: PayloadData = { contentHash: '0xproof', uri: 'ipfs://proof' };
      const commitmentData = new Uint8Array([1, 2, 3, 4]);
      const nodeWallet = '0xNodeWallet';

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(coordinator.raw, 'reportComputeResult').mockResolvedValue(mockTx);

      const result = await coordinator.reportComputeResult(
        deliveryInterval,
        input,
        output,
        proof,
        commitmentData,
        nodeWallet
      );

      expect(result).toEqual(mockTx);
      expect(coordinator.raw.reportComputeResult).toHaveBeenCalled();
    });

    it('should call reportVerificationResult', async () => {
      const request: ProofVerificationRequest = {
        requestId: '0xrequest',
        nodeAddress: '0xNode',
        proof: '0xproof',
      };
      const valid = true;

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(coordinator.raw, 'reportVerificationResult').mockResolvedValue(mockTx);

      const result = await coordinator.reportVerificationResult(request, valid);

      expect(result).toEqual(mockTx);
      expect(coordinator.raw.reportVerificationResult).toHaveBeenCalledWith(request, valid);
    });

    it('should call reportVerificationResult with invalid result', async () => {
      const request: ProofVerificationRequest = {
        requestId: '0xrequest',
        nodeAddress: '0xNode',
        proof: '0xproof',
      };
      const valid = false;

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(coordinator.raw, 'reportVerificationResult').mockResolvedValue(mockTx);

      const result = await coordinator.reportVerificationResult(request, valid);

      expect(result).toEqual(mockTx);
      expect(coordinator.raw.reportVerificationResult).toHaveBeenCalledWith(request, valid);
    });

    it('should call prepareNextInterval', async () => {
      const subscriptionId = BigInt(1);
      const nextInterval = 101;
      const nodeWallet = '0xNodeWallet';

      const mockTx = { hash: '0xtx123', wait: vi.fn() };
      vi.spyOn(coordinator.raw, 'prepareNextInterval').mockResolvedValue(mockTx);

      const result = await coordinator.prepareNextInterval(subscriptionId, nextInterval, nodeWallet);

      expect(result).toEqual(mockTx);
      expect(coordinator.raw.prepareNextInterval).toHaveBeenCalledWith(
        subscriptionId,
        nextInterval,
        nodeWallet
      );
    });

    it('should return correct address', () => {
      expect(coordinator.address).toBe(testAddress);
    });

    it('should provide event filters', () => {
      expect(coordinator.filters).toBeDefined();
      expect(coordinator.filters.RequestStarted).toBeDefined();
      expect(coordinator.filters.RequestCancelled).toBeDefined();
      expect(coordinator.filters.ComputeDelivered).toBeDefined();
      expect(coordinator.filters.ProofVerified).toBeDefined();
    });

    it('should call on for event listeners', () => {
      const listener = vi.fn();
      vi.spyOn(coordinator.raw, 'on').mockImplementation(() => coordinator.raw);

      coordinator.on('ComputeDelivered', listener);

      expect(coordinator.raw.on).toHaveBeenCalledWith('ComputeDelivered', listener);
    });

    it('should call removeAllListeners', () => {
      vi.spyOn(coordinator.raw, 'removeAllListeners').mockImplementation(() => coordinator.raw);

      coordinator.removeAllListeners('ComputeDelivered');

      expect(coordinator.raw.removeAllListeners).toHaveBeenCalledWith('ComputeDelivered');
    });

    it('should call removeAllListeners without event', () => {
      vi.spyOn(coordinator.raw, 'removeAllListeners').mockImplementation(() => coordinator.raw);

      coordinator.removeAllListeners();

      expect(coordinator.raw.removeAllListeners).toHaveBeenCalledWith(undefined);
    });

    it('should call queryFilter', async () => {
      const filter = {};
      const fromBlock = 1000;
      const toBlock = 2000;
      const mockEvents = [{ event: 'ComputeDelivered', args: {} }];

      vi.spyOn(coordinator.raw, 'queryFilter').mockResolvedValue(mockEvents);

      const result = await coordinator.queryFilter(filter, fromBlock, toBlock);

      expect(result).toEqual(mockEvents);
      expect(coordinator.raw.queryFilter).toHaveBeenCalledWith(filter, fromBlock, toBlock);
    });

    it('should call queryFilter with string toBlock', async () => {
      const filter = {};
      const fromBlock = 1000;
      const toBlock = 'latest';
      const mockEvents: any[] = [];

      vi.spyOn(coordinator.raw, 'queryFilter').mockResolvedValue(mockEvents);

      const result = await coordinator.queryFilter(filter, fromBlock, toBlock);

      expect(result).toEqual(mockEvents);
      expect(coordinator.raw.queryFilter).toHaveBeenCalledWith(filter, fromBlock, toBlock);
    });
  });
});
