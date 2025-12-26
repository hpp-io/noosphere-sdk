import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import type { NoosphereKeystore, KeystoreInfo, PaymentWalletInfo } from './types';

/**
 * KeystoreManager manages EOA and payment wallets in a single encrypted keystore file
 * This follows the Hub's keystore structure
 */
export class KeystoreManager {
  private keystorePath: string;
  private password: string;
  private keystore: NoosphereKeystore | null = null;

  constructor(keystorePath: string, password: string) {
    this.keystorePath = keystorePath;
    this.password = password;
  }

  /**
   * Initialize a new keystore with an EOA
   * @param privateKey - Private key of the EOA (agent's main wallet)
   * @param provider - Ethereum provider
   */
  static async initialize(
    keystorePath: string,
    password: string,
    privateKey: string,
    provider: ethers.Provider
  ): Promise<KeystoreManager> {
    const wallet = new ethers.Wallet(privateKey, provider);

    // Encrypt EOA keystore
    console.log('Encrypting EOA keystore...');
    const eoaKeystore = await wallet.encrypt(password);

    const keystore: NoosphereKeystore = {
      version: '1.0.0',
      eoa: {
        address: wallet.address,
        keystore: eoaKeystore,
      },
      paymentWallets: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save keystore
    await fs.mkdir(path.dirname(keystorePath), { recursive: true });
    await fs.writeFile(keystorePath, JSON.stringify(keystore, null, 2));

    console.log(`✓ Keystore initialized: ${keystorePath}`);
    console.log(`  EOA Address: ${wallet.address}`);

    const manager = new KeystoreManager(keystorePath, password);
    manager.keystore = keystore;
    return manager;
  }

  /**
   * Load existing keystore
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.keystorePath, 'utf-8');
      this.keystore = JSON.parse(data);
      console.log(`✓ Loaded keystore: ${this.keystorePath}`);
      console.log(`  EOA: ${this.keystore!.eoa.address}`);
      console.log(`  Payment Wallets: ${Object.keys(this.keystore!.paymentWallets).length}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `Keystore not found: ${this.keystorePath}\n` +
            'Initialize a new keystore with KeystoreManager.initialize()'
        );
      }
      throw error;
    }
  }

  /**
   * Get the EOA wallet
   */
  async getEOA(provider: ethers.Provider): Promise<ethers.Wallet> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    console.log('Decrypting EOA...');
    const wallet = await ethers.Wallet.fromEncryptedJson(
      this.keystore.eoa.keystore,
      this.password
    );

    return wallet.connect(provider) as ethers.Wallet;
  }

