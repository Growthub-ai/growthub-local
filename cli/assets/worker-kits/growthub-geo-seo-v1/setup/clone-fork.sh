#!/usr/bin/env bash
# clone-fork.sh — Clone geo-seo-claude and install dependencies
# Usage: bash setup/clone-fork.sh
set -e

FORK_DIR="${GEO_SEO_FORK_PATH:-$HOME/geo-seo-claude}"
REPO_URL="https://github.com/zubair-trabzada/geo-seo-claude"

echo "=== Growthub GEO SEO Studio — Fork Setup ==="
echo ""

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning geo-seo-claude → $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
  echo "Clone complete."
fi

echo ""
echo "Installing Python dependencies..."
cd "$FORK_DIR"
pip install -r requirements.txt
echo "Python dependencies installed."

echo ""
echo "Installing Playwright browsers..."
playwright install chromium
echo "Playwright chromium installed."

echo ""
echo "Verifying key scripts..."
SCRIPTS_OK=0
for script in fetch_page.py citability_scorer.py brand_scanner.py generate_pdf_report.py llmstxt_generator.py; do
  if [ -f "scripts/$script" ]; then
    echo "  OK   scripts/$script"
  else
    echo "  MISS scripts/$script — may not exist in this fork version"
    SCRIPTS_OK=1
  fi
done

echo ""
if [ "$SCRIPTS_OK" -eq 0 ]; then
  echo "geo-seo-claude is ready at $FORK_DIR"
else
  echo "geo-seo-claude cloned at $FORK_DIR — some scripts may be missing."
  echo "Check the fork's README for the correct script paths."
fi

echo ""
echo "Quick test:"
echo "  python $FORK_DIR/scripts/fetch_page.py https://example.com"
echo ""
echo "Run the GEO audit operator by pointing Claude Code at this kit."
