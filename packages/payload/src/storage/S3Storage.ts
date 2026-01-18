/**
 * S3Storage - S3-compatible storage provider (AWS S3, Cloudflare R2, MinIO)
 */
import type { IPayloadStorage } from './IPayloadStorage';
import type { S3Config, UploadResult } from '../types';
import { computeContentHash } from '../PayloadUtils';

export class S3Storage implements IPayloadStorage {
  readonly name = 's3';

  private config: S3Config;

  constructor(config: S3Config) {
    this.config = {
      region: 'auto',
      ...config,
    };
  }

  async upload(content: string | Uint8Array): Promise<UploadResult> {
    const data = typeof content === 'string' ? content : new TextDecoder().decode(content);

    // Generate a unique key using content hash
    const hash = computeContentHash(data);
    const key = this.config.keyPrefix
      ? `${this.config.keyPrefix}/${hash.slice(2)}.json`
      : `${hash.slice(2)}.json`;

    // Create signed request
    const url = `${this.config.endpoint}/${this.config.bucket}/${key}`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.slice(0, 8);

    // AWS Signature Version 4 signing
    const headers = await this.signRequest('PUT', key, data, timestamp, date);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`S3 upload failed: ${response.status} ${errorText}`);
    }

    // Generate public URL
    const publicUrl = this.config.publicUrlBase
      ? `${this.config.publicUrlBase}/${key}`
      : url;

    return {
      uri: publicUrl,
      contentId: key,
    };
  }

  async download(uri: string): Promise<string> {
    // S3Storage downloads via HTTP, so delegate to fetch
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`S3 download failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  /**
   * Check if S3 storage is configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.accessKeyId &&
      this.config.secretAccessKey &&
      this.config.bucket &&
      this.config.endpoint
    );
  }

  canHandle(uri: string): boolean {
    // S3 URLs are served via HTTPS
    if (!uri.startsWith('https://')) return false;

    // Check if URL matches our endpoint or public URL base
    const endpoint = this.config.endpoint.replace('https://', '');
    const publicBase = this.config.publicUrlBase?.replace('https://', '');

    return uri.includes(endpoint) || (publicBase ? uri.includes(publicBase) : false);
  }

  /**
   * Sign request using AWS Signature Version 4
   */
  private async signRequest(
    method: string,
    key: string,
    body: string,
    timestamp: string,
    date: string
  ): Promise<Record<string, string>> {
    const service = 's3';
    const region = this.config.region || 'auto';

    // Hash the payload
    const payloadHash = await this.sha256Hex(body);

    // Create canonical request
    const canonicalUri = `/${this.config.bucket}/${key}`;
    const canonicalQueryString = '';
    const host = new URL(this.config.endpoint).host;

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${timestamp}\n`;

    const canonicalRequest =
      `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign =
      `${algorithm}\n${timestamp}\n${credentialScope}\n${await this.sha256Hex(canonicalRequest)}`;

    // Calculate signature
    const signingKey = await this.getSignatureKey(
      this.config.secretAccessKey,
      date,
      region,
      service
    );
    const signature = await this.hmacHex(signingKey, stringToSign);

    // Create authorization header
    const authorization =
      `${algorithm} ` +
      `Credential=${this.config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;

    return {
      Authorization: authorization,
      'x-amz-date': timestamp,
      'x-amz-content-sha256': payloadHash,
      Host: host,
    };
  }

  private async sha256(message: string | Uint8Array): Promise<Uint8Array> {
    const data = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
  }

  private async sha256Hex(message: string): Promise<string> {
    const hash = await this.sha256(message);
    return Array.from(hash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
    // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
    const keyBuffer = new ArrayBuffer(key.byteLength);
    new Uint8Array(keyBuffer).set(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
    return new Uint8Array(signature);
  }

  private async hmacHex(key: Uint8Array, message: string): Promise<string> {
    const hash = await this.hmac(key, message);
    return Array.from(hash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async getSignatureKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<Uint8Array> {
    const kDate = await this.hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }
}
