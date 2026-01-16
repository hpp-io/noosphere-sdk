/**
 * HTTP/HTTPS Storage Provider
 *
 * Handles fetching content from HTTP/HTTPS URLs.
 * Upload is not supported - use a dedicated storage service instead.
 *
 * @example
 * ```typescript
 * const storage = new HttpStorage();
 * const content = await storage.download('https://api.example.com/data/123');
 * ```
 */

import type { IPayloadStorage, UploadResult } from './IPayloadStorage';

export interface HttpStorageConfig {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Default headers to include in requests */
  headers?: Record<string, string>;
}

export class HttpStorage implements IPayloadStorage {
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: HttpStorageConfig = {}) {
    this.timeout = config.timeout || 30000;
    this.headers = config.headers || {};
  }

  getScheme(): string {
    return 'https';
  }

  isConfigured(): boolean {
    return true; // Always available for download
  }

  async upload(_content: string | Buffer): Promise<UploadResult> {
    throw new Error('HTTP upload not supported - use a dedicated storage service (IPFS, S3, etc.)');
  }

  async download(uri: string): Promise<string> {
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      throw new Error('Invalid HTTP/HTTPS URI');
    }

    const response = await fetch(uri, {
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP download failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }
}
