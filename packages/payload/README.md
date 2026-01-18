# @noosphere/payload

PayloadData utilities for URI-based payload handling in Noosphere. Works in both browser and Node.js environments.

## Installation

```bash
npm install @noosphere/payload
```

## Features

- **URI-based payload resolution** - Support for `data:`, `ipfs://`, `https://` schemes
- **Content integrity verification** - Automatic keccak256 hash verification
- **Multiple storage backends** - IPFS (Pinata), S3/R2, Data URI
- **Browser & Node.js compatible** - Works in both environments
- **Automatic storage selection** - Uploads large payloads to external storage

## Quick Start

### Creating PayloadData

```typescript
import { createDataUriPayload, createIpfsPayload } from '@noosphere/payload';

// Small data - inline as data: URI
const smallPayload = createDataUriPayload('{"action": "ping"}');
// { contentHash: '0x...', uri: 'data:application/json;base64,...' }

// Large data - reference IPFS CID
const largePayload = createIpfsPayload(largeContent, 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
// { contentHash: '0x...', uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' }
```

### Resolving PayloadData

```typescript
import { PayloadResolver } from '@noosphere/payload';

const resolver = new PayloadResolver({
  ipfs: {
    gateway: 'https://ipfs.io/ipfs/',
  },
});

// Resolve any PayloadData to actual content
const { content, verified, type } = await resolver.resolve(payload);
console.log(content);   // The actual content
console.log(verified);  // true if hash matches
console.log(type);      // 'data_uri' | 'ipfs' | 'https' | ...
```

### Auto-encoding with Upload

```typescript
import { PayloadResolver } from '@noosphere/payload';

const resolver = new PayloadResolver({
  uploadThreshold: 1024, // 1KB
  defaultStorage: 'ipfs',
  ipfs: {
    pinataApiKey: 'your-api-key',
    pinataApiSecret: 'your-api-secret',
  },
});

// Small content -> data: URI
const small = await resolver.encode('small content');
// { contentHash: '0x...', uri: 'data:...' }

// Large content -> automatically uploaded to IPFS
const large = await resolver.encode(largeContent);
// { contentHash: '0x...', uri: 'ipfs://Qm...' }
```

## Supported URI Schemes

| Scheme | Description | Use Case |
|--------|-------------|----------|
| Scheme | Description | Use Case |
|--------|-------------|----------|
| `data:` | Inline base64-encoded | Small payloads (< threshold) |
| `ipfs://` | IPFS content addressing | Decentralized storage |
| `https://` | HTTP(S) URLs | S3, R2, any HTTP storage |

## Storage Backends

### Data URI (Inline)

```typescript
import { DataUriStorage } from '@noosphere/payload';

const storage = new DataUriStorage();
const { uri } = await storage.upload('content');
// uri = 'data:application/json;base64,...'
```

### IPFS (Pinata)

```typescript
import { IpfsStorage } from '@noosphere/payload';

const storage = new IpfsStorage({
  gateway: 'https://ipfs.io/ipfs/',
  pinataApiKey: 'your-api-key',
  pinataApiSecret: 'your-api-secret',
});

const { uri, contentId } = await storage.upload('content');
// uri = 'ipfs://Qm...'
// contentId = 'Qm...'
```

### S3/R2

```typescript
import { S3Storage } from '@noosphere/payload';

const storage = new S3Storage({
  endpoint: 'https://account.r2.cloudflarestorage.com',
  bucket: 'my-bucket',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  publicUrlBase: 'https://pub-xxx.r2.dev',
});

const { uri } = await storage.upload('content');
// uri = 'https://pub-xxx.r2.dev/hash.json'
```

## API Reference

### PayloadUtils

```typescript
// Create PayloadData
createDataUriPayload(content: string, mimeType?: string): PayloadData
createIpfsPayload(content: string, cid: string): PayloadData
createHttpsPayload(content: string, url: string): PayloadData
createInlinePayload(content: string): PayloadData

// Utilities
computeContentHash(content: string): `0x${string}`
verifyContentHash(content: string, expectedHash: `0x${string}`): boolean
detectPayloadType(payload: PayloadData): PayloadType
parseDataUri(uri: string): { mimeType, encoding, content }
extractIpfsCid(uri: string): string
```

### PayloadResolver

```typescript
class PayloadResolver {
  constructor(config?: PayloadResolverConfig)

  // Resolve PayloadData to content
  resolve(payload: PayloadData, inlineData?: string): Promise<ResolvedPayload>

  // Encode content as PayloadData (with auto-upload)
  encode(content: string, options?: { forceUpload?: boolean, storage?: 'ipfs' | 's3' | 'data' }): Promise<PayloadData>

  // Check if content should be uploaded
  shouldUpload(content: string): boolean
}
```

## Types

```typescript
interface PayloadData {
  contentHash: `0x${string}`;  // keccak256(content)
  uri: string;                  // Full URI
}

type PayloadType = 'inline' | 'data_uri' | 'ipfs' | 'https' | 'http' | 'unknown';

interface ResolvedPayload {
  content: string;
  verified: boolean;
  type: PayloadType;
}
```

## License

MIT
