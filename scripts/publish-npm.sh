#!/bin/bash
# =============================================================================
# Publish SDK Packages to npm Registry
# =============================================================================
#
# This script publishes @noosphere/* packages to the public npm registry.
#
# Prerequisites:
#   - npm login (run 'npm login' first if not authenticated)
#   - Packages must be built and ready to publish
#
# Usage:
#   ./scripts/publish-npm.sh           # Publish all packages
#   ./scripts/publish-npm.sh --dry-run # Preview without publishing
#
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGES=("contracts" "crypto" "registry" "agent-core")
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Publishing SDK to npm Registry"
echo "=========================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}[DRY RUN MODE] No packages will be published${NC}"
    echo ""
fi

# Check npm authentication
echo -e "${YELLOW}Checking npm authentication...${NC}"
NPM_USER=$(npm whoami 2>/dev/null || echo "")
if [ -z "$NPM_USER" ]; then
    echo -e "${RED}Error: Not logged in to npm${NC}"
    echo ""
    echo "Please run 'npm login' first"
    exit 1
fi
echo -e "${GREEN}Logged in as: ${NPM_USER}${NC}"
echo ""

# Ensure we're using the public registry
echo -e "${YELLOW}Setting npm registry to public...${NC}"
npm config set registry "https://registry.npmjs.org"
echo ""

echo "SDK path: $SDK_ROOT"
echo ""

# Publish each package
echo "=========================================="
echo "Publishing packages..."
echo "=========================================="

PUBLISHED=()
FAILED=()

for pkg in "${PACKAGES[@]}"; do
    PKG_PATH="${SDK_ROOT}/packages/${pkg}"

    if [ ! -d "$PKG_PATH" ]; then
        echo -e "${YELLOW}Skipping ${pkg} (not found)${NC}"
        continue
    fi

    echo ""
    echo -e "${YELLOW}Processing @noosphere/${pkg}...${NC}"

    cd "$PKG_PATH"

    # Get current version
    VERSION=$(node -p "require('./package.json').version")
    echo "  Version: ${VERSION}"

    # Check if version already exists on npm
    EXISTING=$(npm view "@noosphere/${pkg}@${VERSION}" version 2>/dev/null || echo "")
    if [ "$EXISTING" = "$VERSION" ]; then
        echo -e "  ${BLUE}Version ${VERSION} already published, skipping${NC}"
        continue
    fi

    # Build
    if grep -q '"build"' package.json; then
        echo "  Building..."
        npm run build
    fi

    # Publish
    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${BLUE}[DRY RUN] Would publish @noosphere/${pkg}@${VERSION}${NC}"
        npm publish --dry-run 2>&1 | sed 's/^/  /'
        PUBLISHED+=("@noosphere/${pkg}@${VERSION}")
    else
        echo "  Publishing..."
        if npm publish --access public 2>&1 | sed 's/^/  /'; then
            echo -e "  ${GREEN}✓ Published @noosphere/${pkg}@${VERSION}${NC}"
            PUBLISHED+=("@noosphere/${pkg}@${VERSION}")
        else
            echo -e "  ${RED}✗ Failed to publish @noosphere/${pkg}@${VERSION}${NC}"
            FAILED+=("@noosphere/${pkg}@${VERSION}")
        fi
    fi
done

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

if [ ${#PUBLISHED[@]} -gt 0 ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}Would publish:${NC}"
    else
        echo -e "${GREEN}Published:${NC}"
    fi
    for pkg in "${PUBLISHED[@]}"; do
        echo "  - $pkg"
    done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed:${NC}"
    for pkg in "${FAILED[@]}"; do
        echo "  - $pkg"
    done
    exit 1
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}Dry run complete. Run without --dry-run to publish.${NC}"
else
    echo -e "${GREEN}Done!${NC}"
fi
echo ""
