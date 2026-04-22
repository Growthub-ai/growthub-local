#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO="${MONOREPO:-}"

if [[ -z "${MONOREPO}" ]]; then
  echo "ERROR: set MONOREPO to the absolute path of your growthub-core checkout" >&2
  echo "  example: MONOREPO=\"\$HOME/code/growthub-core\" bash scripts/sync-from-monorepo.sh" >&2
  exit 1
fi

if [[ ! -d "${MONOREPO}" ]]; then
  echo "ERROR: MONOREPO directory does not exist: ${MONOREPO}" >&2
  exit 1
fi

copy_dir() {
  local source="$1"
  local target="$2"
  rm -rf "${ROOT:?}/${target}"
  mkdir -p "$(dirname "${ROOT}/${target}")"
  cp -R "${MONOREPO}/${source}" "${ROOT}/${target}"
}

copy_file() {
  local source="$1"
  local target="$2"
  mkdir -p "$(dirname "${ROOT}/${target}")"
  cp "${MONOREPO}/${source}" "${ROOT}/${target}"
}

copy_dir "cli" "cli"
copy_dir "server" "server"
copy_dir "ui" "ui"
copy_dir "packages/shared" "packages/shared"
copy_dir "packages/create-growthub-local" "packages/create-growthub-local"

copy_file "pnpm-lock.yaml" "pnpm-lock.yaml"
copy_file "pnpm-workspace.yaml" "pnpm-workspace.upstream.yaml"

echo "Synced allowed Growthub Local sources from ${MONOREPO}"
