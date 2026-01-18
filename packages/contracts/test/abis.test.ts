import { describe, it, expect } from 'vitest';
import { ABIs } from '../src/index';

describe('ABI Exports', () => {
  describe('Router ABI', () => {
    it('should export Router ABI', () => {
      expect(ABIs.Router).toBeDefined();
      expect(Array.isArray(ABIs.Router)).toBe(true);
      expect(ABIs.Router.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure', () => {
      const abi = ABIs.Router;
      const hasType = abi.every((item: any) => 'type' in item);
      expect(hasType).toBe(true);
    });

    it('should include key functions', () => {
      const functionNames = ABIs.Router.filter((item: any) => item.type === 'function').map(
        (item: any) => item.name
      );

      expect(functionNames).toContain('sendRequest');
      expect(functionNames).toContain('createComputeSubscription');
      expect(functionNames).toContain('getWalletFactory');
    });

    it('should include events', () => {
      const events = ABIs.Router.filter((item: any) => item.type === 'event');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should include errors', () => {
      const errors = ABIs.Router.filter((item: any) => item.type === 'error');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Coordinator ABI', () => {
    it('should export Coordinator ABI', () => {
      expect(ABIs.Coordinator).toBeDefined();
      expect(Array.isArray(ABIs.Coordinator)).toBe(true);
      expect(ABIs.Coordinator.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure', () => {
      const abi = ABIs.Coordinator;
      const hasType = abi.every((item: any) => 'type' in item);
      expect(hasType).toBe(true);
    });
  });

  describe('SubscriptionBatchReader ABI', () => {
    it('should export SubscriptionBatchReader ABI', () => {
      expect(ABIs.SubscriptionBatchReader).toBeDefined();
      expect(Array.isArray(ABIs.SubscriptionBatchReader)).toBe(true);
      expect(ABIs.SubscriptionBatchReader.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure', () => {
      const abi = ABIs.SubscriptionBatchReader;
      const hasType = abi.every((item: any) => 'type' in item);
      expect(hasType).toBe(true);
    });
  });

  describe('WalletFactory ABI', () => {
    it('should export WalletFactory ABI', () => {
      expect(ABIs.WalletFactory).toBeDefined();
      expect(Array.isArray(ABIs.WalletFactory)).toBe(true);
      expect(ABIs.WalletFactory.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure', () => {
      const abi = ABIs.WalletFactory;
      const hasType = abi.every((item: any) => 'type' in item);
      expect(hasType).toBe(true);
    });

    it('should include createWallet function', () => {
      const functionNames = ABIs.WalletFactory.filter((item: any) => item.type === 'function').map(
        (item: any) => item.name
      );

      expect(functionNames).toContain('createWallet');
    });

    it('should include WalletCreated event', () => {
      const eventNames = ABIs.WalletFactory.filter((item: any) => item.type === 'event').map(
        (item: any) => item.name
      );

      expect(eventNames).toContain('WalletCreated');
    });
  });

  describe('Wallet ABI', () => {
    it('should export Wallet ABI', () => {
      expect(ABIs.Wallet).toBeDefined();
      expect(Array.isArray(ABIs.Wallet)).toBe(true);
      expect(ABIs.Wallet.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure', () => {
      const abi = ABIs.Wallet;
      const hasType = abi.every((item: any) => 'type' in item);
      expect(hasType).toBe(true);
    });

    it('should include key wallet functions', () => {
      const functionNames = ABIs.Wallet.filter((item: any) => item.type === 'function').map(
        (item: any) => item.name
      );

      expect(functionNames).toContain('approve');
      expect(functionNames).toContain('lockForRequest');
      expect(functionNames).toContain('disburseForFulfillment');
    });
  });

  describe('All ABIs', () => {
    it('should export all expected ABIs', () => {
      expect(Object.keys(ABIs)).toEqual([
        'Router',
        'Coordinator',
        'SubscriptionBatchReader',
        'WalletFactory',
        'Wallet',
      ]);
    });
  });
});
