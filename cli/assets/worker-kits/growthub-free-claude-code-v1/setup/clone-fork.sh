#!/usr/bin/env bash
# clone-fork.sh — Clone and install the free-claude-code FastAPI proxy fork.
# Run from any location. Installs to $FREE_CLAUDE_CODE_HOME (default $HOME/free-claude-code).
set -e

FORK_DIR="${FREE_CLAUDE_CODE_HOME:-$HOME/free-claude-code}"
REPO_URL="https://github.com/Alishahryar1/free-claude-code.git"
PROXY_PORT="${FREE_CLAUDE_CODE_PROXY_PORT:-8082}"

echo "=== Growthub Free Claude Code Proxy — Fork Setup ==="
echo ""

if [ -d "$FORK_DIR" ]; then
  echo "Fork already exists at $FORK_DIR — skipping clone."
  echo "To re-clone, remove the directory first: rm -rf $FORK_DIR"
else
  echo "Cloning free-claude-code -> $FORK_DIR"
  git clone "$REPO_URL" "$FORK_DIR"
  echo "Clone complete."
fi

echo ""
echo "Checking Python version..."
if command -v python3 &>/dev/null; then
  PY_VERSION="$(python3 --version 2>&1 | awk '{print $2}')"
  PY_MAJOR="$(echo "$PY_VERSION" | cut -d. -f1)"
  PY_MINOR="$(echo "$PY_VERSION" | cut -d. -f2)"
  if [ "$PY_MAJOR" -gt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 14 ]; }; then
    echo "  OK   Python $PY_VERSION"
  else
    echo "  WARN Python $PY_VERSION detected; upstream targets 3.14+."
    echo "       Install from https://www.python.org/downloads/ or: pyenv install 3.14.0"
  fi
else
  echo "  MISS python3 not found. Install Python 3.14+ before continuing."
  exit 1
fi

echo ""
echo "Checking uv..."
if ! command -v uv &>/dev/null; then
  echo "  MISS uv not found. Install with: pip install uv"
  exit 1
fi
echo "  OK   uv $(uv --version | awk '{print $2}')"

echo ""
echo "Preparing .env configuration..."
if [ ! -f "$FORK_DIR/.env" ]; then
  if [ -f "$FORK_DIR/.env.example" ]; then
    cp "$FORK_DIR/.env.example" "$FORK_DIR/.env"
    echo "  Copied .env.example -> .env"
  else
    echo "  WARN upstream .env.example not found; create $FORK_DIR/.env manually."
  fi
else
  echo "  .env already exists — leaving untouched."
fi

echo ""
echo "Running uv sync in $FORK_DIR..."
(cd "$FORK_DIR" && uv sync)
echo "  OK   dependencies resolved."

echo ""
echo "Verifying fork structure..."
STRUCTURE_OK=0
for item in server.py pyproject.toml uv.lock providers api config; do
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
  echo "  1. Edit $FORK_DIR/.env and add at least one provider key."
  echo "     - NVIDIA NIM     (free tier)  -> NVIDIA_NIM_API_KEY"
  echo "     - OpenRouter     (free/paid)  -> OPENROUTER_API_KEY"
  echo "     - DeepSeek       (usage)      -> DEEPSEEK_API_KEY"
  echo "     - LM Studio      (local)      -> LM_STUDIO_BASE_URL (default http://localhost:1234/v1)"
  echo "     - llama.cpp      (local)      -> LLAMACPP_BASE_URL (default http://localhost:8080/v1)"
  echo "  2. Run: node setup/verify-env.mjs"
  echo "  3. Start the proxy:"
  echo "       cd $FORK_DIR && uv run uvicorn server:app --host 127.0.0.1 --port $PROXY_PORT"
  echo "  4. In your Claude Code shell:"
  echo "       export ANTHROPIC_BASE_URL=\"http://127.0.0.1:$PROXY_PORT\""
  echo "       export ANTHROPIC_AUTH_TOKEN=\"freecc\""
  echo "       claude"
else
  echo "Fork cloned at $FORK_DIR, but some expected files are missing."
  echo "Check the fork's README for the current structure."
fi

echo ""
echo "Fork location: $FORK_DIR"
echo "Proxy port:    $PROXY_PORT"
