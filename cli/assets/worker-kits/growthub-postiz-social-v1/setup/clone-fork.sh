#!/usr/bin/env bash
# clone-fork.sh — Clone Postiz and start the local workspace via Docker Compose
# Usage: bash setup/clone-fork.sh
set -e

FORK_DIR="${POSTIZ_HOME:-${POSTIZ_FORK_PATH:-$HOME/postiz-app}}"
REPO_URL="https://github.com/gitroomhq/postiz-app"

echo "=== Growthub Postiz Social Media Studio — Fork Setup ==="
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
echo "Checking for .env configuration..."
if [ ! -f "$FORK_DIR/.env" ]; then
  if [ -f "$FORK_DIR/.env.example" ]; then
    cp "$FORK_DIR/.env.example" "$FORK_DIR/.env"
    echo "Copied .env.example to .env — edit $FORK_DIR/.env with your credentials before starting services."
    echo ""
    echo "  Minimum required values in $FORK_DIR/.env:"
    echo "    DATABASE_URL=..."
    echo "    REDIS_URL=..."
    echo "    JWT_SECRET=..."
    echo "    NEXTAUTH_SECRET=..."
    echo ""
    echo "  Then re-run this script to start the services."
    exit 0
  else
    echo "WARNING: No .env.example found in the Postiz repo. Create $FORK_DIR/.env manually."
    echo "See https://docs.postiz.com/configuration/environment-variables for required variables."
    exit 1
  fi
fi

echo ""
echo "Starting Postiz services via Docker Compose..."
cd "$FORK_DIR"
docker compose up -d

echo ""
echo "Waiting for Postiz API to become healthy..."
MAX_WAIT=60
WAITED=0
while [ "$WAITED" -lt "$MAX_WAIT" ]; do
  if curl -s http://localhost:3000/api/healthcheck > /dev/null 2>&1; then
    echo "Postiz API is healthy."
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo "  Waiting... (${WAITED}s elapsed)"
done

if [ "$WAITED" -ge "$MAX_WAIT" ]; then
  echo ""
  echo "WARNING: Postiz API did not become healthy within ${MAX_WAIT}s."
  echo "Check docker logs: docker compose logs -f postiz"
  echo "The services may still be starting — try again in 30 seconds."
  exit 1
fi

echo ""
echo "=== Postiz workspace is ready ==="
echo ""
echo "  Admin UI:  http://localhost:3000"
echo "  API:       http://localhost:3000/api"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:3000 and complete the initial setup wizard"
echo "  2. Connect your social media accounts in Settings > Integrations"
echo "  3. Copy your Workspace ID from Settings > Workspace"
echo "  4. Set POSTIZ_WORKSPACE_ID in this kit's .env file"
echo "  5. Run: node setup/verify-env.mjs"
echo ""
echo "To stop Postiz: docker compose stop (from $FORK_DIR)"
