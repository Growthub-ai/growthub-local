#!/usr/bin/env bash
# check-deps.sh — Verify local dependencies required for local-fork Postiz deployment.
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

echo "=== Growthub Postiz Social Scheduler — Dependency Check ==="
echo ""
check "git"             "git"             "https://git-scm.com/downloads"
check "node"            "node"            "https://nodejs.org"
check "npm"             "npm"             "Comes with Node.js"
check "docker"          "docker"          "https://docs.docker.com/get-docker/"

# Check for docker compose (v2 plugin or standalone v1)
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "OK   docker-compose (docker compose v2 plugin)"
  PASS=$((PASS + 1))
elif command -v docker-compose >/dev/null 2>&1; then
  echo "OK   docker-compose ($(command -v docker-compose))"
  PASS=$((PASS + 1))
else
  echo "MISSING  docker-compose — https://docs.docker.com/compose/install/"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Passed: $PASS  |  Missing: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Install missing tools before running local-fork Postiz deployment."
  exit 1
fi

echo "All dependencies present. You are ready for local-fork execution."
