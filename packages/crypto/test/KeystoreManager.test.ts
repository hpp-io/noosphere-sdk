import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { KeystoreManager } from '../src/KeystoreManager';
import type { NoosphereKeystore } from '../src/types';

describe('KeystoreManager', () => {
  let provider: ethers.JsonRpcProvider;
  const testPrivateKey = '0x' + '1'.repeat(64);
  const testPassword = 'test-password-123';
  const testKeystorePath = path.join(__dirname, '.test-keystore.json');

  beforeEach(() => {
    provider = new ethers.JsonRpcProvider('http://localhost:8545');
  });

  afterEach(async () => {
    // Clean up test keystore file
    try {
      await fs.unlink(testKeystorePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('initialize', () => {
    it('should create a new keystore with EOA', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      expect(manager).toBeInstanceOf(KeystoreManager);

      // Verify file was created
      const exists = await fs.access(testKeystorePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Verify keystore structure
      const info = manager.getInfo();
      expect(info.version).toBe('1.0.0');
      expect(info.eoaAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(info.paymentWalletCount).toBe(0);
    });

    it('should create keystore with correct EOA address', async () => {
      const wallet = new ethers.Wallet(testPrivateKey);
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const info = manager.getInfo();
      expect(info.eoaAddress).toBe(wallet.address);
    });
  });

  describe('load', () => {
    it('should load existing keystore', async () => {
      // Create keystore first
      await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      // Load it
      const manager = new KeystoreManager(testKeystorePath, testPassword);
      await manager.load();

      const info = manager.getInfo();
      expect(info.version).toBe('1.0.0');
      expect(info.eoaAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should throw error if keystore does not exist', async () => {
      const manager = new KeystoreManager('/nonexistent/path.json', testPassword);

      await expect(manager.load()).rejects.toThrow('Keystore not found');
    });

    it('should throw error if load() not called', () => {
      const manager = new KeystoreManager(testKeystorePath, testPassword);

      expect(() => manager.getInfo()).toThrow('Keystore not loaded');
    });
  });

  describe('getEOA', () => {
    it('should decrypt and return EOA wallet', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const wallet = await manager.getEOA(provider);

      expect(wallet).toBeInstanceOf(ethers.Wallet);
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(wallet.provider).toBe(provider);
    });

    it('should return same address as getEOAAddress', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const wallet = await manager.getEOA(provider);
      const address = manager.getEOAAddress();

      expect(wallet.address).toBe(address);
    });
  });

  describe('payment wallets', () => {
    let manager: KeystoreManager;
    const paymentPrivateKey = '0x' + '2'.repeat(64);
    const subscriptionId = 'sub-123';

    beforeEach(async () => {
      manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );
    });

    it('should add payment wallet', async () => {
      const paymentWallet = new ethers.Wallet(paymentPrivateKey);

      await manager.addPaymentWallet(
        paymentWallet.address,
        paymentPrivateKey,
        subscriptionId,
        { type: 'EOA' }
      );

      const info = manager.getInfo();
      expect(info.paymentWalletCount).toBe(1);
    });

    it('should retrieve payment wallet', async () => {
      const paymentWallet = new ethers.Wallet(paymentPrivateKey);

      await manager.addPaymentWallet(
        paymentWallet.address,
        paymentPrivateKey,
        subscriptionId
      );

      const retrieved = await manager.getPaymentWallet(
        paymentWallet.address,
        provider
      );

      expect(retrieved.address).toBe(paymentWallet.address);
      expect(retrieved.provider).toBe(provider);
    });

    it('should list payment wallets', async () => {
      const wallet1 = new ethers.Wallet(paymentPrivateKey);
      const wallet2 = new ethers.Wallet('0x' + '3'.repeat(64));

      await manager.addPaymentWallet(wallet1.address, paymentPrivateKey, 'sub-1');
      await manager.addPaymentWallet(wallet2.address, '0x' + '3'.repeat(64), 'sub-2');

      const wallets = manager.listPaymentWallets();

      expect(wallets).toHaveLength(2);
      expect(wallets[0].address).toBe(wallet1.address);
      expect(wallets[0].subscriptionId).toBe('sub-1');
      expect(wallets[1].address).toBe(wallet2.address);
      expect(wallets[1].subscriptionId).toBe('sub-2');
    });

    it('should remove payment wallet', async () => {
      const paymentWallet = new ethers.Wallet(paymentPrivateKey);

      await manager.addPaymentWallet(
        paymentWallet.address,
        paymentPrivateKey,
        subscriptionId
      );

      expect(manager.getInfo().paymentWalletCount).toBe(1);

      await manager.removePaymentWallet(paymentWallet.address);

      expect(manager.getInfo().paymentWalletCount).toBe(0);
    });

    it('should check if payment wallet exists', async () => {
      const paymentWallet = new ethers.Wallet(paymentPrivateKey);

      expect(manager.hasPaymentWallet(paymentWallet.address)).toBe(false);

      await manager.addPaymentWallet(
        paymentWallet.address,
        paymentPrivateKey,
        subscriptionId
      );

      expect(manager.hasPaymentWallet(paymentWallet.address)).toBe(true);
    });

    it('should throw error when retrieving non-existent wallet', async () => {
      await expect(
        manager.getPaymentWallet('0x' + '9'.repeat(40), provider)
      ).rejects.toThrow('Payment wallet not found');
    });
  });

  describe('updateEOA', () => {
    it('should update EOA with new private key', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const oldAddress = manager.getEOAAddress();
      const newPrivateKey = '0x' + '5'.repeat(64);
      const newWallet = new ethers.Wallet(newPrivateKey);

      await manager.updateEOA(newPrivateKey, provider);

      const newAddress = manager.getEOAAddress();
      expect(newAddress).toBe(newWallet.address);
      expect(newAddress).not.toBe(oldAddress);
    });
  });

  describe('export/import', () => {
    it('should export keystore as JSON', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const exported = await manager.exportKeystore();
      const parsed: NoosphereKeystore = JSON.parse(exported);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.eoa).toBeDefined();
      expect(parsed.paymentWallets).toBeDefined();
    });

    it('should import keystore from JSON', async () => {
      // Create and export
      const manager1 = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const exported = await manager1.exportKeystore();
      const originalAddress = manager1.getEOAAddress();

      // Delete original
      await fs.unlink(testKeystorePath);

      // Import
      const importPath = path.join(__dirname, '.test-import.json');
      const manager2 = await KeystoreManager.importKeystore(
        importPath,
        testPassword,
        exported
      );

      expect(manager2.getEOAAddress()).toBe(originalAddress);

      // Clean up
      await fs.unlink(importPath);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const oldAddress = manager.getEOAAddress();
      const newPassword = 'new-password-456';

      await manager.changePassword(testPassword, newPassword, provider);

      // Verify we can still get EOA with new password
      const wallet = await manager.getEOA(provider);
      expect(wallet.address).toBe(oldAddress);
    });

    it('should throw error with wrong old password', async () => {
      const manager = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      await expect(
        manager.changePassword('wrong-password', 'new-password', provider)
      ).rejects.toThrow('Old password is incorrect');
    });
  });

  describe('persistence', () => {
    it('should persist changes to disk', async () => {
      // Create keystore
      const manager1 = await KeystoreManager.initialize(
        testKeystorePath,
        testPassword,
        testPrivateKey,
        provider
      );

      const wallet = new ethers.Wallet('0x' + '6'.repeat(64));
      await manager1.addPaymentWallet(wallet.address, '0x' + '6'.repeat(64), 'sub-test');

      // Load in new instance
      const manager2 = new KeystoreManager(testKeystorePath, testPassword);
      await manager2.load();

      const wallets = manager2.listPaymentWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].address).toBe(wallet.address);
    });
  });
});
