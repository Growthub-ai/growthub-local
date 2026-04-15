#!/usr/bin/env bash
# clone-fork.sh — Clone Postiz (postiz-app) and install workspace dependencies
# Usage: bash setup/clone-fork.sh
set -e

FORK_DIR="${POSTIZ_FORK_PATH:-$HOME/postiz-app}"
REPO_URL="https://github.com/gitroomhq/postiz-app"

echo "=== Growthub Postiz Social Studio — Fork Setup ==="
echo ""

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning Postiz → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
  echo "Clone complete."
fi

echo ""
echo "Installing dependencies with pnpm (Postiz uses pnpm workspaces)..."
cd "$FORK_DIR"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install Corepack and enable pnpm, for example:"
  echo "  corepack enable && corepack prepare pnpm@10.6.1 --activate"
  exit 1
fi

pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo "pnpm install complete."

echo ""
echo "Prisma client generate (postinstall may have run this already)..."
pnpm run prisma-generate 2>/dev/null || true

echo ""
echo "Postiz source is ready at $FORK_DIR"
echo "Follow https://docs.postiz.com/quickstart for database, Redis, and env configuration before pnpm run dev."
echo ""
echo "Quick orientation:"
echo "  ls $FORK_DIR/apps"
echo "  cat $FORK_DIR/package.json | head -n 40"
