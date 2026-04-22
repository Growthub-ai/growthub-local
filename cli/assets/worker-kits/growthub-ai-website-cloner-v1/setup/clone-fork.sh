#!/usr/bin/env bash
# clone-fork.sh — Clone and boot the ai-website-cloner-template fork
# Run from any location. Installs to ~/ai-website-cloner-template (or AI_CLONER_FORK_PATH).
set -e

FORK_DIR="${AI_WEBSITE_CLONER_HOME:-${AI_CLONER_FORK_PATH:-$HOME/ai-website-cloner-template}}"
REPO_URL="https://github.com/JCodesMore/ai-website-cloner-template.git"

echo "=== Growthub AI Website Cloner — Fork Setup ==="
echo ""

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning ai-website-cloner-template → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
  echo "Clone complete."
fi

echo ""
echo "Installing dependencies..."
cd "$FORK_DIR"
npm install
echo "Dependencies installed."

echo ""
echo "Checking Node.js version..."
NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
  echo "WARNING: Node.js $NODE_VERSION detected. Node.js 24+ is required."
  echo "Visit https://nodejs.org/ to upgrade, or use nvm: nvm use 24"
else
  echo "Node.js $(node --version) — OK"
fi

echo ""
echo "Verifying fork structure..."
STRUCTURE_OK=0
for item in src/app src/components src/lib package.json next.config.ts; do
  if [ -e "$FORK_DIR/$item" ]; then
    echo "  OK   $item"
  else
    echo "  MISS $item"
    STRUCTURE_OK=1
  fi
done

echo ""
if [ "$STRUCTURE_OK" -eq 0 ]; then
  echo "Fork is ready at $FORK_DIR"
  echo ""
  echo "Next steps:"
  echo "  1. Point your AI agent at the Growthub kit directory (this folder)"
  echo "  2. Start Claude Code with: claude --chrome"
  echo "  3. Run the clone skill: /clone-website <target-url>"
  echo ""
  echo "Dev server (after cloning a site):"
  echo "  cd $FORK_DIR && npm run dev"
else
  echo "Fork cloned at $FORK_DIR — some expected files may differ in this version."
  echo "Check the fork's README for the current structure."
fi

echo ""
echo "Fork location: $FORK_DIR"
