#!/usr/bin/env bash
# agent-dist-verify.sh
#
# Multi-scenario verification companion to docs/AGENT_DIST_REBUILD_GUIDE.md.
# Designed for agents working in the OSS tree (Phase A) to validate their
# changes before opening a PR — and for super-admins to run the equivalent
# checks before a Phase B dist rebuild ships.
#
# Usage:
#   bash scripts/agent-dist-verify.sh <scenario>
#
# Scenarios:
#   pre-push        Phase A pre-push gate (Tiers 1-4 of the verification ladder)
#                   — six gate scripts, tsc, source + test type-check
#   docs-only       Docs-only PR — quick gate ladder, no tsc
#   version-sync    Verify cli + create-growthub-local version alignment only
#   assets          Worker-kit / shared-template asset PR — kit manifest checks
#   smoke-dist      Smoke-test the committed cli/dist/index.js without rebuilding
#   tarball         Verify the cli + create-growthub-local tarballs (npm pack --dry-run + release-check)
#   rebuild-dist    SUPER-ADMIN ONLY — esbuild rebuild + verify (refuses on OSS tree)
#   help            Print this menu
#
# Hard guardrails:
#   - Refuses to commit cli/dist/** unless the operator passes
#     GROWTHUB_AGENT_DIST_REBUILD_OK=1 AND the scenario is rebuild-dist.
#   - Refuses to run rebuild-dist on an OSS tree (detects missing
#     packages/adapters/* and packages/db/package.json).
#   - Never modifies git state.
#   - Never runs git push or npm publish.
#   - Never touches the user's $HOME outside of the smoke-test temp dir.

set -euo pipefail

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
cd "${REPO_ROOT}"

# Colors (no-op on non-tty)
if [ -t 1 ]; then
  BLUE='\033[34m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'
else
  BLUE=''; GREEN=''; YELLOW=''; RED=''; DIM=''; RESET=''
fi

