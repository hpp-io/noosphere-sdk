import { ethers } from 'ethers';
import { WalletManager } from '../src/WalletManager';

describe('WalletManager', () => {
  let provider: ethers.JsonRpcProvider;
  let walletManager: WalletManager;
  const testPrivateKey = '0x' + '1'.repeat(64); // Valid but fake private key

  beforeEach(() => {
    // Use a test provider (not connected to real network)
    provider = new ethers.JsonRpcProvider('http://localhost:8545');
    walletManager = new WalletManager(testPrivateKey, provider);
  });

  describe('getAddress', () => {
    it('should return wallet address', () => {
      const address = walletManager.getAddress();

      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should return consistent address', () => {
      const address1 = walletManager.getAddress();
      const address2 = walletManager.getAddress();

      expect(address1).toBe(address2);
    });
  });

  describe('getWallet', () => {
    it('should return wallet instance', () => {
      const wallet = walletManager.getWallet();

      expect(wallet).toBeInstanceOf(ethers.Wallet);
      expect(wallet.address).toBe(walletManager.getAddress());
    });
  });

  describe('getDeterministicPaymentWallet', () => {
    it('should generate deterministic wallet for subscription', async () => {
      const subscriptionId = 1n;
      const paymentWallet = await walletManager.getDeterministicPaymentWallet(subscriptionId);

      expect(paymentWallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should generate same wallet for same subscription', async () => {
      const subscriptionId = 1n;
      const wallet1 = await walletManager.getDeterministicPaymentWallet(subscriptionId);
      const wallet2 = await walletManager.getDeterministicPaymentWallet(subscriptionId);

      expect(wallet1).toBe(wallet2);
    });

    it('should generate different wallets for different subscriptions', async () => {
      const wallet1 = await walletManager.getDeterministicPaymentWallet(1n);
      const wallet2 = await walletManager.getDeterministicPaymentWallet(2n);

      expect(wallet1).not.toBe(wallet2);
    });
  });

  describe('signTypedData', () => {
    it('should sign EIP-712 typed data', async () => {
      const domain = {
        name: 'Test',
        version: '1',
        chainId: 1,
        verifyingContract: '0x1111111111111111111111111111111111111111',
      };

      const types = {
        TestMessage: [
          { name: 'message', type: 'string' },
          { name: 'value', type: 'uint256' },
        ],
      };

      const value = {
        message: 'Hello',
        value: 123,
      };

      const signature = await walletManager.signTypedData(domain, types, value);

      expect(signature).toMatch(/^0x[0-9a-f]{130}$/); // 65 bytes = 130 hex chars
    });

    it('should produce deterministic signatures', async () => {
      const domain = {
        name: 'Test',
        version: '1',
        chainId: 1,
        verifyingContract: '0x1111111111111111111111111111111111111111',
      };

      const types = {
        TestMessage: [{ name: 'message', type: 'string' }],
      };

      const value = { message: 'Hello' };

      const sig1 = await walletManager.signTypedData(domain, types, value);
      const sig2 = await walletManager.signTypedData(domain, types, value);

      expect(sig1).toBe(sig2);
    });
  });
});
