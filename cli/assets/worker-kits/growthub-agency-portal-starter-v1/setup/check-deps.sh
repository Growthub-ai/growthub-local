#!/usr/bin/env bash
# Starter kit — dependency check. Verifies the local runtime is ready.
set -euo pipefail

have() { command -v "$1" >/dev/null 2>&1; }

missing=0
for cmd in node npm git; do
  if ! have "$cmd"; then
    echo "  [check-deps] MISSING: $cmd"
    missing=1
  else
    echo "  [check-deps] ok: $cmd ($(command -v "$cmd"))"
  fi
done

if [ "$missing" -ne 0 ]; then
  exit 1
fi
echo "  [check-deps] All prerequisites satisfied."
