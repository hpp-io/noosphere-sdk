import { describe, it, expect } from 'vitest';
import type {
  ComputeSubscription,
  Commitment,
  Payment,
  ProofVerificationRequest,
  IntervalStatus,
  RequestStartedEvent,
  RequestCancelledEvent,
  ComputeDeliveredEvent,
  ProofVerifiedEvent,
  SubscriptionCreatedEvent,
} from '../types';
import { FulfillResult } from '../types';

describe('Custom Types', () => {
  describe('ComputeSubscription', () => {
    it('should accept valid ComputeSubscription object', () => {
      const subscription: ComputeSubscription = {
        routeId: '0x1234',
        containerId: '0x5678',
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

      expect(subscription).toBeDefined();
      expect(subscription.routeId).toBe('0x1234');
      expect(subscription.feeAmount).toBe(BigInt(1000));
      expect(subscription.useDeliveryInbox).toBe(true);
    });
  });

  describe('Commitment', () => {
    it('should accept valid Commitment object', () => {
      const commitment: Commitment = {
        requestId: '0xRequest',
        subscriptionId: BigInt(1),
        interval: 100,
        redundancy: 3,
        containerId: '0xContainer',
        client: '0xClient',
        wallet: '0xWallet',
        feeToken: '0xToken',
        feeAmount: BigInt(500),
        verifier: '0xVerifier',
        useDeliveryInbox: false,
      };

      expect(commitment).toBeDefined();
      expect(commitment.subscriptionId).toBe(BigInt(1));
      expect(commitment.interval).toBe(100);
    });
  });

  describe('Payment', () => {
    it('should accept valid Payment object', () => {
      const payment: Payment = {
        recipient: '0xRecipient',
        token: '0xToken',
        amount: BigInt(1000),
      };

      expect(payment).toBeDefined();
      expect(payment.amount).toBe(BigInt(1000));
    });
  });

  describe('ProofVerificationRequest', () => {
    it('should accept valid ProofVerificationRequest object', () => {
      const request: ProofVerificationRequest = {
        subscriptionId: BigInt(1),
        interval: 100,
        verifier: '0xVerifier',
        token: '0xToken',
        amount: BigInt(500),
      };

      expect(request).toBeDefined();
      expect(request.subscriptionId).toBe(BigInt(1));
    });
  });

  describe('IntervalStatus', () => {
    it('should accept valid IntervalStatus object', () => {
      const status: IntervalStatus = {
        redundancyCount: 3,
        commitmentExists: true,
      };

      expect(status).toBeDefined();
      expect(status.redundancyCount).toBe(3);
      expect(status.commitmentExists).toBe(true);
    });
  });

  describe('FulfillResult enum', () => {
    it('should export FulfillResult enum', () => {
      expect(FulfillResult).toBeDefined();
    });

    it('should have FULFILLED value', () => {
      expect(FulfillResult.FULFILLED).toBe(0);
    });

    it('should have INVALID_REQUEST_ID value', () => {
      expect(FulfillResult.INVALID_REQUEST_ID).toBe(1);
    });

    it('should have INVALID_COMMITMENT value', () => {
      expect(FulfillResult.INVALID_COMMITMENT).toBe(2);
    });

    it('should have REDUNDANCY_NOT_MET value', () => {
      expect(FulfillResult.REDUNDANCY_NOT_MET).toBe(3);
    });

    it('should have INSUFFICIENT_PAYMENT value', () => {
      expect(FulfillResult.INSUFFICIENT_PAYMENT).toBe(4);
    });

    it('should have VERIFICATION_REQUIRED value', () => {
      expect(FulfillResult.VERIFICATION_REQUIRED).toBe(5);
    });

    it('should have VERIFICATION_FAILED value', () => {
      expect(FulfillResult.VERIFICATION_FAILED).toBe(6);
    });
  });

  describe('Event Types', () => {
    it('should accept valid RequestStartedEvent object', () => {
      const event: RequestStartedEvent = {
        requestId: '0xRequest',
        subscriptionId: BigInt(1),
        containerId: '0xContainer',
        commitment: {
          requestId: '0xRequest',
          subscriptionId: BigInt(1),
          interval: 100,
          redundancy: 3,
          containerId: '0xContainer',
          client: '0xClient',
          wallet: '0xWallet',
          feeToken: '0xToken',
          feeAmount: BigInt(500),
          verifier: '0xVerifier',
          useDeliveryInbox: false,
        },
      };

      expect(event).toBeDefined();
      expect(event.requestId).toBe('0xRequest');
    });

    it('should accept valid RequestCancelledEvent object', () => {
      const event: RequestCancelledEvent = {
        requestId: '0xRequest',
      };

      expect(event).toBeDefined();
      expect(event.requestId).toBe('0xRequest');
    });

    it('should accept valid ComputeDeliveredEvent object', () => {
      const event: ComputeDeliveredEvent = {
        requestId: '0xRequest',
        nodeWallet: '0xNode',
        numRedundantDeliveries: 3,
      };

      expect(event).toBeDefined();
      expect(event.numRedundantDeliveries).toBe(3);
    });

    it('should accept valid ProofVerifiedEvent object', () => {
      const event: ProofVerifiedEvent = {
        subscriptionId: BigInt(1),
        interval: 100,
        node: '0xNode',
        valid: true,
        verifier: '0xVerifier',
      };

      expect(event).toBeDefined();
      expect(event.valid).toBe(true);
    });

    it('should accept valid SubscriptionCreatedEvent object', () => {
      const event: SubscriptionCreatedEvent = {
        subscriptionId: BigInt(1),
        client: '0xClient',
        routeId: '0xRoute',
        containerId: '0xContainer',
      };

      expect(event).toBeDefined();
      expect(event.subscriptionId).toBe(BigInt(1));
    });
  });
});
