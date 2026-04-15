#!/usr/bin/env bash
# check-deps.sh — Verify system dependencies for the Postiz Social Media Studio
# Usage: bash setup/check-deps.sh
set -e

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

PASS=0
FAIL=0
WARN=0

ok() {
  echo -e "  ${GREEN}✓${RESET}  $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}✗${RESET}  $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "  ${YELLOW}⚠${RESET}  $1"
  WARN=$((WARN + 1))
}

echo "=== Growthub Postiz Social Media Studio — Dependency Check ==="
echo ""

# --- Node.js ---
if command -v node &>/dev/null; then
  NODE_VER=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "node v${NODE_VER} (18+ required)"
  else
    fail "node v${NODE_VER} — version 18+ required. Install from https://nodejs.org"
  fi
else
  fail "node — not found. Install from https://nodejs.org"
fi

# --- npm ---
if command -v npm &>/dev/null; then
  ok "npm $(npm --version)"
else
  warn "npm — not found. Usually installed with Node.js."
fi

# --- pnpm (used by Postiz monorepo) ---
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm --version)"
else
  warn "pnpm — not found. Required if building Postiz from source. Install: npm install -g pnpm"
fi

# --- Docker ---
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version | awk '{print $3}' | sed 's/,//')
  ok "docker $DOCKER_VER"
  # Check Docker daemon is running
  if docker info &>/dev/null 2>&1; then
    ok "docker daemon is running"
  else
    fail "docker daemon is not running. Start Docker Desktop or: sudo systemctl start docker"
  fi
else
  fail "docker — not found. Install from https://docker.com"
fi

# --- Docker Compose ---
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "unknown")
  ok "docker compose $COMPOSE_VER"
elif command -v docker-compose &>/dev/null; then
  warn "docker-compose (standalone) found. Prefer Docker Compose V2 plugin (docker compose)."
else
  fail "docker compose — not found. Install Docker Desktop or the Docker Compose plugin."
fi

# --- Git ---
if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  fail "git — not found. Install from https://git-scm.com/downloads"
fi

# --- curl ---
if command -v curl &>/dev/null; then
  ok "curl $(curl --version | head -1 | awk '{print $2}')"
else
  warn "curl — not found. Used for API healthchecks."
fi

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "  Passed:   $PASS"
if [ "$WARN" -gt 0 ]; then
  echo -e "  ${YELLOW}Warnings: $WARN${RESET}"
fi
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed:   $FAIL${RESET}"
  echo ""
  echo "Install missing dependencies and re-run this script."
  exit 1
else
  echo ""
  if [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}Dependencies OK with warnings. Local-fork mode may need attention.${RESET}"
  else
    echo -e "${GREEN}All dependencies satisfied.${RESET}"
  fi
fi
