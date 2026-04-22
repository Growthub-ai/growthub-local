#!/usr/bin/env bash
# clone-fork.sh — Clone the Twenty CRM repo and boot the local development environment
# Usage: bash setup/clone-fork.sh
# Requires: git, node, npm, docker, docker-compose
set -e

FORK_DIR="${TWENTY_HOME:-${TWENTY_FORK_PATH:-$HOME/twenty}}"
REPO_URL="https://github.com/twentyhq/twenty"

echo "=== Growthub Twenty CRM Studio — Fork Setup ==="
echo ""

# Dependency checks
for cmd in git node npm docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd is required but not found."
    echo "Install it before running this script."
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running."
  echo "Start Docker Desktop or the Docker service before running this script."
  exit 1
fi

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning Twenty CRM → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
  echo "Clone complete."
fi

cd "$FORK_DIR"

echo ""
echo "Copying environment config..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Copied .env.example → .env"
    echo "Review .env and set any required values before starting."
  else
    echo "WARNING: .env.example not found — you may need to configure .env manually."
  fi
else
  echo ".env already exists — skipping copy."
fi

echo ""
echo "Starting Twenty via Docker Compose..."
echo "This pulls images for PostgreSQL, Redis, the Twenty server, and frontend."
echo "First run may take several minutes."
echo ""

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d
else
  docker compose up -d
fi

echo ""
echo "=== Twenty CRM is starting ==="
echo ""
echo "Frontend will be available at: http://localhost:3001"
echo "Server API will be available at: http://localhost:3000"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:3001 and create your workspace."
echo "  2. Go to Settings > API > Tokens and generate an API token."
echo "  3. Set TWENTY_API_TOKEN and TWENTY_API_URL=http://localhost:3000 in your kit .env file."
echo "  4. Run: node setup/verify-env.mjs"
echo ""
echo "To stop Twenty: docker-compose down (or docker compose down)"
