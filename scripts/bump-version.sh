#!/bin/bash
# =============================================================================
# Bump SDK Package Versions
# =============================================================================
#
# Usage:
#   ./scripts/bump-version.sh <version>
#   Example: ./scripts/bump-version.sh 0.3.0-alpha.1
#
# =============================================================================

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 0.3.0-alpha.1"
  exit 1
fi

NEW_VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Bumping SDK versions to ${NEW_VERSION}"
echo "=========================================="
echo ""

# Packages to update (in dependency order)
PACKAGES=("contracts" "crypto" "payload" "registry" "agent-core" "sdk")

# Update root package.json
echo -e "${YELLOW}Updating root package.json...${NC}"
cd "$SDK_ROOT"
npm pkg set version="$NEW_VERSION"
echo -e "${GREEN}Done${NC}"

# Update each package
for pkg in "${PACKAGES[@]}"; do
  PKG_PATH="${SDK_ROOT}/packages/${pkg}"

  if [ ! -d "$PKG_PATH" ]; then
    continue
  fi

  echo -e "${YELLOW}Updating @noosphere/${pkg}...${NC}"
  cd "$PKG_PATH"

  # Update version
  npm pkg set version="$NEW_VERSION"

  # Update @noosphere/* dependencies if they exist (but not self-references)
  for dep in "${PACKAGES[@]}"; do
    # Skip if it's the same package (self-reference)
    if [ "$dep" = "$pkg" ]; then
      continue
    fi
    if grep -q "\"@noosphere/${dep}\"" package.json; then
      npm pkg set "dependencies.@noosphere/${dep}"="$NEW_VERSION" 2>/dev/null || true
    fi
  done

  echo -e "${GREEN}Done${NC}"
done

echo ""
echo "=========================================="
echo -e "${GREEN}All packages updated to ${NEW_VERSION}${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Run 'npm install' to update package-lock.json"
echo "  2. Run 'npm run build' to build all packages"
echo "  3. Run 'npm test' to verify tests pass"
echo ""
