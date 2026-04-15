#!/usr/bin/env bash
# check-deps.sh — Verify local dependencies required for Twenty CRM local-fork and self-hosted workflows.
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

check_docker_running() {
  if docker info >/dev/null 2>&1; then
    echo "OK   Docker daemon (running)"
    PASS=$((PASS + 1))
  else
    echo "MISSING  Docker daemon — start Docker Desktop or the Docker service"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Growthub Twenty CRM — Dependency Check ==="
echo ""
check "git"    "git"    "https://git-scm.com/downloads"
check "node"   "node"   "https://nodejs.org (v18+ required)"
check "npm"    "npm"    "Comes with Node.js"
check "docker" "docker" "https://docs.docker.com/get-docker/"
echo ""

if command -v docker >/dev/null 2>&1; then
  check_docker_running
fi

echo ""
echo "Passed: $PASS  |  Missing: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Install missing tools before running local-fork workflows."
  echo "Agent-only mode does not require Docker or a local fork."
  exit 1
fi

echo ""
echo "All dependencies present."
echo "You are ready for local-fork execution. Run: bash setup/clone-fork.sh"
