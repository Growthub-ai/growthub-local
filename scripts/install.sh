#!/usr/bin/env bash
# scripts/install.sh
# Power-user installer for Growthub Local.
#
# Usage (curl | bash):
#   curl -fsSL https://raw.githubusercontent.com/Growthub-ai/growthub-local/main/scripts/install.sh | bash
#
# Or with profile:
#   curl -fsSL .../install.sh | bash -s -- --profile self-improving --out ./my-workspace
#
# This script is a thin wrapper over `npm create @growthub/growthub-local@latest`.
# It does not introduce a second install system.

set -euo pipefail

PROFILE=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --out)     OUT="$2";     shift 2 ;;
    -h|--help)
      echo "Usage: bash install.sh [--profile self-improving|workspace|dx|gtm] [--out <path>]"
      echo ""
      echo "Examples:"
      echo "  bash install.sh"
      echo "  bash install.sh --profile self-improving --out ./my-workspace"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Detect npm/npx
if ! command -v npx &>/dev/null; then
  echo "ERROR: npx not found. Install Node.js >= 20: https://nodejs.org" >&2
  exit 1
fi

NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [[ "$NODE_VER" -lt 20 ]]; then
  echo "ERROR: Node.js >= 20 required (found: $(node --version 2>/dev/null || echo 'none'))." >&2
  exit 1
fi

echo ""
echo "Installing Growthub Local..."
echo ""

ARGS=()
[[ -n "$PROFILE" ]] && ARGS+=("--profile" "$PROFILE")
[[ -n "$OUT"     ]] && ARGS+=("--out" "$OUT")

npx --yes "@growthub/create-growthub-local@latest" "${ARGS[@]}"
