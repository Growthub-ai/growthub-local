#!/usr/bin/env bash
set -euo pipefail

# Clone and set up OpenMontage for local-fork execution mode.
# Usage: bash setup/clone-fork.sh [target-dir]

TARGET_DIR="${1:-${OPENMONTAGE_PATH:-$HOME/OpenMontage}}"

echo "=== OpenMontage Fork Setup ==="
echo "Target directory: $TARGET_DIR"
echo ""

# ── Step 1: Clone ──
if [ -d "$TARGET_DIR/.git" ]; then
  echo "[skip] Repository already exists at $TARGET_DIR"
  echo "       To update: cd $TARGET_DIR && git pull"
else
  echo "[clone] Cloning OpenMontage..."
  git clone https://github.com/calesthio/OpenMontage.git "$TARGET_DIR"
  echo "[done] Cloned to $TARGET_DIR"
fi

# ── Step 2: Install dependencies ──
echo ""
echo "[setup] Running make setup..."
cd "$TARGET_DIR"

if [ -f Makefile ]; then
  make setup
else
  echo "[fallback] No Makefile found. Running manual setup..."
  pip install -r requirements.txt
  cd remotion-composer && npm install && cd ..
  pip install piper-tts
  cp -n .env.example .env 2>/dev/null || true
fi

# ── Step 3: Verify ──
echo ""
echo "[verify] Checking tool registry..."
python3 -c "from tools.tool_registry import registry; registry.discover(); print('Tool registry: OK')" 2>/dev/null || {
  echo "[warn] Tool registry check failed. This may be normal on first setup."
  echo "       Try: cd $TARGET_DIR && python3 -c \"from tools.tool_registry import registry; registry.discover()\""
}

echo ""
echo "=== Setup Complete ==="
echo "OpenMontage is ready at: $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. Add API keys to $TARGET_DIR/.env (optional — more keys = more tools)"
echo "  2. Point your agent Working Directory at this kit folder"
echo "  3. Start a session — the operator will detect the local fork automatically"
