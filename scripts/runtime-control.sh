#!/usr/bin/env bash
set -euo pipefail

# Canonical runtime control for agents and humans.
# Keeps growthub-local main/branch loading deterministic.

ROOT="${GH_LOCAL_ROOT:-/Users/antonio/growthub-local}"
CONFIG="${GH_CONFIG:-/Users/antonio/.paperclip/instances/default/config.json}"
SERVER_PORT="${GH_SERVER_PORT:-3100}"
UI_PORT="${GH_UI_PORT:-5173}"
LOG_DIR="${GH_LOG_DIR:-/tmp/growthub-local}"
SERVER_LOG="${LOG_DIR}/server.log"
UI_LOG="${LOG_DIR}/ui.log"

SERVER_PATTERN='tsx watch --ignore ../ui/node_modules --ignore ../ui/.vite --ignore ../ui/dist src/index.ts'
UI_PATTERN='vite -- --port 5173'
CLI_PATTERN='cli/dist/index.js run'

mkdir -p "${LOG_DIR}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_repo() {
  [[ -d "${ROOT}/.git" ]] || die "Not a git repo: ${ROOT}"
}

stop_runtime() {
  pkill -f "${CLI_PATTERN}" >/dev/null 2>&1 || true
  pkill -f "${SERVER_PATTERN}" >/dev/null 2>&1 || true
  pkill -f 'vite -- --port 5173' >/dev/null 2>&1 || true
  pkill -f "vite -- --port ${UI_PORT}" >/dev/null 2>&1 || true
}

start_runtime() {
  local branch="${1:-}"
  ensure_repo
  require_cmd git
  require_cmd pnpm

  stop_runtime

  cd "${ROOT}"

  if [[ -n "${branch}" ]]; then
    git fetch origin
    git checkout "${branch}"
    git pull --ff-only || true
  fi

  nohup env PAPERCLIP_CONFIG="${CONFIG}" PAPERCLIP_SURFACE_PROFILE=gtm \
    pnpm --dir server run dev:watch >"${SERVER_LOG}" 2>&1 &

  nohup env VITE_API_ORIGIN="http://127.0.0.1:${SERVER_PORT}" \
    pnpm --dir ui run dev -- --port "${UI_PORT}" >"${UI_LOG}" 2>&1 &

  sleep 2
  echo "Started runtime:"
  echo "  repo: ${ROOT}"
  echo "  config: ${CONFIG}"
  echo "  branch: $(git branch --show-current)"
  echo "  ui: http://localhost:${UI_PORT}/gtm/GHA/workspace"
  echo "  logs: ${SERVER_LOG} | ${UI_LOG}"
}

show_status() {
  echo "Branch:"
  (cd "${ROOT}" && git branch --show-current) || true
  echo ""
  echo "Server health:"
  curl -s "http://127.0.0.1:${SERVER_PORT}/api/health" || echo "unreachable"
  echo ""
  echo ""
  echo "Companies:"
  curl -s "http://127.0.0.1:${SERVER_PORT}/api/companies" || echo "unreachable"
  echo ""
  echo ""
  echo "Listeners:"
  lsof -nP -iTCP:${SERVER_PORT} -sTCP:LISTEN || true
  lsof -nP -iTCP:${UI_PORT} -sTCP:LISTEN || true
}

usage() {
  cat <<'EOF'
Usage:
  scripts/runtime-control.sh up-main
  scripts/runtime-control.sh up-branch <branch>
  scripts/runtime-control.sh up-pr <pr-number>
  scripts/runtime-control.sh stop
  scripts/runtime-control.sh status
  scripts/runtime-control.sh url
  scripts/runtime-control.sh growthub -- <growthub-args>

Commands:
  up-main            Stop stale processes, checkout/pull main, start server+ui
  up-branch <name>   Stop stale processes, checkout/pull branch, start server+ui
  up-pr <number>     Checkout PR branch with gh, then start server+ui
  stop               Stop runtime processes managed by this repo
  status             Show health, company payload, and listeners
  url                Print canonical GTM URL
  growthub           Forward to local CLI (sets GH_LOCAL_ROOT to this repo); requires built cli/dist
EOF
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    up-main)
      start_runtime "main"
      ;;
    up-branch)
      [[ -n "${2:-}" ]] || die "Missing branch name"
      start_runtime "${2}"
      ;;
    up-pr)
      [[ -n "${2:-}" ]] || die "Missing PR number"
      require_cmd gh
      ensure_repo
      stop_runtime
      cd "${ROOT}"
      gh pr checkout "${2}"
      start_runtime "$(git branch --show-current)"
      ;;
    stop)
      stop_runtime
      echo "Stopped runtime processes."
      ;;
    status)
      show_status
      ;;
    url)
      echo "http://localhost:${UI_PORT}/gtm/GHA/workspace"
      ;;
    growthub)
      shift
      require_cmd pnpm
      export GH_LOCAL_ROOT="${ROOT}"
      cd "${ROOT}"
      exec pnpm --dir cli exec -- growthub "$@"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
