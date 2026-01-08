# Community Registry Guide

This guide explains how to set up, contribute to, and use the GitHub-based Noosphere Community Registry for containers and verifiers.

## Overview

The Noosphere Community Registry is a GitHub-hosted public registry of verified compute containers and proof verifiers. It enables:

- **Discovery**: Find community-verified containers and verifiers
- **Sharing**: Contribute your own containers and verifiers
- **Synchronization**: Automatic sync with local SDK registry
- **Decentralization**: No central authority required

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           GitHub Repository                             │
│   github.com/hpp-io/noosphere-registry                  │
│                                                          │
│   registry.json  (Community Registry)                   │
│   ├── containers: {...}                                 │
│   └── verifiers: {...}                                  │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTPS fetch
┌─────────────────────────────────────────────────────────┐
│           Noosphere SDK Agent                           │
│                                                          │
│   .noosphere/registry.json  (Local Registry)            │
│   ├── containers: {...}  ← Remote + Local               │
│   └── verifiers: {...}   ← Remote + Local               │
│                                                          │
│   Merge Strategy:                                       │
│   - Remote entries are synced                           │
│   - Local entries override remote (same ID)             │
│   - Manual additions are local-only                     │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1: Setting Up the Community Registry (GitHub)

### Step 1: Create GitHub Repository

```bash
# Create new repository
gh repo create hpp-io/noosphere-registry --public --description "Community registry for Noosphere containers and verifiers"

# Clone and set up
git clone https://github.com/hpp-io/noosphere-registry.git
cd noosphere-registry
```

### Step 2: Initialize Registry Structure

Create `registry.json`:

```json
{
  "version": "1.0.0",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "containers": {},
  "verifiers": {}
}
```

Create `README.md`:

```markdown
# Noosphere Community Registry

Public registry of verified compute containers and proof verifiers for the Noosphere network.

## Usage

This registry is automatically synced by the Noosphere SDK. See [SDK Documentation](https://github.com/hpp-io/noosphere-sdk) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding containers and verifiers.
```

Create `CONTRIBUTING.md`:

```markdown
# Contributing to Noosphere Registry

## Adding a Container

1. Fork this repository
2. Add your container to `registry.json` under `containers`
3. Follow the container schema (see below)
4. Submit a pull request with:
   - Container metadata
   - Docker image verification
   - Test results
   - Documentation

## Adding a Verifier

1. Fork this repository
2. Add your verifier to `registry.json` under `verifiers`
3. Follow the verifier schema (see below)
4. Submit a pull request with:
   - Verifier metadata
   - Contract verification
   - Test results
   - Documentation

## Review Process

All submissions are reviewed for:
- ✅ Correct schema format
- ✅ Working Docker image
- ✅ Security review
- ✅ Documentation quality
- ✅ Test coverage
```

### Step 3: Define Schemas

