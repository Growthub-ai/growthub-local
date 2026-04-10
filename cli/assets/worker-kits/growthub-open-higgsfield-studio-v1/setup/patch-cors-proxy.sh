#!/usr/bin/env bash
# patch-cors-proxy.sh — Apply Next.js CORS proxy patch to the Open Higgsfield AI local fork
#
# WHY THIS EXISTS
# ---------------
# The upstream repo calls api.muapi.ai directly from the browser (BASE_URL in muapi.js).
# api.muapi.ai does not return Access-Control-Allow-Origin headers, so every browser
# request from localhost:3001 is blocked by CORS policy.
#
# THE FIX
# -------
# 1. next.config.mjs — adds a rewrites() block:
#      /muapi-proxy/:path* → https://api.muapi.ai/:path*   (server-side, no CORS)
#
# 2. packages/studio/src/muapi.js — changes BASE_URL:
#      'https://api.muapi.ai'  →  '/muapi-proxy'
#
# All fetch/XHR calls now hit the local Next.js server which proxies them server-side.
# No browser cross-origin request is made. CORS policy never fires.
#
# USAGE
# -----
#   bash setup/patch-cors-proxy.sh [path-to-fork]
#
# Defaults to ~/open-higgsfield-ai if no path given.
# Safe to run multiple times — idempotent.

set -e

FORK_DIR="${1:-$HOME/open-higgsfield-ai}"
NEXT_CONFIG="$FORK_DIR/next.config.mjs"
MUAPI_JS="$FORK_DIR/packages/studio/src/muapi.js"

echo ""
echo "=== CORS Proxy Patch ==="
echo "Fork: $FORK_DIR"
echo ""

# ── Guard: fork must exist ──────────────────────────────────────────────────
if [ ! -d "$FORK_DIR" ]; then
  echo "ERROR: Fork not found at $FORK_DIR"
  echo "Run setup/clone-fork.sh first."
  exit 1
fi

if [ ! -f "$NEXT_CONFIG" ]; then
  echo "ERROR: next.config.mjs not found at $NEXT_CONFIG"
  exit 1
fi

if [ ! -f "$MUAPI_JS" ]; then
  echo "ERROR: muapi.js not found at $MUAPI_JS"
  exit 1
fi

# ── Idempotency check ───────────────────────────────────────────────────────
if grep -q "muapi-proxy" "$NEXT_CONFIG" 2>/dev/null; then
  echo "✓ next.config.mjs already patched — skipping."
  NEXT_DONE=1
else
  NEXT_DONE=0
fi

if grep -q "muapi-proxy" "$MUAPI_JS" 2>/dev/null; then
  echo "✓ muapi.js already patched — skipping."
  MUAPI_DONE=1
else
  MUAPI_DONE=0
fi

if [ "$NEXT_DONE" -eq 1 ] && [ "$MUAPI_DONE" -eq 1 ]; then
  echo ""
  echo "Both files already patched. Nothing to do."
  exit 0
fi

# ── Backup originals ────────────────────────────────────────────────────────
if [ "$NEXT_DONE" -eq 0 ]; then
  cp "$NEXT_CONFIG" "$NEXT_CONFIG.orig"
fi
if [ "$MUAPI_DONE" -eq 0 ]; then
  cp "$MUAPI_JS" "$MUAPI_JS.orig"
fi

# ── Patch next.config.mjs ───────────────────────────────────────────────────
if [ "$NEXT_DONE" -eq 0 ]; then
  cat > "$NEXT_CONFIG" << 'NEXTEOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio'],

  // CORS proxy — forward all Muapi API calls through the Next.js server so
  // the browser never makes cross-origin requests to api.muapi.ai directly.
  // muapi.js uses BASE_URL = '/muapi-proxy', so every fetch/XHR hits
  // /muapi-proxy/api/v1/... which Next.js rewrites to api.muapi.ai server-side.
  async rewrites() {
    return [
      {
        source: '/muapi-proxy/:path*',
        destination: 'https://api.muapi.ai/:path*',
      },
    ];
  },
};

export default nextConfig;
NEXTEOF
  echo "✓ next.config.mjs patched — added /muapi-proxy rewrites()"
fi

# ── Patch muapi.js ──────────────────────────────────────────────────────────
if [ "$MUAPI_DONE" -eq 0 ]; then
  # Replace the BASE_URL line only (targeted sed, not full file rewrite)
  sed -i.bak \
    "s|const BASE_URL = 'https://api.muapi.ai';|// Proxy through Next.js to avoid CORS. All calls route through /muapi-proxy/:path*\n// which next.config.mjs rewrites to api.muapi.ai server-side — no CORS headers needed.\nconst BASE_URL = '/muapi-proxy';|" \
    "$MUAPI_JS"
  # Remove sed backup (we already made our own)
  rm -f "$MUAPI_JS.bak"
  echo "✓ muapi.js patched — BASE_URL changed to '/muapi-proxy'"
fi

# ── Verify ───────────────────────────────────────────────────────────────────
echo ""
echo "Verifying patch..."

if grep -q "muapi-proxy" "$NEXT_CONFIG" && grep -q "muapi-proxy" "$MUAPI_JS"; then
  echo "✓ Patch verified. Both files updated correctly."
else
  echo "ERROR: Patch verification failed. Check the files manually."
  echo "  $NEXT_CONFIG"
  echo "  $MUAPI_JS"
  exit 1
fi

echo ""
echo "CORS proxy patch complete."
echo "Restart the dev server to pick up next.config.mjs changes:"
echo "  npm run dev -- --port 3001"
echo ""
