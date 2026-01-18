#!/bin/bash
# =============================================================================
# Publish SDK Packages to npm Registry
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGES=("contracts" "crypto" "registry" "payload" "agent-core")

# Options
DRY_RUN=false
VERSION_BUMP=""
CUSTOM_VERSION=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Help
# =============================================================================
show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Publish @noosphere/* SDK packages to npm registry.

OPTIONS:
    -h, --help          Show this help message
    -n, --dry-run       Preview without publishing

VERSION BUMP (choose one):
    -p, --patch         Bump patch version (0.1.0 → 0.1.1)
    -m, --minor         Bump minor version (0.1.0 → 0.2.0)
    -M, --major         Bump major version (0.1.0 → 1.0.0)
    --prerelease TAG    Bump prerelease (0.1.0-alpha.1 → 0.1.0-alpha.2)
    -v, --version VER   Set specific version (e.g., 0.1.0-beta.1)

EXAMPLES:
    # Dry run (preview changes)
    $(basename "$0") --dry-run --patch

    # Bump patch version and publish
    $(basename "$0") --patch

    # Bump prerelease (alpha.13 → alpha.14)
    $(basename "$0") --prerelease alpha

    # Set specific version
    $(basename "$0") --version 0.2.0-beta.1

    # Publish current versions (no bump)
    $(basename "$0")

PREREQUISITES:
    - npm login (run 'npm login' first)
    - Clean working directory recommended

PACKAGES (in order):
    1. @noosphere/contracts
    2. @noosphere/crypto
    3. @noosphere/registry
    4. @noosphere/payload
    5. @noosphere/agent-core

EOF
    exit 0
}

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -p|--patch)
            VERSION_BUMP="patch"
            shift
            ;;
        -m|--minor)
            VERSION_BUMP="minor"
            shift
            ;;
        -M|--major)
            VERSION_BUMP="major"
            shift
            ;;
        --prerelease)
            VERSION_BUMP="prerelease"
            PRERELEASE_TAG="${2:-alpha}"
            shift 2
            ;;
        -v|--version)
            CUSTOM_VERSION="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# =============================================================================
# Version Bump Function
# =============================================================================
bump_version() {
    local current_version="$1"
    local bump_type="$2"

    case $bump_type in
        patch)
            # 0.1.0 → 0.1.1 or 0.1.0-alpha.1 → 0.1.1
            echo "$current_version" | awk -F. '{
                if (NF == 3) {
                    split($3, a, "-");
                    print $1"."$2"."(a[1]+1)
                } else {
                    print $1"."$2".1"
                }
            }'
            ;;
        minor)
            # 0.1.0 → 0.2.0
            echo "$current_version" | awk -F. '{print $1".("$2+1)".0"}'
            ;;
        major)
            # 0.1.0 → 1.0.0
            echo "$current_version" | awk -F. '{print ($1+1)".0.0"}'
            ;;
        prerelease)
            # 0.1.0-alpha.1 → 0.1.0-alpha.2
            if [[ "$current_version" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-([a-zA-Z]+)\.([0-9]+)$ ]]; then
                base="${BASH_REMATCH[1]}"
                tag="${BASH_REMATCH[2]}"
                num="${BASH_REMATCH[3]}"
                echo "${base}-${tag}.$((num + 1))"
            elif [[ "$current_version" =~ ^([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
                echo "${current_version}-${PRERELEASE_TAG}.1"
            else
                echo "${current_version}"
            fi
            ;;
        *)
            echo "$current_version"
            ;;
    esac
}

# =============================================================================
# Main
# =============================================================================
echo "=========================================="
echo "Publishing SDK to npm Registry"
echo "=========================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}[DRY RUN MODE] No changes will be made${NC}"
    echo ""
fi

if [ -n "$VERSION_BUMP" ]; then
    echo -e "${YELLOW}Version bump: ${VERSION_BUMP}${NC}"
    [ -n "$PRERELEASE_TAG" ] && echo -e "${YELLOW}Prerelease tag: ${PRERELEASE_TAG}${NC}"
    echo ""
elif [ -n "$CUSTOM_VERSION" ]; then
    echo -e "${YELLOW}Custom version: ${CUSTOM_VERSION}${NC}"
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
npm config set registry "https://registry.npmjs.org"

echo "SDK path: $SDK_ROOT"
echo ""

# =============================================================================
# Process Packages
# =============================================================================
echo "=========================================="
echo "Processing packages..."
echo "=========================================="

PUBLISHED=()
SKIPPED=()
FAILED=()

for pkg in "${PACKAGES[@]}"; do
    PKG_PATH="${SDK_ROOT}/packages/${pkg}"

    if [ ! -d "$PKG_PATH" ]; then
        echo -e "${YELLOW}Skipping ${pkg} (not found)${NC}"
        SKIPPED+=("@noosphere/${pkg}")
        continue
    fi

    echo ""
    echo -e "${YELLOW}@noosphere/${pkg}${NC}"

    cd "$PKG_PATH"

    # Get current version
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    echo "  Current: ${CURRENT_VERSION}"

    # Determine new version
    if [ -n "$CUSTOM_VERSION" ]; then
        NEW_VERSION="$CUSTOM_VERSION"
    elif [ -n "$VERSION_BUMP" ]; then
        NEW_VERSION=$(bump_version "$CURRENT_VERSION" "$VERSION_BUMP")
    else
        NEW_VERSION="$CURRENT_VERSION"
    fi

    if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
        echo -e "  New:     ${GREEN}${NEW_VERSION}${NC}"
    fi

    # Check if version already exists on npm
    EXISTING=$(npm view "@noosphere/${pkg}@${NEW_VERSION}" version 2>/dev/null || echo "")
    if [ "$EXISTING" = "$NEW_VERSION" ]; then
        echo -e "  ${BLUE}Version ${NEW_VERSION} already published, skipping${NC}"
        SKIPPED+=("@noosphere/${pkg}@${NEW_VERSION}")
        continue
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${BLUE}[DRY RUN] Would update version and publish${NC}"
        PUBLISHED+=("@noosphere/${pkg}@${NEW_VERSION}")
        continue
    fi

    # Update version in package.json
    if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
        echo "  Updating version..."
        npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
    fi

    # Build
    if grep -q '"build"' package.json; then
        echo "  Building..."
        npm run build
    fi

    # Publish
    echo "  Publishing..."
    if npm publish --access public 2>&1 | sed 's/^/    /'; then
        echo -e "  ${GREEN}✓ Published @noosphere/${pkg}@${NEW_VERSION}${NC}"
        PUBLISHED+=("@noosphere/${pkg}@${NEW_VERSION}")
    else
        echo -e "  ${RED}✗ Failed to publish${NC}"
        FAILED+=("@noosphere/${pkg}@${NEW_VERSION}")
    fi
done

# =============================================================================
# Summary
# =============================================================================
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
        echo "  ✓ $pkg"
    done
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Skipped:${NC}"
    for pkg in "${SKIPPED[@]}"; do
        echo "  - $pkg"
    done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed:${NC}"
    for pkg in "${FAILED[@]}"; do
        echo "  ✗ $pkg"
    done
    exit 1
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}Dry run complete. Run without --dry-run to publish.${NC}"
else
    echo -e "${GREEN}Done!${NC}"
    if [ ${#PUBLISHED[@]} -gt 0 ] && [ -n "$VERSION_BUMP" -o -n "$CUSTOM_VERSION" ]; then
        echo ""
        echo -e "${YELLOW}Don't forget to commit the version changes:${NC}"
        echo "  git add packages/*/package.json"
        echo "  git commit -m \"chore: Bump versions to ${NEW_VERSION}\""
    fi
fi
echo ""
