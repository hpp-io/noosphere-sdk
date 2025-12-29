#!/usr/bin/env node
/**
 * Generate Container ID for Noosphere Registry
 *
 * Container IDs are generated using: keccak256(abi.encode(string))
 * This matches the Solidity on-chain encoding and the Java/TypeScript agent implementations.
 *
 * Usage:
 *   node generate-container-id.js "container-name"
 *   node generate-container-id.js "noosphere-hello-world"
 */

const { ethers } = require('ethers');

function generateContainerId(containerName) {
  // Use the same method as Solidity's abi.encode(string)
  // and Java's FunctionEncoder.encode(new Utf8String(string))
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['string'], [containerName]);
  const hash = ethers.keccak256(encoded);
  return hash;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Container name required');
    console.error('');
    console.error('Usage:');
    console.error('  node generate-container-id.js <container-name>');
    console.error('');
    console.error('Example:');
    console.error('  node generate-container-id.js "noosphere-hello-world"');
    console.error('  Output: 0x2fe108c896fbbc20874ff97c7f230c6d06da1e60e731cbedae60125468f8333a');
    process.exit(1);
  }

  const containerName = args[0];
  const containerId = generateContainerId(containerName);

  console.log(`Container Name: ${containerName}`);
  console.log(`Container ID:   ${containerId}`);
  console.log('');
  console.log('Add this to registry.json under "containers":');
  console.log(JSON.stringify({
    [containerId]: {
      id: containerId,
      name: containerName,
      // ... other fields
    }
  }, null, 2));
}

module.exports = { generateContainerId };
