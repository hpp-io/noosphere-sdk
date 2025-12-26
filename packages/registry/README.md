# @noosphere/registry

Container and Verifier registry manager for Noosphere SDK.

## Features

- **Local Registry**: JSON-based local registry (`.noosphere/registry.json`)
- **Remote Sync**: Automatically sync from GitHub public registry
- **Container Discovery**: Find and search compute containers
- **Verifier Discovery**: Find proof verifiers by contract address
- **Custom Entries**: Add your own containers and verifiers
- **Cache Management**: Configurable TTL for remote sync

## Installation

```bash
npm install @noosphere/registry
```

## Usage

### Basic Usage

```typescript
import { RegistryManager } from '@noosphere/registry';

// Create registry manager
const registry = new RegistryManager({
  localPath: './.noosphere/registry.json',  // Optional
  remotePath: 'https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json',  // Optional
  autoSync: true,      // Sync from remote on load
  cacheTTL: 3600000,   // 1 hour cache
});

// Load registry
await registry.load();

// Get container by ID
const container = registry.getContainer('0x123...');
console.log(container.name);        // "stable-diffusion-xl"
console.log(container.imageName);   // "runpod/stable-diffusion"
console.log(container.requirements); // { gpu: true, memory: "16GB" }

// Search containers
const aiContainers = registry.searchContainers('ai');

// List all active containers
const containers = registry.listContainers();

// Get verifier by contract address
const verifier = registry.getVerifier('0x111...');
console.log(verifier.name);  // "ZK-SNARK Groth16 Verifier"
```

### Adding Custom Containers

```typescript
await registry.addContainer({
  id: '0xabc...',
  name: 'my-custom-model',
  imageName: 'myrepo/my-model',
  port: 8000,
  requirements: {
    gpu: true,
    memory: '8GB',
    cpu: 4,
  },
  statusCode: 'ACTIVE',
  description: 'My custom AI model',
  tags: ['ai', 'custom'],
});
```

### Adding Custom Verifiers

```typescript
await registry.addVerifier({
  id: 'custom-verifier-id',
  name: 'My Custom Verifier',
  verifierAddress: '0x222...',  // Onchain verifier contract address
  imageName: 'myrepo/my-verifier',
  port: 8080,
  statusCode: 'ACTIVE',
  description: 'Custom proof verification',
});
```

### Registry Statistics

```typescript
const stats = registry.getStats();
console.log(stats);
// {
//   totalContainers: 10,
//   activeContainers: 8,
//   totalVerifiers: 2,
//   activeVerifiers: 2,
//   lastSync: '2024-12-26T00:00:00.000Z'
// }
```

## Registry Format

### Container Metadata

```typescript
interface ContainerMetadata {
  id: string;              // Unique ID (keccak256 hash)
  name: string;            // Human-readable name
  imageName: string;       // Docker image name
  port?: number;           // Exposed port
  command?: string;        // Docker command
  env?: Record<string, string>;  // Environment variables
  volumes?: string[];      // Volume mounts
  requirements?: {
    gpu?: boolean;
    memory?: string;       // "16GB"
    cpu?: number;
  };
  payments?: {
    basePrice: string;     // "0.01"
    token: string;         // "ETH"
    per: string;           // "inference"
  };
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  verified?: boolean;      // Community verified
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}
```

### Verifier Metadata

```typescript
interface VerifierMetadata {
  id: string;              // UUID
  name: string;
  verifierAddress: string; // Onchain contract address (used as key)
  imageName: string;       // Docker image for proof generation
  port?: number;
  command?: string;
  env?: Record<string, string>;
  volumes?: string[];
  payments?: {
    basePrice: string;
    token: string;
    per: string;
  };
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  verified?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

## Local Registry Path

Default: `.noosphere/registry.json`

The registry file is automatically created with example entries if it doesn't exist.

## Remote Registry

Default: `https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json`

The remote registry is a community-maintained list of verified containers and verifiers.

### Merge Strategy

- Remote entries are added to local registry
- **Local entries take precedence** (not overwritten by remote)
- Manual additions are saved locally only

## Registry Priority

1. **Local registry** (highest priority)
2. **Remote registry** (synced from GitHub)

This allows you to:
- Use community-verified containers
- Override remote entries locally
- Add private/custom containers

## Example Registry

See `examples/registry-example.json` for a complete example with:
- Echo service (for testing)
- Stable Diffusion XL (image generation)
- Llama 3 8B (text generation)
- Whisper Large V3 (speech-to-text)
- ZK-SNARK verifiers

## Contributing

To contribute containers/verifiers to the public registry:

1. Fork `hpp-io/noosphere-registry`
2. Add your entry to `registry.json`
3. Submit a pull request with:
   - Container/Verifier metadata
   - Verification that it works
   - Documentation

## License

BSD-3-Clause-Clear
