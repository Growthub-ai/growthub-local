#!/usr/bin/env bash
# check-deps.sh — Verify dependencies for geo-seo-claude local-fork workflows
# Usage: bash setup/check-deps.sh
set -e

PASS=0
FAIL=0

check() {
  local name="$1" cmd="$2" hint="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "OK   $name ($(command -v $cmd))"
    PASS=$((PASS+1))
  else
    echo "MISS $name — $hint"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Growthub GEO SEO Studio — Dependency Check ==="
echo ""

check "python3"     "python3"     "https://python.org — install Python 3.8+"
check "pip"         "pip"         "Comes with Python — try: python3 -m pip"
check "playwright"  "playwright"  "pip install playwright && playwright install chromium"
check "git"         "git"         "https://git-scm.com"
check "node"        "node"        "https://nodejs.org — required for setup/verify-env.mjs"

echo ""

# Check Python version is 3.8+
if command -v python3 >/dev/null 2>&1; then
  PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
  PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 8 ]; then
    echo "OK   Python version: $PY_VERSION (3.8+ required)"
    PASS=$((PASS+1))
  else
    echo "MISS Python version: $PY_VERSION — geo-seo-claude requires Python 3.8+"
    FAIL=$((FAIL+1))
  fi
fi

# Check Playwright chromium is installed (not just the CLI)
if command -v playwright >/dev/null 2>&1; then
  if playwright browsers 2>/dev/null | grep -q "chromium"; then
    echo "OK   Playwright chromium browser installed"
    PASS=$((PASS+1))
  else
    echo "MISS Playwright chromium browser not found — run: playwright install chromium"
    FAIL=$((FAIL+1))
  fi
fi

# Check for the fork directory
FORK_DIR="${GEO_SEO_HOME:-${GEO_SEO_FORK_PATH:-$HOME/geo-seo-claude}}"
if [ -d "$FORK_DIR" ]; then
  echo "OK   geo-seo-claude fork at $FORK_DIR"
  PASS=$((PASS+1))
else
  echo "MISS geo-seo-claude fork not found at $FORK_DIR"
  echo "     Run: bash setup/clone-fork.sh"
  echo "     Or set GEO_SEO_HOME (legacy alias: GEO_SEO_FORK_PATH) to your fork path in .env"
  FAIL=$((FAIL+1))
fi

echo ""
echo "Passed: $PASS  |  Missing: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Install missing dependencies before running local-fork workflows."
  echo "Agent-only mode (no fork required) is always available as a fallback."
  exit 1
fi

echo ""
echo "All dependencies present. Local-fork mode is ready."
echo "Next: node setup/verify-env.mjs"