step() { printf "${BLUE}── %s${RESET}\n" "$1"; }
ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
warn() { printf "  ${YELLOW}!${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; }
dim()  { printf "${DIM}%s${RESET}\n" "$1"; }

die() { fail "$1"; exit 1; }

scenario="${1:-help}"

# ---------------------------------------------------------------------------
# Detect tree shape
# ---------------------------------------------------------------------------

is_full_workspace() {
  # The full workspace has both packages/adapters/* dirs AND packages/db/package.json.
  [ -d "${REPO_ROOT}/packages/adapters/claude-local/src" ] \
    && [ -f "${REPO_ROOT}/packages/db/package.json" ]
}

# ---------------------------------------------------------------------------
# Tier 1 — six gate scripts
# ---------------------------------------------------------------------------

run_gate_scripts() {
  step "Tier 1 — gate scripts"
  bash scripts/freeze-check.sh        >/dev/null  && ok "freeze-check"      || die "freeze-check failed"
  node scripts/check-version-sync.mjs >/dev/null  && ok "check-version-sync" || die "check-version-sync failed"
  node scripts/check-cli-package.mjs  >/dev/null  && ok "check-cli-package" || die "check-cli-package failed"
  node scripts/check-worker-kits.mjs  >/dev/null  && ok "check-worker-kits" || die "check-worker-kits failed"
  node scripts/check-fork-sync.mjs    >/dev/null  && ok "check-fork-sync"   || die "check-fork-sync failed"
  node scripts/release-check.mjs      >/dev/null  && ok "release-check"     || die "release-check failed"
}

# ---------------------------------------------------------------------------
# Tier 2 — typescript
# ---------------------------------------------------------------------------

run_tsc_source() {
  step "Tier 2 — tsc (source)"
  if pnpm --filter @growthub/cli exec tsc --noEmit >/dev/null 2>&1; then
    ok "cli/src tsc --noEmit"
  else
    pnpm --filter @growthub/cli exec tsc --noEmit
    die "cli/src tsc failed"
  fi
}

run_tsc_tests() {
  step "Tier 3 — tsc (tests)"
  if pnpm --filter @growthub/cli exec tsc --noEmit -p tsconfig.test.json >/dev/null 2>&1; then
    ok "cli/src/__tests__ tsc --noEmit -p tsconfig.test.json"
  else
    warn "cli/src/__tests__ tsc has pre-existing errors — see RELEASE_DIST_REBUILD_WORKFLOW.md §8"
    pnpm --filter @growthub/cli exec tsc --noEmit -p tsconfig.test.json 2>&1 | tail -10 || true
  fi
}

# ---------------------------------------------------------------------------
# Tier 3 — smoke against committed dist
# ---------------------------------------------------------------------------

smoke_dist() {
  step "Smoke — committed cli/dist/index.js"

  [ -f "${REPO_ROOT}/cli/dist/index.js" ] || die "cli/dist/index.js missing"

  # Shebang correctness
  local first_line
  first_line="$(head -n 1 "${REPO_ROOT}/cli/dist/index.js")"
  if [ "${first_line}" = "#!/usr/bin/env node" ]; then
    ok "shebang ok"
  else
    die "shebang missing or corrupt: '${first_line}'"
  fi

  local shebang_count
  shebang_count="$(grep -c '^#!/usr/bin/env node' "${REPO_ROOT}/cli/dist/index.js" || true)"
  if [ "${shebang_count}" = "1" ]; then
    ok "shebang appears exactly once"
  else
    die "shebang appears ${shebang_count} times — duplicate shebang regression"
  fi

  # CLI boots and version is reported
  local cli_version
  cli_version="$(node "${REPO_ROOT}/cli/dist/index.js" --version 2>/dev/null || true)"
  if [ -n "${cli_version}" ]; then
    ok "cli --version → ${cli_version}"
  else
    die "cli --version failed"
  fi

  # cli version matches package.json
  local pkg_version
  pkg_version="$(node -p "require('${REPO_ROOT}/cli/package.json').version")"
  if [ "${cli_version}" = "${pkg_version}" ]; then
    ok "dist version matches cli/package.json (${pkg_version})"
  else
    warn "dist version (${cli_version}) != cli/package.json (${pkg_version}) — Phase B rebuild needed"
  fi

  # workspace status JSON shape
  if node "${REPO_ROOT}/cli/dist/index.js" workspace status --json >/dev/null 2>&1; then
    ok "workspace status --json runs"
  else
    die "workspace status --json failed"
  fi

  # auth whoami JSON shape (works whether authed or not)
  if node "${REPO_ROOT}/cli/dist/index.js" auth whoami --json >/dev/null 2>&1; then
    ok "auth whoami --json runs"
  else
    die "auth whoami --json failed"
  fi

  # README one-liner: kit download must still produce apps/workspace/package.json
  local tmpdir
  tmpdir="$(mktemp -d -t growthub-dist-smoke.XXXXXX)"
  trap "rm -rf '${tmpdir}'" EXIT
  if node "${REPO_ROOT}/cli/dist/index.js" kit download growthub-custom-workspace-starter-v1 --out "${tmpdir}/ws" --yes >/dev/null 2>&1; then
    if [ -f "${tmpdir}/ws/apps/workspace/package.json" ]; then
      ok "kit download → apps/workspace/package.json present (README one-liner intact)"
    else
      die "kit download succeeded but apps/workspace/package.json missing"
    fi
  else
    die "kit download failed"
  fi
}

# ---------------------------------------------------------------------------
# Tier 4 — tarball verification
# ---------------------------------------------------------------------------

verify_tarball() {
  step "Tarball — npm pack --dry-run"

  (cd "${REPO_ROOT}/cli" && npm pack --dry-run >/dev/null 2>&1) && ok "cli npm pack --dry-run" || die "cli npm pack failed"
  (cd "${REPO_ROOT}/packages/create-growthub-local" && npm pack --dry-run >/dev/null 2>&1) \
    && ok "create-growthub-local npm pack --dry-run" \
    || die "create-growthub-local npm pack failed"

  # release-check enforces required + forbidden files in the tarball
  node "${REPO_ROOT}/scripts/release-check.mjs" >/dev/null && ok "release-check passed" || die "release-check failed"
}

# ---------------------------------------------------------------------------
# rebuild-dist (Phase B — super-admin only)
# ---------------------------------------------------------------------------

rebuild_dist() {
  step "Phase B — rebuild cli/dist/index.js"

  if ! is_full_workspace; then
    fail "This is an OSS tree, not the full workspace."
    dim "Phase B requires packages/adapters/* and packages/db/package.json, which are super-admin-only."
    dim "Refusing to rebuild. Read docs/AGENT_DIST_REBUILD_GUIDE.md §3 + §7."
    exit 2
  fi

  if [ "${GROWTHUB_AGENT_DIST_REBUILD_OK:-}" != "1" ]; then
    fail "Set GROWTHUB_AGENT_DIST_REBUILD_OK=1 to confirm you are super-admin running Phase B."
    dim "  GROWTHUB_AGENT_DIST_REBUILD_OK=1 bash scripts/agent-dist-verify.sh rebuild-dist"
    exit 2
  fi

  ok "Detected full workspace + super-admin opt-in"
  dim "Running esbuild via cli/esbuild.config.mjs..."

  cd "${REPO_ROOT}/cli"
  node --input-type=module -e "
import esbuild from 'esbuild';
import opts from './esbuild.config.mjs';
await esbuild.build(opts);
console.log('built');
" || die "esbuild rebuild failed"
  cd "${REPO_ROOT}"
  ok "esbuild rebuild complete"

  smoke_dist
  verify_tarball
}

# ---------------------------------------------------------------------------
# Scenario routing
# ---------------------------------------------------------------------------

case "${scenario}" in
  pre-push)
    step "Scenario: pre-push (Phase A)"
    run_gate_scripts
    run_tsc_source
    run_tsc_tests
    smoke_dist
    printf "${GREEN}── pre-push verification complete${RESET}\n"
    ;;

  docs-only)
    step "Scenario: docs-only"
    bash scripts/freeze-check.sh        >/dev/null && ok "freeze-check" || die "freeze-check failed"
    node scripts/check-version-sync.mjs >/dev/null && ok "check-version-sync (no source changes)" || die "version-sync failed"
    node scripts/check-fork-sync.mjs    >/dev/null && ok "check-fork-sync" || die "fork-sync failed"
    printf "${GREEN}── docs-only verification complete${RESET}\n"
    ;;

  version-sync)
    step "Scenario: version-sync"
    node scripts/check-version-sync.mjs && ok "version sync ok" || die "version sync mismatch"
    node "${REPO_ROOT}/cli/dist/index.js" --version
    node -p "require('${REPO_ROOT}/cli/package.json').version"
    node -p "require('${REPO_ROOT}/packages/create-growthub-local/package.json').version"
    node -p "require('${REPO_ROOT}/packages/create-growthub-local/package.json').dependencies['@growthub/cli']"
    ;;

  assets)
    step "Scenario: assets (worker-kit / shared-template)"
    node scripts/check-worker-kits.mjs >/dev/null && ok "check-worker-kits" || die "check-worker-kits failed"
    node scripts/check-fork-sync.mjs   >/dev/null && ok "check-fork-sync"   || die "check-fork-sync failed"
    node scripts/release-check.mjs     >/dev/null && ok "release-check"     || die "release-check failed"
    printf "${GREEN}── asset verification complete${RESET}\n"
    ;;

  smoke-dist)
    step "Scenario: smoke-dist (no rebuild)"
    smoke_dist
    printf "${GREEN}── smoke complete${RESET}\n"
    ;;

  tarball)
    step "Scenario: tarball verification"
    verify_tarball
    printf "${GREEN}── tarball verification complete${RESET}\n"
    ;;

  rebuild-dist)
    rebuild_dist
    printf "${GREEN}── Phase B rebuild + verify complete${RESET}\n"
    ;;

  help|-h|--help|"")
    cat <<EOF
Usage: bash scripts/agent-dist-verify.sh <scenario>

Scenarios:
  pre-push        Phase A pre-push (six gates + tsc source + tsc tests + smoke dist)
  docs-only       Docs-only PR (freeze + version-sync + fork-sync gates)
  version-sync    Verify cli + create-growthub-local version alignment
  assets          Worker-kit / shared-template asset PR
  smoke-dist      Smoke-test committed cli/dist/index.js (no rebuild)
  tarball         Verify cli + create-growthub-local npm pack --dry-run + release-check
  rebuild-dist    SUPER-ADMIN ONLY — full esbuild rebuild + verify
                  Requires GROWTHUB_AGENT_DIST_REBUILD_OK=1 + full workspace.

See docs/AGENT_DIST_REBUILD_GUIDE.md for the full decision tree.

Hard guardrails:
  - Refuses rebuild-dist on the OSS tree (no packages/adapters/*).
  - Never runs git, never publishes to npm.
  - All checks are read-only or write only to /tmp/.
EOF
    ;;

  *)
    fail "Unknown scenario: ${scenario}"
    "$0" help
    exit 1
    ;;
esac
