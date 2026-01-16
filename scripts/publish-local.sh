#!/bin/bash
# =============================================================================
# Publish SDK Packages to Local Verdaccio Registry
# =============================================================================
#
# This script publishes @noosphere/* packages to a local Verdaccio registry
# for development and testing purposes.
#
# Prerequisites:
#   Verdaccio running at http://localhost:4873
#   (Can be started via noosphere-agent-js: docker compose -f docker/docker-compose.yml up verdaccio -d)
#
# Usage:
#   ./scripts/publish-local.sh
#   # or with custom registry URL:
#   VERDACCIO_URL=http://localhost:4873 ./scripts/publish-local.sh
#
# =============================================================================

set -e

# Configuration
VERDACCIO_URL="${VERDACCIO_URL:-http://localhost:4873}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGES=("contracts" "crypto" "registry" "agent-core")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Publishing SDK to Local Verdaccio"
echo "=========================================="
echo ""

# Check if Verdaccio is running
echo -e "${YELLOW}Checking Verdaccio...${NC}"
if ! curl -s "${VERDACCIO_URL}/-/ping" > /dev/null 2>&1; then
    echo -e "${RED}Error: Verdaccio is not running at ${VERDACCIO_URL}${NC}"
    echo ""
    echo "Start Verdaccio first. If using noosphere-agent-js:"
    echo "  cd ../noosphere-agent-js"
    echo "  docker compose -f docker/docker-compose.yml up verdaccio -d"
    echo ""
    exit 1
fi
echo -e "${GREEN}Verdaccio is running${NC}"
echo ""

echo "SDK path: $SDK_ROOT"
echo ""

# Note: Verdaccio config allows unauthenticated publishing for @noosphere/* packages
echo ""

# Publish each package
echo "=========================================="
echo "Publishing packages..."
echo "=========================================="

for pkg in "${PACKAGES[@]}"; do
    PKG_PATH="${SDK_ROOT}/packages/${pkg}"

    if [ ! -d "$PKG_PATH" ]; then
        echo -e "${YELLOW}Skipping ${pkg} (not found)${NC}"
        continue
    fi

    echo ""
    echo -e "${YELLOW}Publishing @noosphere/${pkg}...${NC}"

    cd "$PKG_PATH"

    # Build if build script exists
    if grep -q '"build"' package.json; then
        echo "  Building..."
        npm run build 2>/dev/null || true
    fi

    # Get current version
    VERSION=$(node -p "require('./package.json').version")
    echo "  Version: ${VERSION}"

    # Publish (--force to overwrite if same version exists)
    if npm publish --registry "${VERDACCIO_URL}" 2>&1; then
        echo -e "  ${GREEN}Published @noosphere/${pkg}@${VERSION}${NC}"
    else
        # Try unpublish and republish for same version
        echo "  Attempting to republish..."
        npm unpublish "@noosphere/${pkg}@${VERSION}" --registry "${VERDACCIO_URL}" --force 2>/dev/null || true
        npm publish --registry "${VERDACCIO_URL}" 2>&1 || echo -e "  ${YELLOW}Warning: Could not publish${NC}"
    fi
done

# Reset npm registry to default
echo ""
echo -e "${YELLOW}Resetting npm registry to default...${NC}"
npm config set registry "https://registry.npmjs.org"

echo ""
echo "=========================================="
echo -e "${GREEN}Done!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. In noosphere-agent-js, rebuild Docker image:"
echo "     docker compose -f docker/docker-compose.yml build --no-cache agent"
echo ""
