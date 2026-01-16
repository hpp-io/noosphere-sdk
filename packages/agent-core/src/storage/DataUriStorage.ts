/**
 * Data URI Storage Provider
 *
 * Handles inline data using data: URI scheme (RFC 2397).
 * Used for small payloads that can be embedded directly.
 *
 * @example
 * ```typescript
 * const storage = new DataUriStorage();
 * const result = await storage.upload('{"action":"ping"}');
 * console.log(result.uri);
 * // "data:application/json;base64,eyJhY3Rpb24iOiJwaW5nIn0="
 * ```
 */

import type { IPayloadStorage, UploadResult } from './IPayloadStorage';

export interface DataUriStorageConfig {
  /** MIME type for the data (default: application/json) */
  mimeType?: string;
}

export class DataUriStorage implements IPayloadStorage {
  private mimeType: string;

  constructor(config: DataUriStorageConfig = {}) {
    this.mimeType = config.mimeType || 'application/json';
  }

  getScheme(): string {
    return 'data';
  }

  isConfigured(): boolean {
    return true; // Always available
  }

  async upload(content: string | Buffer): Promise<UploadResult> {
    const data = typeof content === 'string' ? content : content.toString('utf-8');
    const base64 = Buffer.from(data, 'utf-8').toString('base64');
    const uri = `data:${this.mimeType};base64,${base64}`;

    return {
      uri,
      contentId: base64.slice(0, 20) + '...', // Truncated for display
      size: Buffer.byteLength(data, 'utf-8'),
    };
  }

  async download(uri: string): Promise<string> {
    if (!uri.startsWith('data:')) {
      throw new Error('Invalid data URI');
    }

    const match = uri.match(/^data:([^;,]+)?(;([^,]+))?,(.*)$/);
    if (!match) {
      throw new Error('Invalid data URI format');
    }

    const encoding = match[3] || 'utf-8';
    const encodedContent = match[4];

    if (encoding === 'base64') {
      return Buffer.from(encodedContent, 'base64').toString('utf-8');
    } else {
      return decodeURIComponent(encodedContent);
    }
  }
}
