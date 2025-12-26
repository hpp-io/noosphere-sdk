import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { KeystoreManager } from './KeystoreManager';
import { WalletFactoryAbi__factory } from '@noosphere/contracts';

export class WalletManager {
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private keystoreManager?: KeystoreManager;

  constructor(privateKey: string, provider: ethers.Provider, keystoreManager?: KeystoreManager) {
    this.wallet = new ethers.Wallet(privateKey, provider);
    this.provider = provider;
    this.keystoreManager = keystoreManager;
  }

  /**
   * Initialize WalletManager from KeystoreManager
   * This is the recommended way to create a WalletManager for production use
   */
  static async fromKeystoreManager(
    keystoreManager: KeystoreManager,
    provider: ethers.Provider
  ): Promise<WalletManager> {
    const wallet = await keystoreManager.getEOA(provider);
    const manager = new WalletManager(wallet.privateKey, provider, keystoreManager);
    console.log('✓ WalletManager initialized from keystore');
    return manager;
  }

  /**
   * Get the agent's wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get the wallet instance
   */
  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  /**
   * Generate deterministic payment wallet using HDNode derivation
   * @param subscriptionId - Subscription ID to derive wallet for
   */
  async getDeterministicPaymentWallet(subscriptionId: bigint): Promise<string> {
    // Derive child wallet using subscription ID as path
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      await this.getMnemonic(),
      undefined,
      `m/44'/60'/0'/0/${subscriptionId.toString()}`
    );

