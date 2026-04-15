#!/usr/bin/env bash
# clone-fork.sh — Clone and boot the Postiz social media scheduler local fork
# Run from any location. Installs to ~/postiz-app and starts via Docker Compose.
set -e

FORK_DIR="$HOME/postiz-app"
REPO_URL="https://github.com/gitroomhq/postiz-app"
POSTIZ_PORT=5000

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning Postiz App → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
fi

cd "$FORK_DIR"

# Check for Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed."
  echo "Install Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! command -v docker compose >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "ERROR: Docker Compose is not available."
  echo "Install Docker Compose: https://docs.docker.com/compose/install/"
  exit 1
fi

# Copy environment template if .env does not exist
if [ ! -f "$FORK_DIR/.env" ]; then
  if [ -f "$FORK_DIR/.env.example" ]; then
    echo "Copying .env.example → .env"
    cp "$FORK_DIR/.env.example" "$FORK_DIR/.env"
    echo ""
    echo "IMPORTANT: Edit $FORK_DIR/.env and configure your settings before first use."
    echo "At minimum, set a secure JWT_SECRET and configure your database credentials."
  else
    echo "WARNING: No .env.example found in the Postiz repo."
    echo "Check the repo README for environment configuration instructions."
  fi
fi

echo ""
echo "Starting Postiz via Docker Compose..."
echo "This will start: Postiz app, PostgreSQL, and Redis"
echo ""

# Use docker compose (v2) or docker-compose (v1) depending on availability
if command -v docker compose >/dev/null 2>&1; then
  docker compose up -d
else
  docker-compose up -d
fi

echo ""
echo "Waiting for Postiz to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until curl -sf "http://localhost:$POSTIZ_PORT" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "WARNING: Postiz did not respond after ${MAX_ATTEMPTS} attempts."
    echo "Check logs: docker compose logs -f"
    echo "The instance may still be starting up."
    break
  fi
  sleep 2
done

if [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; then
  echo "Postiz is running at http://localhost:$POSTIZ_PORT"
fi

echo ""
echo "Next steps:"
echo "  1. Open http://localhost:$POSTIZ_PORT in your browser"
echo "  2. Create an account and connect your social media platforms"
echo "  3. Configure your API key in your kit .env file"
echo ""
echo "To stop: cd $FORK_DIR && docker compose down"
echo "To view logs: cd $FORK_DIR && docker compose logs -f"
echo ""
