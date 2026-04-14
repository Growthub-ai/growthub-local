#!/usr/bin/env bash
set -euo pipefail

# Check system dependencies for Open Montage Studio local-fork mode.
# Exit 0: all dependencies present.
# Exit 1: one or more dependencies missing.

echo "=== Open Montage Studio — Dependency Check ==="
echo ""

MISSING=0

check_dep() {
  local name="$1"
  local cmd="$2"
  local min_version="$3"
  local install_hint="$4"

  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>&1 | head -1)
    echo "  [ok] $name: $version"
  else
    echo "  [missing] $name — install: $install_hint"
    MISSING=$((MISSING + 1))
  fi
}

check_dep "Python 3.10+" "python3" "3.10" "python.org or brew install python"
check_dep "FFmpeg" "ffmpeg" "any" "brew install ffmpeg or ffmpeg.org"
check_dep "Node.js 18+" "node" "18" "nodejs.org or brew install node"
check_dep "npm" "npm" "any" "comes with Node.js"
check_dep "Git" "git" "any" "brew install git"

echo ""

if [ "$MISSING" -gt 0 ]; then
  echo "[result] $MISSING dependency(s) missing. Install them and rerun this check."
  exit 1
else
  echo "[result] All dependencies present."
  exit 0
fi
