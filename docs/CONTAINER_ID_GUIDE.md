# Container ID Generation Guide

## Overview

Container IDs in the Noosphere Registry are **deterministic hashes** generated using the **keccak256** algorithm with **ABI encoding**. This ensures compatibility with Solidity smart contracts and all agent implementations (Java, TypeScript, etc.).

## Container ID Formula

```
Container ID = keccak256(abi.encode(string containerName))
```

This is equivalent to:
- **Solidity**: `keccak256(abi.encode(containerName))`
- **Java (Web3j)**: `Hash.sha3(FunctionEncoder.encode(new Utf8String(containerName)))`
- **TypeScript (ethers.js)**: `ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [containerName]))`

## Why This Method?

1. **On-chain Compatibility**: Matches Solidity's `abi.encode()` exactly
2. **Deterministic**: Same input always produces the same ID
3. **Cross-platform**: Works identically in Java, TypeScript, and Solidity
4. **Collision-resistant**: Keccak256 provides strong security

## Generating Container IDs

### Method 1: Using the Script (Recommended)

```bash
cd packages/registry
node scripts/generate-container-id.js "your-container-name"
```

**Example:**
```bash
$ node scripts/generate-container-id.js "noosphere-hello-world"

Container Name: noosphere-hello-world
Container ID:   0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a
```

### Method 2: Using Node.js

```javascript
const { ethers } = require('ethers');

function generateContainerId(containerName) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['string'], [containerName]);
  const hash = ethers.keccak256(encoded);
  return hash;
}

const id = generateContainerId('noosphere-hello-world');
console.log(id); // 0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a
```

### Method 3: Using Solidity

```solidity
function generateContainerId(string memory containerName) public pure returns (bytes32) {
    return keccak256(abi.encode(containerName));
}
```

## Standard Container IDs

These are the official Container IDs for the standard Noosphere containers:

| Container Name | Container ID |
|----------------|--------------|
| `noosphere-hello-world` | `0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a` |
| `noosphere-llm` | `0x4548979e884d5d80117fbed9525e85279935318bdb71f8b73894cf7230686e93` |
| `noosphere-freqtrade` | `0xfbd9e6eaa33e51a09fbe8c1c499d81bc0400ead72ae49acc3c9adb839198ea82` |

## Adding a New Container to the Registry

1. **Generate the Container ID** using the script:
   ```bash
   node scripts/generate-container-id.js "my-new-container"
   ```

2. **Add to `registry.json`**:
   ```json
   {
     "containers": {
       "0x<generated-id>": {
         "id": "0x<generated-id>",
         "name": "my-new-container",
         "imageName": "ghcr.io/hpp-io/my-new-container:latest",
         "port": 8080,
         "statusCode": "ACTIVE",
         "verified": true,
         "description": "Description of my container",
         "tags": ["tag1", "tag2"]
       }
     }
   }
   ```

3. **Verify** the entry using the validation script:
   ```bash
   npm run validate
   ```

## Important Notes

### ❌ DO NOT

- **DO NOT** use simple `keccak256(containerName)` without ABI encoding
- **DO NOT** manually create or modify container IDs
- **DO NOT** use uppercase/lowercase variations of the same name (they produce different IDs!)

### ✅ DO

- **DO** use the provided script for consistency
- **DO** use lowercase, hyphenated names (e.g., `my-container-name`)
- **DO** verify IDs match across config.json and registry.json
- **DO** test the generated ID with the agent before deploying

## Verification

To verify a container ID is correct:

```javascript
const { ethers } = require('ethers');

const containerName = "noosphere-hello-world";
const expectedId = "0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a";

const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['string'], [containerName]);
const generatedId = ethers.keccak256(encoded);

console.log('Match:', generatedId === expectedId); // Should be true
```

## Common Pitfalls

1. **Case Sensitivity**: `"My-Container"` and `"my-container"` produce **different IDs**
2. **Encoding Method**: Using wrong encoding (e.g., UTF-8 bytes instead of ABI encode) produces wrong IDs
3. **Spaces**: `"my container"` vs `"my-container"` are different names

## Agent Configuration

### config.json Format

```json
{
  "containers": [
    {
      "id": "noosphere-hello-world",  // ← Use the NAME, not the hash
      "image": "ghcr.io/hpp-io/example-hello-world-noosphere:latest",
      "port": "8081"
    }
  ]
}
```

**The agent will automatically hash the name** using `keccak256(abi.encode(string))` to match on-chain events and registry lookups.

## Technical Details

### ABI Encoding Breakdown

For the string `"noosphere-hello-world"`:

1. **Length prefix**: `0x0000000000000000000000000000000000000000000000000000000000000020` (offset)
2. **String length**: `0x0000000000000000000000000000000000000000000000000000000000000015` (21 bytes)
3. **String data**: `0x6e6f6f7370686572652d68656c6c6f2d776f726c640000000000000000000000` (padded to 32 bytes)

Then keccak256 hash of all the above → **0x2fe108c8...**

### Why Not Simple Hashing?

```javascript
// ❌ WRONG - Simple keccak256
ethers.id("noosphere-hello-world")
// → 0xe5fb2c8156ebdf5752f3f270bc7930f2198f8c02d4f125d1ea81e3c839b20d1d

// ✅ CORRECT - ABI encoded keccak256
ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ["noosphere-hello-world"]))
// → 0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a
```

The ABI encoding is required to match Solidity's on-chain behavior.

## Support

For questions or issues:
- GitHub Issues: https://github.com/hpp-io/noosphere-sdk/issues
- Documentation: https://docs.hpp.io