    return hdNode.address;
  }

  /**
   * Get or generate mnemonic for HD wallet derivation
   */
  private async getMnemonic(): Promise<string> {
    const mnemonicPath = path.join(process.cwd(), '.noosphere', 'mnemonic.txt');

    try {
      // Try to load existing mnemonic
      const mnemonic = await fs.readFile(mnemonicPath, 'utf-8');
      return mnemonic.trim();
    } catch {
      // Generate new mnemonic
      const wallet = ethers.Wallet.createRandom();
      const mnemonic = wallet.mnemonic!.phrase;

      // Save to file
      await fs.mkdir(path.dirname(mnemonicPath), { recursive: true });
      await fs.writeFile(mnemonicPath, mnemonic);

      console.log('Generated new mnemonic and saved to', mnemonicPath);
      console.log('⚠️  IMPORTANT: Back up this mnemonic phrase securely!');

      return mnemonic;
    }
  }

  /**
   * Sign EIP-712 typed data for delegated subscription creation
   */
  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  /**
   * Get current ETH balance
   */
  async getBalance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }

  /**
   * Get ERC20 token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
    ];

    const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
    return contract.balanceOf(this.wallet.address);
  }

  /**
   * Load wallet from keystore file
   */
  static async fromKeystore(
    keystorePath: string,
    password: string,
    provider: ethers.Provider
  ): Promise<WalletManager> {
    const keystore = await fs.readFile(keystorePath, 'utf-8');
    const wallet = await ethers.Wallet.fromEncryptedJson(keystore, password);
    return new WalletManager(wallet.privateKey, provider);
  }

  /**
   * Save wallet to encrypted keystore file
   */
  async toKeystore(password: string, outputPath: string): Promise<void> {
    const keystore = await this.wallet.encrypt(password);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, keystore);
  }

  /**
   * Create a new payment wallet using WalletFactory contract
   * @param walletFactoryAddress - Address of the WalletFactory contract
   * @param initialOwner - Address that will own the new wallet (typically subscription owner)
   * @param subscriptionId - Optional subscription ID to associate with this wallet
   * @returns Transaction receipt and new wallet address
   */
  async createPaymentWallet(
    walletFactoryAddress: string,
    initialOwner: string,
    subscriptionId?: string
  ): Promise<{ walletAddress: string; txHash: string }> {
    // Use TypeChain-generated factory from @noosphere/contracts
    const walletFactory = WalletFactoryAbi__factory.connect(
      walletFactoryAddress,
      this.wallet
    );

    console.log(`Creating payment wallet for owner: ${initialOwner}...`);

    // Call createWallet with type-safe method
    const tx = await walletFactory.createWallet(initialOwner);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction receipt not available');
    }

    // Parse WalletCreated event using TypeChain-generated interface
    const event = receipt.logs
      .map((log) => {
        try {
          return walletFactory.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === 'WalletCreated');

    if (!event) {
      throw new Error('WalletCreated event not found in transaction receipt');
    }

    const walletAddress = event.args.walletAddress;

    console.log(`✓ Payment wallet created: ${walletAddress}`);
    console.log(`  Transaction: ${receipt.hash}`);

    // Note: We don't have the private key for WalletFactory-created wallets
    // These are smart contract wallets, not EOAs
    // They are controlled through the WalletFactory contract
    console.log(`  ⚠️  This is a smart contract wallet (not an EOA)`);

    // Save to keystore if available
    if (this.keystoreManager && subscriptionId) {
      await this.keystoreManager.addPaymentWallet(
        walletAddress,
        '', // Smart contract wallet has no private key
        subscriptionId,
        {
          type: 'SmartContract',
          factoryAddress: walletFactoryAddress,
        }
      );
      console.log(`  ✓ Wallet metadata saved to keystore`);
    }

    return {
      walletAddress,
      txHash: receipt.hash,
    };
  }

  /**
   * Create a new EOA payment wallet and save to keystore
   * This creates a regular externally-owned account (EOA) wallet
   * @param subscriptionId - Optional subscription ID to associate with this wallet
   * @returns Wallet address and private key (for immediate use, then should be discarded)
   */
  async createEOAPaymentWallet(
    subscriptionId?: string
  ): Promise<{ walletAddress: string; privateKey: string }> {
    // Generate new wallet
    const newWallet = ethers.Wallet.createRandom();

    console.log(`Creating EOA payment wallet: ${newWallet.address}...`);

    // Save to keystore if available
    if (this.keystoreManager) {
      await this.keystoreManager.addPaymentWallet(
        newWallet.address,
        newWallet.privateKey,
        subscriptionId,
        {
          type: 'EOA',
          createdBy: this.wallet.address,
        }
      );
      console.log(`✓ Payment wallet saved to keystore`);
    } else {
      console.warn('⚠️  KeystoreManager not available, wallet not saved');
    }

    return {
      walletAddress: newWallet.address,
      privateKey: newWallet.privateKey,
    };
  }

  /**
   * Get a payment wallet from keystore
   */
  async getPaymentWallet(walletAddress: string): Promise<ethers.Wallet> {
    if (!this.keystoreManager) {
      throw new Error('KeystoreManager not available');
    }

    return this.keystoreManager.getPaymentWallet(walletAddress, this.provider);
  }

  /**
   * List all payment wallets in keystore
   */
  listPaymentWallets(): Array<{ address: string; subscriptionId?: string }> {
    if (!this.keystoreManager) {
      return [];
    }

    return this.keystoreManager.listPaymentWallets();
  }

  /**
   * Check if a wallet address was created by WalletFactory
   * @param walletFactoryAddress - Address of the WalletFactory contract
   * @param walletAddress - Wallet address to validate
   * @returns True if wallet was created by this factory
   */
  async isValidWallet(
    walletFactoryAddress: string,
    walletAddress: string
  ): Promise<boolean> {
    // Use TypeChain-generated factory from @noosphere/contracts
    const walletFactory = WalletFactoryAbi__factory.connect(
      walletFactoryAddress,
      this.provider
    );

    return walletFactory.isValidWallet(walletAddress);
  }

  /**
   * Fund a payment wallet with ETH
   * @param walletAddress - Address of the wallet to fund
   * @param amount - Amount in ETH as string (e.g., "0.1")
   */
  async fundWallet(walletAddress: string, amount: string): Promise<string> {
    const tx = await this.wallet.sendTransaction({
      to: walletAddress,
      value: ethers.parseEther(amount),
    });

    const receipt = await tx.wait();
    console.log(`✓ Funded ${walletAddress} with ${amount} ETH`);
    console.log(`  Transaction: ${receipt?.hash}`);

    return receipt?.hash || '';
  }

  /**
   * Get balance of a payment wallet
   * @param walletAddress - Address of the wallet to check
   */
  async getWalletBalance(walletAddress: string): Promise<bigint> {
    return this.provider.getBalance(walletAddress);
  }
}
