#!/bin/bash

# Sync ABIs from noosphere-evm to @noosphere/contracts
# Usage: ./scripts/sync-abis.sh

EVM_PATH="../noosphere-evm/out"
CONTRACTS_ABI_PATH="./packages/contracts/src/abis"

echo "🔄 Syncing ABIs from noosphere-evm..."

# Create ABI directory if it doesn't exist
mkdir -p "$CONTRACTS_ABI_PATH"

# Copy Router ABI
if [ -f "$EVM_PATH/Router.sol/Router.abi.json" ]; then
  cp "$EVM_PATH/Router.sol/Router.abi.json" "$CONTRACTS_ABI_PATH/Router.abi.json"
  echo "✓ Router.abi.json"
fi

# Copy Coordinator ABI
if [ -f "$EVM_PATH/Coordinator.sol/Coordinator.abi.json" ]; then
  cp "$EVM_PATH/Coordinator.sol/Coordinator.abi.json" "$CONTRACTS_ABI_PATH/Coordinator.abi.json"
  echo "✓ Coordinator.abi.json"
fi

# Copy SubscriptionBatchReader ABI
if [ -f "$EVM_PATH/SubscriptionBatchReader.sol/SubscriptionBatchReader.abi.json" ]; then
  cp "$EVM_PATH/SubscriptionBatchReader.sol/SubscriptionBatchReader.abi.json" "$CONTRACTS_ABI_PATH/SubscriptionBatchReader.abi.json"
  echo "✓ SubscriptionBatchReader.abi.json"
fi

echo ""
echo "✅ ABI sync completed!"

# Auto-generate TypeChain types
echo ""
echo "🔧 Regenerating TypeChain types..."
cd packages/contracts
npm run typechain

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ TypeChain types regenerated successfully!"
  echo ""
  echo "📝 TypeChain automatically updated:"
  echo "  - packages/contracts/src/typechain/* (auto-generated types)"
  echo ""
  echo "⚠️  If custom wrappers need updates, manually edit:"
  echo "  - packages/contracts/src/types/index.ts (type definitions)"
  echo "  - packages/contracts/src/*.ts (wrapper methods)"
else
  echo ""
  echo "❌ TypeChain generation failed. Please run 'npm run typechain' manually."
fi
