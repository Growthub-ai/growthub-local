#!/usr/bin/env bash
# clone-fork.sh — Clone and boot the Open Higgsfield AI local fork
# Run from any location. Installs to ~/open-higgsfield-ai and starts dev server on port 3001.
set -e

FORK_DIR="$HOME/open-higgsfield-ai"
REPO_URL="https://github.com/Anil-matcha/Open-Higgsfield-AI"
PORT=3001

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning Open Higgsfield AI → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
fi

cd "$FORK_DIR"

echo "Installing dependencies..."
npm install

echo ""
echo "Starting dev server on http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo ""
npm run dev -- --port "$PORT"
