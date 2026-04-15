#!/usr/bin/env bash
# check-deps.sh — Verify dependencies for Postiz local-fork workflows
set -e

echo "=== Growthub Postiz Social Studio — Dependency Check ==="
echo ""

MISS=0

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "OK   $1 ($(command -v "$1"))"
  else
    echo "MISS $1 — $2"
    MISS=1
  fi
}

check_cmd node "Install Node.js 22.x (Postiz engines: >=22.12 <23) — https://nodejs.org"
check_cmd pnpm "Run: corepack enable && corepack prepare pnpm@10.6.1 --activate"
check_cmd git "Install git — https://git-scm.com/downloads"

if command -v docker >/dev/null 2>&1; then
  echo "OK   docker (optional — useful for Redis/Postgres via compose)"
else
  echo "WARN docker not found — you can still run Postiz with local Postgres + Redis per docs"
fi

FORK_DIR="${POSTIZ_FORK_PATH:-$HOME/postiz-app}"
if [ -d "$FORK_DIR" ] && [ -f "$FORK_DIR/package.json" ]; then
  echo "OK   Postiz fork at $FORK_DIR"
else
  echo "MISS Postiz fork not found at $FORK_DIR — run: bash setup/clone-fork.sh"
  MISS=1
fi

echo ""
if [ "$MISS" -eq 0 ]; then
  echo "All required CLI tools present. Configure .env in the fork per Postiz quickstart before dev."
else
  echo "Resolve missing items before local-fork dev workflows."
  exit 1
fi
