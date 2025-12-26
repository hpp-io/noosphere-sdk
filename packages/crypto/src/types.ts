/**
 * Types for Noosphere crypto package
 */

/**
 * Keystore format for storing EOA and payment wallets
 */
export interface NoosphereKeystore {
  version: string;
  eoa: {
    address: string;
    keystore: string; // Encrypted JSON keystore
  };
  paymentWallets: {
    [walletAddress: string]: {
      address: string;
      privateKey: string; // Encrypted with password
      subscriptionId?: string;
      createdAt: string;
      metadata?: Record<string, any>;
    };
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Payment wallet information
 */
export interface PaymentWalletInfo {
  address: string;
  subscriptionId?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Keystore information (without decrypting)
 */
export interface KeystoreInfo {
  version: string;
  eoaAddress: string;
  paymentWalletCount: number;
  createdAt: string;
  updatedAt: string;
}
