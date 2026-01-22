/**
 * DataUriStorage - Data URI storage provider (inline base64)
 */
import type { IPayloadStorage } from './IPayloadStorage';
import type { UploadResult } from '../types';
import { encodeBase64, decodeBase64, parseDataUri } from '../PayloadUtils';

export class DataUriStorage implements IPayloadStorage {
  readonly name = 'data';

  async upload(content: string | Uint8Array): Promise<UploadResult> {
    const data = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const base64 = encodeBase64(data);
    const uri = `data:;base64,${base64}`;

    return {
      uri,
      contentId: base64.slice(0, 32), // Use first 32 chars as ID
    };
  }

  async download(uri: string): Promise<string> {
    if (!this.canHandle(uri)) {
      throw new Error(`DataUriStorage cannot handle URI: ${uri}`);
    }

    const { content } = parseDataUri(uri);
    return content;
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('data:');
  }
}
