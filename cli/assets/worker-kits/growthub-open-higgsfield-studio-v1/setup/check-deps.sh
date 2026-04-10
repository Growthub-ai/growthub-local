#!/usr/bin/env bash
# check-deps.sh — Verify local dependencies required for local-fork and frame-analysis workflows.
# Run before your first local-fork session.
set -e

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  local install_hint="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "OK   $name ($(command -v "$cmd"))"
    PASS=$((PASS + 1))
  else
    echo "MISSING  $name — $install_hint"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Growthub Open Higgsfield — Dependency Check ==="
echo ""
check "git"    "git"    "https://git-scm.com/downloads"
check "node"   "node"   "https://nodejs.org"
check "npm"    "npm"    "Comes with Node.js"
check "ffmpeg" "ffmpeg" "brew install ffmpeg  OR  https://ffmpeg.org/download.html"
echo ""
echo "Passed: $PASS  |  Missing: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Install missing tools before running local-fork or frame-analysis workflows."
  exit 1
fi

echo "All dependencies present. You are ready for local-fork execution."
