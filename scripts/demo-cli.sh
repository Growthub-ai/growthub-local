#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"

exec node "${REPO_ROOT}/scripts/cli-demo.mjs" "$@"
