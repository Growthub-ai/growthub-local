#!/usr/bin/env bash
# Build UI with Vite into server/ui-dist/ (published + CLI bundled runtime source).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec pnpm --filter @paperclipai/ui exec vite build --outDir ../server/ui-dist
