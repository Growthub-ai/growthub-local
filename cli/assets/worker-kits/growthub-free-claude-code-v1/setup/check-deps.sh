#!/usr/bin/env bash
# check-deps.sh — Verify all dependencies for the Free Claude Code Proxy kit.
set -e

echo "=== Free Claude Code Proxy — Dependency Check ==="
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

check_python_version() {
  if ! command -v python3 &>/dev/null; then
    echo "  MISS Python 3.14+ — install from https://www.python.org/downloads/"
    OK=1
    return
  fi
  local version
  version="$(python3 --version 2>&1 | awk '{print $2}')"
  local major minor
  major="$(echo "$version" | cut -d. -f1)"
  minor="$(echo "$version" | cut -d. -f2)"
  if [ "$major" -gt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -ge 14 ]; }; then
    echo "  OK   Python $version"
  else
    echo "  WARN Python $version — upstream targets 3.14+"
    OK=1
  fi
}

check_python_version
check_cmd "uv"   "uv package manager" "pip install uv"
check_cmd "git"  "git"                "https://git-scm.com/"
check_cmd "curl" "curl"               "Package manager of your OS"
check_cmd "lsof" "lsof (used for port probes)" "Package manager of your OS"

echo ""
echo "Optional — recommended for the Claude Code handoff:"
check_cmd "claude" "Claude Code CLI" "npm install -g @anthropic-ai/claude-code"

echo ""
echo "Optional — local inference backends (at least one provider must be configured):"
check_cmd "ollama" "Ollama (for llama.cpp-compatible endpoints)" "https://ollama.com"

echo ""
if [ "$OK" -eq 0 ]; then
  echo "All required dependencies are present."
else
  echo "Some dependencies are missing or outdated. Fix them before running clone-fork.sh."
  exit 1
fi
