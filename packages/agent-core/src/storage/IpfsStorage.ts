/**
 * IPFS Storage Provider
 *
 * Supports both local IPFS nodes and Pinata API for pinning.
 *
 * @example
 * ```typescript
 * // Local IPFS node
 * const storage = new IpfsStorage({
 *   apiUrl: 'http://localhost:5001',
 *   gateway: 'http://localhost:8080/ipfs/'
 * });
 *
 * // Pinata
 * const storage = new IpfsStorage({
 *   apiUrl: 'https://api.pinata.cloud',
 *   apiKey: 'your-api-key',
 *   apiSecret: 'your-api-secret',
 *   gateway: 'https://gateway.pinata.cloud/ipfs/'
 * });
 *
 * const result = await storage.upload('Hello, IPFS!');
 * console.log(result.uri); // "ipfs://Qm..."
 * ```
 */

import type { IPayloadStorage, StorageConfig, UploadResult } from './IPayloadStorage';

/**
 * IPFS-specific configuration
 */
export interface IpfsStorageConfig extends StorageConfig {
  /** IPFS API URL (default: http://localhost:5001) */
  apiUrl?: string;
  /** IPFS Gateway URL (default: http://localhost:8080/ipfs/) */
  gateway?: string;
  /** Pinata API key (required for Pinata) */
  apiKey?: string;
  /** Pinata API secret (required for Pinata) */
  apiSecret?: string;
}

export class IpfsStorage implements IPayloadStorage {
  private apiUrl: string;
  private gateway: string;
  private apiKey?: string;
  private apiSecret?: string;
  private timeout: number;
  private isLocalNode: boolean;

  constructor(config: IpfsStorageConfig = {}) {
    this.apiUrl = config.apiUrl || process.env.IPFS_API_URL || 'http://localhost:5001';
    this.gateway = config.gateway || process.env.IPFS_GATEWAY || 'http://localhost:8080/ipfs/';
    this.apiKey = config.apiKey || process.env.PINATA_API_KEY;
    this.apiSecret = config.apiSecret || process.env.PINATA_API_SECRET;
    this.timeout = config.timeout || 30000;

    // Detect if using local IPFS node
    this.isLocalNode = this.apiUrl.includes('localhost') || this.apiUrl.includes('127.0.0.1');

    // Ensure gateway ends with /
    if (!this.gateway.endsWith('/')) {
      this.gateway += '/';
    }
  }

  getScheme(): string {
    return 'ipfs';
  }

  isConfigured(): boolean {
    // Local node doesn't need API keys
    if (this.isLocalNode) return true;
    // Pinata needs API keys
    return !!(this.apiKey && this.apiSecret);
  }

  async upload(content: string | Buffer): Promise<UploadResult> {
    const data = typeof content === 'string' ? content : content.toString('utf-8');
    const size = Buffer.byteLength(data, 'utf-8');

    if (this.isLocalNode) {
      return this.uploadToLocalNode(data, size);
    } else {
      return this.uploadToPinata(data, size);
    }
  }

  private async uploadToLocalNode(data: string, size: number): Promise<UploadResult> {
    // Dynamic imports for ESM compatibility
    const FormData = (await import('form-data')).default;
    const axios = (await import('axios')).default;

    const formData = new FormData();
    formData.append('file', Buffer.from(data, 'utf-8'), { filename: 'data.json' });

    const response = await axios.post(
      `${this.apiUrl}/api/v0/add`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: this.timeout,
      }
    );

    const cid = response.data.Hash;

    return {
      uri: `ipfs://${cid}`,
      contentId: cid,
      size,
    };
  }

  private async uploadToPinata(data: string, size: number): Promise<UploadResult> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Pinata API keys not configured');
    }

    const response = await fetch(`${this.apiUrl}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: this.apiKey,
        pinata_secret_api_key: this.apiSecret,
      },
      body: JSON.stringify({ pinataContent: data }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.statusText}`);
    }

    const result = await response.json() as { IpfsHash: string };
    const cid = result.IpfsHash;

    return {
      uri: `ipfs://${cid}`,
      contentId: cid,
      size,
    };
  }

  async download(uri: string): Promise<string> {
    const cid = this.extractCid(uri);
    const url = `${this.gateway}${cid}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`IPFS download failed: ${response.statusText}`);
    }

    const text = await response.text();
    return text;
  }

  /**
   * Extract CID from IPFS URI
   */
  private extractCid(uri: string): string {
    if (uri.startsWith('ipfs://')) {
      return uri.slice(7);
    }
    // Assume it's already a CID
    return uri;
  }

  /**
   * Get the gateway URL for a given CID
   */
  getGatewayUrl(cidOrUri: string): string {
    const cid = this.extractCid(cidOrUri);
    return `${this.gateway}${cid}`;
  }
}
