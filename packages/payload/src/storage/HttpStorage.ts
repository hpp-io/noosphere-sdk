/**
 * HttpStorage - HTTP/HTTPS storage provider (download only)
 */
import type { IPayloadStorage } from './IPayloadStorage';
import type { UploadResult } from '../types';

export class HttpStorage implements IPayloadStorage {
  readonly name = 'http';

  async upload(_content: string | Uint8Array): Promise<UploadResult> {
    throw new Error('HttpStorage does not support upload - use a dedicated storage service');
  }

  async download(uri: string): Promise<string> {
    if (!this.canHandle(uri)) {
      throw new Error(`HttpStorage cannot handle URI: ${uri}`);
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`HTTP fetch failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('https://') || uri.startsWith('http://');
  }
}
