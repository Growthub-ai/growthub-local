#!/usr/bin/env bash
# check-deps.sh — Verify all dependencies for the AI Website Cloner
set -e

echo "=== AI Website Cloner — Dependency Check ==="
echo ""

OK=0

check_cmd() {
  local cmd="$1"
  local label="$2"
  local hint="$3"
  if command -v "$cmd" &>/dev/null; then
    echo "  OK   $label ($cmd: $(command -v "$cmd"))"
  else
    echo "  MISS $label — $hint"
    OK=1
  fi
}

check_version() {
  local cmd="$1"
  local label="$2"
  local min_major="$3"
  local hint="$4"
  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>&1 | head -1)
    echo "  OK   $label ($version)"
  else
    echo "  MISS $label (required: $min_major+) — $hint"
    OK=1
  fi
}

check_version "node" "Node.js 24+" "24" "https://nodejs.org/"
check_cmd "npm" "npm" "Included with Node.js"
check_cmd "git" "git" "https://git-scm.com/"

echo ""
echo "Optional — recommended for Chrome/screenshot automation:"
check_cmd "claude" "Claude Code" "npm install -g @anthropic-ai/claude-code"

echo ""
if [ "$OK" -eq 0 ]; then
  echo "All required dependencies are present."
else
  echo "Some dependencies are missing. Install them before running the fork setup."
fi
