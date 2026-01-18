/**
 * IpfsStorage - IPFS storage provider with Pinata support
 */
import type { IPayloadStorage } from './IPayloadStorage';
import type { IpfsConfig, UploadResult } from '../types';

export class IpfsStorage implements IPayloadStorage {
  readonly name = 'ipfs';

  private gateway: string;
  private pinataApiKey?: string;
  private pinataApiSecret?: string;
  private apiUrl?: string;

  constructor(config: IpfsConfig = {}) {
    this.gateway = config.gateway || 'https://ipfs.io/ipfs/';
    this.pinataApiKey = config.pinataApiKey;
    this.pinataApiSecret = config.pinataApiSecret;
    this.apiUrl = config.apiUrl;
  }

  async upload(content: string | Uint8Array): Promise<UploadResult> {
    const data = typeof content === 'string' ? content : new TextDecoder().decode(content);

    // Use Pinata if configured
    if (this.pinataApiKey && this.pinataApiSecret) {
      return this.uploadToPinata(data);
    }

    // Use local IPFS node if configured
    if (this.apiUrl) {
      return this.uploadToLocalNode(data);
    }

    throw new Error('IPFS upload requires either Pinata credentials or local IPFS node URL');
  }

  async download(uri: string): Promise<string> {
    if (!this.canHandle(uri)) {
      throw new Error(`IpfsStorage cannot handle URI: ${uri}`);
    }

    const cid = this.extractCid(uri);
    const url = `${this.gateway}${cid}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('ipfs://');
  }

  /**
   * Check if IPFS storage is configured for upload
   */
  isConfigured(): boolean {
    // Can upload if either Pinata or local IPFS node is configured
    return !!(this.pinataApiKey && this.pinataApiSecret) || !!this.apiUrl;
  }

  private extractCid(uri: string): string {
    // Handle both ipfs:// and encoded versions
    let decoded = uri;
    if (uri.includes('%3A%2F%2F')) {
      decoded = decodeURIComponent(uri);
    }
    return decoded.replace('ipfs://', '');
  }

  private async uploadToPinata(content: string): Promise<UploadResult> {
    // Parse content if it's JSON, otherwise wrap it
    let pinataContent: unknown;
    try {
      pinataContent = JSON.parse(content);
    } catch {
      pinataContent = content;
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: this.pinataApiKey!,
        pinata_secret_api_key: this.pinataApiSecret!,
      },
      body: JSON.stringify({
        pinataContent,
        pinataMetadata: {
          name: `noosphere-payload-${Date.now()}`,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as { IpfsHash: string };
    const cid = result.IpfsHash;

    return {
      uri: `ipfs://${cid}`,
      contentId: cid,
    };
  }

  private async uploadToLocalNode(content: string): Promise<UploadResult> {
    // Use IPFS HTTP API v0
    const formData = new FormData();
    formData.append('file', new Blob([content], { type: 'application/json' }));

    const response = await fetch(`${this.apiUrl}/api/v0/add`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Local IPFS upload failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as { Hash: string };
    const cid = result.Hash;

    return {
      uri: `ipfs://${cid}`,
      contentId: cid,
    };
  }
}
