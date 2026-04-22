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
API_CONTRACT_VERSION=$(jq -r '.version' packages/api-contract/package.json)

echo "=== Growthub Local Release ==="
echo "Mode: $MODE"
echo "CLI version: $CLI_VERSION"
echo "@growthub/create-growthub-local version: $CREATE_VERSION"
echo "@growthub/api-contract version: $API_CONTRACT_VERSION"
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

if [ ! -f "packages/api-contract/dist/index.js" ]; then
  echo "❌ packages/api-contract/dist/index.js not found"
  exit 1
fi

echo "✓ Build artifacts verified"
echo ""

# Prepare npm authentication (skip in dry-run mode)
if [ "$DRY_RUN" = false ]; then
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
  echo "Testing npm authentication..."
  WHOAMI_OUTPUT=$(npm whoami 2>&1)
  WHOAMI_EXIT=$?
  if [ $WHOAMI_EXIT -ne 0 ]; then
    echo "❌ npm authentication failed"
    echo "Error output: $WHOAMI_OUTPUT"
    rm -f ~/.npmrc
    exit 1
  fi

  echo "✓ Authenticated as npm user: $WHOAMI_OUTPUT"
  echo ""
fi

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

# Build publish args (include provenance in GitHub Actions)
PUBLISH_ARGS="--access public"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  PUBLISH_ARGS="$PUBLISH_ARGS --provenance"
fi

# npm requires explicit tags for prerelease versions (e.g. 1.0.0-alpha.1)
API_CONTRACT_TAG="latest"
if [[ "$API_CONTRACT_VERSION" == *-* ]]; then
  API_CONTRACT_TAG="${API_CONTRACT_VERSION#*-}"
  API_CONTRACT_TAG="${API_CONTRACT_TAG%%.*}"
fi

# Publish CLI
echo "Publishing @growthub/cli@${CLI_VERSION}..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] npm publish cli/ $PUBLISH_ARGS"
else
  npm publish cli/ $PUBLISH_ARGS
  echo "✓ @growthub/cli@${CLI_VERSION} published"
fi

echo ""

# Publish create-growthub-local
echo "Publishing @growthub/create-growthub-local@${CREATE_VERSION}..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] npm publish packages/create-growthub-local/ $PUBLISH_ARGS"
else
  npm publish packages/create-growthub-local/ $PUBLISH_ARGS
  echo "✓ @growthub/create-growthub-local@${CREATE_VERSION} published"
fi

echo ""
# Publish api-contract
echo "Publishing @growthub/api-contract@${API_CONTRACT_VERSION}..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] npm publish packages/api-contract/ $PUBLISH_ARGS --tag $API_CONTRACT_TAG"
else
  npm publish packages/api-contract/ $PUBLISH_ARGS --tag "$API_CONTRACT_TAG"
  echo "✓ @growthub/api-contract@${API_CONTRACT_VERSION} published"
fi

echo ""
echo "=== Release Complete ==="
echo "CLI: @growthub/cli@${CLI_VERSION}"
echo "Installer: @growthub/create-growthub-local@${CREATE_VERSION}"
echo "API contract: @growthub/api-contract@${API_CONTRACT_VERSION}"

# Cleanup
rm -f ~/.npmrc