Create `schemas/container-schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "imageName", "statusCode"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{64}$",
      "description": "keccak256 hash of container metadata"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable container name"
    },
    "imageName": {
      "type": "string",
      "description": "Docker image name (e.g., 'runpod/stable-diffusion')"
    },
    "port": {
      "type": "number",
      "minimum": 1,
      "maximum": 65535
    },
    "command": {
      "type": "string"
    },
    "env": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "volumes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "requirements": {
      "type": "object",
      "properties": {
        "gpu": {
          "type": "boolean"
        },
        "memory": {
          "type": "string",
          "pattern": "^[0-9]+(GB|MB)$"
        },
        "cpu": {
          "type": "number",
          "minimum": 1
        }
      }
    },
    "payments": {
      "type": "object",
      "required": ["basePrice", "token", "per"],
      "properties": {
        "basePrice": {
          "type": "string"
        },
        "token": {
          "type": "string"
        },
        "per": {
          "type": "string"
        }
      }
    },
    "statusCode": {
      "type": "string",
      "enum": ["ACTIVE", "INACTIVE", "DEPRECATED"]
    },
    "verified": {
      "type": "boolean"
    },
    "description": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

Create `schemas/verifier-schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "verifierAddress", "imageName", "statusCode"],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "verifierAddress": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{40}$",
      "description": "Onchain verifier contract address"
    },
    "imageName": {
      "type": "string"
    },
    "port": {
      "type": "number"
    },
    "command": {
      "type": "string"
    },
    "env": {
      "type": "object"
    },
    "volumes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "payments": {
      "type": "object",
      "properties": {
        "basePrice": {
          "type": "string"
        },
        "token": {
          "type": "string"
        },
        "per": {
          "type": "string"
        }
      }
    },
    "statusCode": {
      "type": "string",
      "enum": ["ACTIVE", "INACTIVE", "DEPRECATED"]
    },
    "verified": {
      "type": "boolean"
    },
    "description": {
      "type": "string"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

### Step 4: Add Validation Script

Create `scripts/validate-registry.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv();
addFormats(ajv);

// Load schemas
const containerSchema = JSON.parse(fs.readFileSync('./schemas/container-schema.json', 'utf-8'));
const verifierSchema = JSON.parse(fs.readFileSync('./schemas/verifier-schema.json', 'utf-8'));

// Load registry
const registry = JSON.parse(fs.readFileSync('./registry.json', 'utf-8'));

// Validate
let isValid = true;

console.log('Validating containers...');
for (const [id, container] of Object.entries(registry.containers)) {
  const validate = ajv.compile(containerSchema);
  if (!validate(container)) {
    console.error(`❌ Container ${id} is invalid:`);
    console.error(validate.errors);
    isValid = false;
  } else {
    console.log(`✅ Container ${id} is valid`);
  }
}

console.log('\nValidating verifiers...');
for (const [address, verifier] of Object.entries(registry.verifiers)) {
  const validate = ajv.compile(verifierSchema);
  if (!validate(verifier)) {
    console.error(`❌ Verifier ${address} is invalid:`);
    console.error(validate.errors);
    isValid = false;
  } else {
    console.log(`✅ Verifier ${address} is valid`);
  }
}

if (!isValid) {
  process.exit(1);
}

console.log('\n✅ All entries are valid!');
```

Add to `package.json`:

```json
{
  "name": "noosphere-registry",
  "version": "1.0.0",
  "scripts": {
    "validate": "node scripts/validate-registry.js"
  },
  "devDependencies": {
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1"
  }
}
```

### Step 5: Set Up GitHub Actions

Create `.github/workflows/validate.yml`:

```yaml
name: Validate Registry

on:
  pull_request:
    paths:
      - 'registry.json'
  push:
    branches:
      - main

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Validate registry
        run: npm run validate

      - name: Check for duplicates
        run: |
          node -e "
          const registry = require('./registry.json');
          const containerIds = Object.keys(registry.containers);
          const verifierIds = Object.values(registry.verifiers).map(v => v.id);
          const duplicateContainers = containerIds.filter((id, i) => containerIds.indexOf(id) !== i);
          const duplicateVerifiers = verifierIds.filter((id, i) => verifierIds.indexOf(id) !== i);

          if (duplicateContainers.length > 0) {
            console.error('❌ Duplicate container IDs:', duplicateContainers);
            process.exit(1);
          }
          if (duplicateVerifiers.length > 0) {
            console.error('❌ Duplicate verifier IDs:', duplicateVerifiers);
            process.exit(1);
          }
          console.log('✅ No duplicates found');
          "
```

---

## Part 2: Contributing to the Registry

### Adding a Container

#### Step 1: Generate Container ID

```bash
# Container ID is keccak256(name + imageName + version)
# Use this script or generate manually
npm install ethers

node -e "
const { ethers } = require('ethers');
const name = 'stable-diffusion-xl';
const imageName = 'runpod/stable-diffusion';
const version = 'v1.0';
const id = ethers.keccak256(ethers.toUtf8Bytes(name + imageName + version));
console.log('Container ID:', id);
"
```

#### Step 2: Create Container Entry

Fork the repository and add to `registry.json`:

```json
{
  "containers": {
    "0x123abc...": {
      "id": "0x123abc...",
      "name": "stable-diffusion-xl",
      "imageName": "runpod/stable-diffusion",
      "port": 8000,
      "command": "python server.py",
      "env": {
        "MODEL": "stable-diffusion-xl-base-1.0"
      },
      "requirements": {
        "gpu": true,
        "memory": "16GB",
        "cpu": 4
      },
      "payments": {
        "basePrice": "0.01",
        "token": "ETH",
        "per": "inference"
      },
      "statusCode": "ACTIVE",
      "verified": true,
      "description": "Stable Diffusion XL for high-quality image generation",
      "tags": ["ai", "image-generation", "diffusion"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

#### Step 3: Submit Pull Request

```bash
# Fork and clone
gh repo fork hpp-io/noosphere-registry --clone

# Create branch
git checkout -b add-stable-diffusion-xl

# Edit registry.json
# Add your container

# Validate locally
npm run validate

# Commit and push
git add registry.json
git commit -m "Add Stable Diffusion XL container"
git push origin add-stable-diffusion-xl

# Create PR
gh pr create \
  --title "Add Stable Diffusion XL container" \
  --body "## Container Details

- **Name**: stable-diffusion-xl
- **Image**: runpod/stable-diffusion
- **Requirements**: 16GB RAM, GPU

## Verification

- ✅ Docker image tested and working
- ✅ Inference speed: ~3s per image
- ✅ Schema validation passed
- ✅ Security review: No known vulnerabilities

## Test Results

\`\`\`bash
docker run -p 8000:8000 runpod/stable-diffusion
curl -X POST http://localhost:8000/generate -d '{\"prompt\": \"test\"}'
# Output: Image generated successfully
\`\`\`
"
```

### Adding a Verifier

#### Step 1: Deploy Verifier Contract

```solidity
// Deploy your verifier contract
// Get the contract address
```

#### Step 2: Create Verifier Entry

```json
{
  "verifiers": {
    "0x1111111111111111111111111111111111111111": {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "ZK-SNARK Groth16 Verifier",
      "verifierAddress": "0x1111111111111111111111111111111111111111",
      "imageName": "zksnark/groth16-prover",
      "port": 8080,
      "command": "npm start",
      "statusCode": "ACTIVE",
      "verified": true,
      "description": "Groth16 ZK-SNARK proof verifier for compute verification",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

#### Step 3: Submit Pull Request

Similar to container submission, but include:
- Contract verification on block explorer
- Proof generation/verification examples
- Gas cost analysis

---

## Part 3: Using the Community Registry in SDK

### Basic Usage

```typescript
import { RegistryManager } from '@noosphere/registry';

// Initialize with community registry
const registry = new RegistryManager({
  remotePath: 'https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json',
  autoSync: true,
  cacheTTL: 3600000, // 1 hour
});

// Load (automatically syncs from GitHub)
await registry.load();

// Search community containers
const aiContainers = registry.searchContainers('ai');
console.log(`Found ${aiContainers.length} AI containers`);

// Get specific container
const sdxl = registry.getContainer('0x123abc...');
console.log('Container:', sdxl.name);

// Get verifier by contract address
const verifier = registry.getVerifier('0x1111111111111111111111111111111111111111');
console.log('Verifier:', verifier.name);
```

### Custom Remote Registry

```typescript
// Use your own fork or private registry
const registry = new RegistryManager({
  remotePath: 'https://raw.githubusercontent.com/YOUR-ORG/noosphere-registry/main/registry.json',
  autoSync: true,
});

await registry.load();
```

### Local Override

```typescript
// Community registry + local customization
const registry = new RegistryManager({
  localPath: './.noosphere/registry.json',
  remotePath: 'https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json',
  autoSync: true,
});

await registry.load();

// Add private container (saved locally only)
await registry.addContainer({
  id: '0xprivate...',
  name: 'my-private-model',
  imageName: 'myrepo/private-model',
  statusCode: 'ACTIVE',
  // ...
});

// Local override takes precedence over remote
```

### Agent Integration

```typescript
import { NoosphereAgent } from '@noosphere/agent-core';
import { RegistryManager } from '@noosphere/registry';

// Load registry
const registry = new RegistryManager();
await registry.load();

// Use with agent
const agent = await NoosphereAgent.fromKeystore(
  keystorePath,
  password,
  {
    config: { /* ... */ },
    getContainer: async (containerId) => {
      // Fetch from community registry
      const container = registry.getContainer(containerId);

      if (!container) {
        throw new Error(`Container ${containerId} not found in registry`);
      }

      if (container.statusCode !== 'ACTIVE') {
        throw new Error(`Container ${containerId} is ${container.statusCode}`);
      }

      return container;
    },
  }
);

await agent.start();
```

---

## Part 4: Registry Maintenance

### Versioning

Update `version` field in `registry.json` when making changes:

```json
{
  "version": "1.1.0",  // Increment on changes
  "updatedAt": "2025-01-15T00:00:00.000Z"
}
```

### Deprecating Containers

```json
{
  "containers": {
    "0xold...": {
      "statusCode": "DEPRECATED",
      "description": "Deprecated. Use 0xnew... instead.",
      // ...
    }
  }
}
```

### Security Updates

If a container has security issues:

1. Change `statusCode` to `INACTIVE`
2. Update `description` with security advisory
3. Notify users via GitHub Discussions
4. Submit PR with fix or removal

---

## Part 5: Advanced Topics

### CDN Distribution

Use jsDelivr for faster access:

```typescript
const registry = new RegistryManager({
  remotePath: 'https://cdn.jsdelivr.net/gh/hpp-io/noosphere-registry@main/registry.json',
  autoSync: true,
});
```

### Multiple Registry Sources

```typescript
class MultiRegistryManager {
  private registries: RegistryManager[] = [];

  async addSource(remotePath: string) {
    const registry = new RegistryManager({ remotePath });
    await registry.load();
    this.registries.push(registry);
  }

  getContainer(id: string) {
    for (const registry of this.registries) {
      const container = registry.getContainer(id);
      if (container) return container;
    }
    return undefined;
  }
}

// Usage
const multiRegistry = new MultiRegistryManager();
await multiRegistry.addSource('https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json');
await multiRegistry.addSource('https://raw.githubusercontent.com/my-org/custom-registry/main/registry.json');
```

### Registry Mirroring

Set up automatic mirroring for high availability:

```yaml
# .github/workflows/mirror.yml
name: Mirror Registry

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Mirror to backup
        run: |
          curl -o registry.json https://raw.githubusercontent.com/hpp-io/noosphere-registry/main/registry.json
          # Upload to backup storage (S3, IPFS, etc.)
```

---

## Conclusion

The GitHub-based Community Registry provides:

- ✅ Decentralized container/verifier discovery
- ✅ Community-driven verification
- ✅ Automatic SDK synchronization
- ✅ Version control and history
- ✅ Easy contribution process

For questions or support:
- GitHub Issues: https://github.com/hpp-io/noosphere-registry/issues
- Discussions: https://github.com/hpp-io/noosphere-registry/discussions
