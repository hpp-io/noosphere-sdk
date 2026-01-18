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
  PayloadData,
} from '../src/types';
import { FulfillResult, InputType } from '../src/types';

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
        input: {
          contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          uri: '',
        },
        output: {
          contentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          uri: 'ipfs://QmOutput',
        },
        proof: {
          contentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          uri: '',
        },
      };

      expect(event).toBeDefined();
      expect(event.numRedundantDeliveries).toBe(3);
      expect(event.input.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(event.output.uri).toBe('ipfs://QmOutput');
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

  describe('PayloadData', () => {
    it('should accept valid PayloadData with empty URI (inline)', () => {
      const payload: PayloadData = {
        contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        uri: '',
      };

      expect(payload).toBeDefined();
      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(payload.uri).toBe('');
    });

    it('should accept valid PayloadData with IPFS URI', () => {
      const payload: PayloadData = {
        contentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      };

      expect(payload).toBeDefined();
      expect(payload.uri).toContain('ipfs://');
    });

    it('should accept valid PayloadData with HTTPS URI', () => {
      const payload: PayloadData = {
        contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        uri: 'https://api.example.com/data/12345?token=abc',
      };

      expect(payload).toBeDefined();
      expect(payload.uri).toContain('https://');
    });

    it('should accept valid PayloadData with Arweave URI', () => {
      const payload: PayloadData = {
        contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        uri: 'ar://bNbA3TEQVL60xlgCcqdz4ZPH',
      };

      expect(payload).toBeDefined();
      expect(payload.uri).toContain('ar://');
    });

    it('should accept valid PayloadData with chain URI', () => {
      const payload: PayloadData = {
        contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        uri: 'chain://1/0xabc123def456789012345678901234567890123456789012345678901234abcd/0',
      };

      expect(payload).toBeDefined();
      expect(payload.uri).toContain('chain://');
    });

    it('should accept valid PayloadData with data URI', () => {
      const payload: PayloadData = {
        contentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        uri: 'data:application/json;base64,eyJhY3Rpb24iOiJwaW5nIn0=',
      };

      expect(payload).toBeDefined();
      expect(payload.uri).toContain('data:');
    });
  });

  describe('InputType enum', () => {
    it('should export InputType enum', () => {
      expect(InputType).toBeDefined();
    });

    it('should have RAW_DATA value', () => {
      expect(InputType.RAW_DATA).toBe(0);
    });

    it('should have URI_STRING value', () => {
      expect(InputType.URI_STRING).toBe(1);
    });

    it('should have PAYLOAD_DATA value', () => {
      expect(InputType.PAYLOAD_DATA).toBe(2);
    });
  });
});
