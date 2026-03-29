#!/usr/bin/env bash
set -euo pipefail

# Release script for growthub-local OSS packages
# Usage: ./scripts/release.sh stable [--skip-verify] [--dry-run] [--date YYYY-MM-DD]

cd "$(dirname "$0")/.."

DRY_RUN=false
SKIP_VERIFY=false
STABLE_DATE=""
MODE="${1:-stable}"

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=true
      shift
      ;;
    --date)
      STABLE_DATE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Read versions from package.json files
CLI_VERSION=$(jq -r '.version' cli/package.json)
CREATE_VERSION=$(jq -r '.version' packages/create-growthub-local/package.json)

echo "=== Growthub Local Release ==="
echo "Mode: $MODE"
echo "CLI version: $CLI_VERSION"
echo "create-growthub-local version: $CREATE_VERSION"
echo "Dry run: $DRY_RUN"
echo ""

# Verify build artifacts exist
if [ ! -f "cli/dist/index.js" ]; then
  echo "❌ cli/dist/index.js not found"
  exit 1
fi

if [ ! -f "packages/create-growthub-local/bin/create-growthub-local.mjs" ]; then
  echo "❌ packages/create-growthub-local/bin/create-growthub-local.mjs not found"
  exit 1
fi

echo "✓ Build artifacts verified"
echo ""

# Prepare npm authentication
if [ -z "${NPM_TOKEN:-}" ]; then
  echo "❌ NPM_TOKEN environment variable not set"
  exit 1
fi

# Create .npmrc with token
cat > ~/.npmrc <<EOF
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
EOF
chmod 600 ~/.npmrc

# Test authentication
if ! npm whoami >/dev/null 2>&1; then
  echo "❌ npm authentication failed (npm whoami returned non-zero)"
  rm -f ~/.npmrc
  exit 1
fi

NPM_USER=$(npm whoami)
echo "✓ Authenticated as npm user: $NPM_USER"
echo ""

# Tag the release
GIT_TAG="v${CLI_VERSION}"
if git rev-parse "$GIT_TAG" >/dev/null 2>&1; then
  echo "Tag $GIT_TAG already exists, skipping tag creation"
else
  echo "Creating tag: $GIT_TAG"
  git tag -a "$GIT_TAG" -m "Release v${CLI_VERSION}"
fi

echo ""
echo "=== Publishing to npm ==="

# Publish CLI
echo "Publishing @growthub/cli@${CLI_VERSION}..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] npm publish cli/ --access public --provenance"
else
  npm publish cli/ --access public --provenance
  echo "✓ @growthub/cli@${CLI_VERSION} published"
fi

echo ""

# Publish create-growthub-local
echo "Publishing create-growthub-local@${CREATE_VERSION}..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] npm publish packages/create-growthub-local/ --access public --provenance"
else
  npm publish packages/create-growthub-local/ --access public --provenance
  echo "✓ create-growthub-local@${CREATE_VERSION} published"
fi

echo ""
echo "=== Release Complete ==="
echo "CLI: @growthub/cli@${CLI_VERSION}"
echo "Installer: create-growthub-local@${CREATE_VERSION}"

# Cleanup
rm -f ~/.npmrc
