#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for path in \
  "cli" \
  "server" \
  "ui" \
  "packages/shared" \
  "packages/create-growthub-local" \
  "packages/model-training" \
  "docs/LOCAL_HOSTED_CONTRACT.md" \
  "docs/RELEASE_FREEZE.md"
do
  if [[ ! -e "${ROOT}/${path}" ]]; then
    echo "Missing required freeze path: ${path}" >&2
    exit 1
  fi
done

echo "Growthub Local freeze boundary is present."