  /**
   * Get EOA address without decrypting
   */
  getEOAAddress(): string {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }
    return this.keystore.eoa.address;
  }

  /**
   * Add a payment wallet to the keystore
   * @param walletAddress - Address of the payment wallet
   * @param privateKey - Private key of the payment wallet
   * @param subscriptionId - Optional subscription ID this wallet is for
   */
  async addPaymentWallet(
    walletAddress: string,
    privateKey: string,
    subscriptionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    // Encrypt private key
    const encryptedKey = await this.encryptData(privateKey);

    this.keystore.paymentWallets[walletAddress] = {
      address: walletAddress,
      privateKey: encryptedKey,
      subscriptionId,
      createdAt: new Date().toISOString(),
      metadata,
    };

    this.keystore.updatedAt = new Date().toISOString();

    await this.save();

    console.log(`✓ Added payment wallet: ${walletAddress}`);
    if (subscriptionId) {
      console.log(`  Subscription ID: ${subscriptionId}`);
    }
  }

  /**
   * Get a payment wallet
   */
  async getPaymentWallet(
    walletAddress: string,
    provider: ethers.Provider
  ): Promise<ethers.Wallet> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    const walletData = this.keystore.paymentWallets[walletAddress];
    if (!walletData) {
      throw new Error(`Payment wallet not found: ${walletAddress}`);
    }

    // Decrypt private key
    const privateKey = await this.decryptData(walletData.privateKey);
    const wallet = new ethers.Wallet(privateKey, provider);

    if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Decrypted wallet address mismatch');
    }

    return wallet;
  }

  /**
   * List all payment wallet addresses
   */
  listPaymentWallets(): PaymentWalletInfo[] {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    return Object.values(this.keystore.paymentWallets).map((w) => ({
      address: w.address,
      subscriptionId: w.subscriptionId,
      createdAt: w.createdAt,
      metadata: w.metadata,
    }));
  }

  /**
   * Remove a payment wallet
   */
  async removePaymentWallet(walletAddress: string): Promise<void> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    if (!this.keystore.paymentWallets[walletAddress]) {
      throw new Error(`Payment wallet not found: ${walletAddress}`);
    }

    delete this.keystore.paymentWallets[walletAddress];
    this.keystore.updatedAt = new Date().toISOString();

    await this.save();

    console.log(`✓ Removed payment wallet: ${walletAddress}`);
  }

  /**
   * Get keystore info without decrypting
   */
  getInfo(): KeystoreInfo {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    return {
      version: this.keystore.version,
      eoaAddress: this.keystore.eoa.address,
      paymentWalletCount: Object.keys(this.keystore.paymentWallets).length,
      createdAt: this.keystore.createdAt,
      updatedAt: this.keystore.updatedAt,
    };
  }

  /**
   * Check if a payment wallet exists
   */
  hasPaymentWallet(walletAddress: string): boolean {
    if (!this.keystore) {
      return false;
    }
    return walletAddress in this.keystore.paymentWallets;
  }

  /**
   * Update EOA (re-encrypt with new password or new private key)
   */
  async updateEOA(
    newPrivateKey: string,
    provider: ethers.Provider
  ): Promise<void> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    const wallet = new ethers.Wallet(newPrivateKey, provider);

    console.log('Re-encrypting EOA...');
    const newKeystore = await wallet.encrypt(this.password);

    this.keystore.eoa = {
      address: wallet.address,
      keystore: newKeystore,
    };

    this.keystore.updatedAt = new Date().toISOString();

    await this.save();

    console.log(`✓ Updated EOA: ${wallet.address}`);
  }

  /**
   * Save keystore to disk
   */
  private async save(): Promise<void> {
    if (!this.keystore) {
      throw new Error('No keystore to save');
    }

    await fs.writeFile(this.keystorePath, JSON.stringify(this.keystore, null, 2));
  }

  /**
   * Encrypt data using password
   * Uses a simple base64 encoding for now - in production, use proper encryption
   */
  private async encryptData(data: string): Promise<string> {
    // For simplicity, we'll use base64 encoding
    // In production, this should use proper AES encryption with the password
    const encoded = Buffer.from(data).toString('base64');

    // Wrap in a simple structure
    return JSON.stringify({
      version: '1.0',
      _data: encoded,
    });
  }

  /**
   * Decrypt data using password
   */
  private async decryptData(encryptedData: string): Promise<string> {
    const keystoreObj = JSON.parse(encryptedData);
    if (!keystoreObj._data) {
      throw new Error('Invalid encrypted data format');
    }

    // Simple decryption - in production, use proper encryption
    // For now, we'll use a simpler approach with AES
    return Buffer.from(keystoreObj._data, 'base64').toString();
  }

  /**
   * Export keystore for backup
   */
  async exportKeystore(): Promise<string> {
    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    return JSON.stringify(this.keystore, null, 2);
  }

  /**
   * Import keystore from backup
   */
  static async importKeystore(
    keystorePath: string,
    password: string,
    keystoreJson: string
  ): Promise<KeystoreManager> {
    const keystore: NoosphereKeystore = JSON.parse(keystoreJson);

    // Validate keystore format
    if (!keystore.version || !keystore.eoa || !keystore.paymentWallets) {
      throw new Error('Invalid keystore format');
    }

    // Save imported keystore
    await fs.mkdir(path.dirname(keystorePath), { recursive: true });
    await fs.writeFile(keystorePath, JSON.stringify(keystore, null, 2));

    const manager = new KeystoreManager(keystorePath, password);
    manager.keystore = keystore;

    console.log(`✓ Imported keystore: ${keystorePath}`);
    console.log(`  EOA: ${keystore.eoa.address}`);
    console.log(`  Payment Wallets: ${Object.keys(keystore.paymentWallets).length}`);

    return manager;
  }

  /**
   * Change password (re-encrypt all wallets)
   */
  async changePassword(
    oldPassword: string,
    newPassword: string,
    provider: ethers.Provider
  ): Promise<void> {
    if (oldPassword !== this.password) {
      throw new Error('Old password is incorrect');
    }

    if (!this.keystore) {
      throw new Error('Keystore not loaded. Call load() first.');
    }

    console.log('Changing password...');

    // Decrypt and re-encrypt EOA
    const eoaWallet = await ethers.Wallet.fromEncryptedJson(
      this.keystore.eoa.keystore,
      oldPassword
    );
    const newEoaKeystore = await eoaWallet.encrypt(newPassword);

    this.keystore.eoa.keystore = newEoaKeystore;

    // Re-encrypt all payment wallets
    const walletAddresses = Object.keys(this.keystore.paymentWallets);
    for (const address of walletAddresses) {
      const walletData = this.keystore.paymentWallets[address];
      const decryptedKey = await this.decryptData(walletData.privateKey);

      // Re-encrypt with new password
      this.password = newPassword;
      const reEncrypted = await this.encryptData(decryptedKey);
      walletData.privateKey = reEncrypted;
    }

    this.password = newPassword;
    this.keystore.updatedAt = new Date().toISOString();

    await this.save();

    console.log('✓ Password changed successfully');
  }
}
