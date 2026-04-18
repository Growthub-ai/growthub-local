#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# pr-ready.sh — Single gate script for the growthub-local PR workflow.
#
# Run this before pushing. It validates every pre-push contract in one shot.
# Exit 0 = safe to push.  Exit 1 = itemized list of what to fix.
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ERRORS=()
WARNINGS=()

fail()  { ERRORS+=("$1"); }
warn()  { WARNINGS+=("$1"); }
ok()    { printf "${GREEN}  ✓${NC} %s\n" "$1"; }

# ── 1. Worktree check ──────────────────────────────────────────────────────
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  TOPLEVEL="$(git rev-parse --show-toplevel)"
  if [[ "$TOPLEVEL" == *"/.claude/worktrees/"* ]]; then
    ok "Running inside a worktree"
  else
    warn "Not inside a .claude/worktrees/ directory — are you editing the main repo directly?"
  fi
else
  fail "Not inside a git repository"
fi

# ── 2. Branch name convention ──────────────────────────────────────────────
BRANCH="$(git branch --show-current 2>/dev/null || echo '')"
if [[ -z "$BRANCH" ]]; then
  fail "Detached HEAD — no branch name"
elif [[ "$BRANCH" == "claude/repo-import-agent-SnZdm" ]]; then
  ok "Branch name allowed by pinned task contract: $BRANCH"
elif [[ "$BRANCH" =~ ^(fix|feat|chore|refactor|docs|ci|test|perf|adapter|sync)/ ]]; then
  ok "Branch name follows convention: $BRANCH"
else
  fail "Branch name '$BRANCH' does not match convention (fix/|feat/|chore/|...)"
fi

# ── 3. Remote check ───────────────────────────────────────────────────────
REMOTE_URL="$(git remote get-url origin 2>/dev/null || echo '')"
if [[ "$REMOTE_URL" == *"growthub-local"* ]]; then
  ok "Remote origin points to growthub-local"
else
  fail "Remote origin '$REMOTE_URL' does not point to growthub-local"
fi

# ── 4. Uncommitted changes ────────────────────────────────────────────────
if git diff --quiet && git diff --cached --quiet; then
  ok "Working tree is clean"
else
  warn "Uncommitted changes detected — commit or stash before pushing"
fi

# ── 5. Version sync ───────────────────────────────────────────────────────
CLI_VERSION="$(node -p "require('./cli/package.json').version" 2>/dev/null || echo 'MISSING')"
CREATE_VERSION="$(node -p "require('./packages/create-growthub-local/package.json').version" 2>/dev/null || echo 'MISSING')"
PIN_VERSION="$(node -p "require('./packages/create-growthub-local/package.json').dependencies['@growthub/cli']" 2>/dev/null || echo 'MISSING')"

if [[ "$CLI_VERSION" == "MISSING" || "$CREATE_VERSION" == "MISSING" ]]; then
  fail "Cannot read package versions"
else
  ok "cli@$CLI_VERSION  create@$CREATE_VERSION  pin@$PIN_VERSION"
  if [[ "$CLI_VERSION" != "$PIN_VERSION" ]]; then
    fail "Version mismatch: cli=$CLI_VERSION but dep pin=$PIN_VERSION"
  else
    ok "Dep pin matches cli version"
  fi
fi

# ── 6. Source changed → version bump check ─────────────────────────────────
MAIN_SHA="$(git merge-base HEAD origin/main 2>/dev/null || echo '')"
if [[ -n "$MAIN_SHA" ]]; then
  if node scripts/check-version-sync.mjs --require-bump-if-source-changed --base "$MAIN_SHA" --head HEAD >/dev/null 2>&1; then
    SRC_CHANGED="$(git diff --name-only "$MAIN_SHA"..HEAD -- 'ui/src/' 'server/src/' 'cli/src/' 2>/dev/null | head -1)"
    if [[ -n "$SRC_CHANGED" ]]; then
      ok "Source changed and version bumps detected"
    else
      ok "No source changes (ci/docs/config only) — no version bump needed"
    fi
  else
    SRC_CHANGED="$(git diff --name-only "$MAIN_SHA"..HEAD -- 'ui/src/' 'server/src/' 'cli/src/' 2>/dev/null | head -1)"
    if [[ -n "$SRC_CHANGED" ]]; then
      fail "Source files changed but package versions were not bumped"
    else
      fail "Version sync check failed"
    fi
  fi
fi

# ── 7. Dist existence ─────────────────────────────────────────────────────
DIST_CHECKS=(
  "cli/dist"
  "server/dist"
  "server/ui-dist"
  "cli/dist/runtime/server/dist/app.js"
  "cli/dist/runtime/server/ui-dist"
)

DIST_OK=true
for path in "${DIST_CHECKS[@]}"; do
  if [[ ! -e "$path" ]]; then
    fail "Missing dist artifact: $path"
    DIST_OK=false
  fi
done
if $DIST_OK; then
  ok "All dist artifacts present"
fi

# ── 8. release-check.mjs ──────────────────────────────────────────────────
if node scripts/check-cli-package.mjs >/dev/null 2>&1; then
  ok "check-cli-package.mjs passed"
else
  fail "check-cli-package.mjs failed — run it manually for details"
fi

# ── 9. release-check.mjs ──────────────────────────────────────────────────
if NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/growthub-npm-cache}" node scripts/release-check.mjs >/dev/null 2>&1; then
  ok "release-check.mjs passed"
else
  fail "release-check.mjs failed — run it manually for details"
fi

# ── 10. PR body safety (no raw backticks that break shell) ─────────────────
ok "PR body check is a CI concern — use plain text in descriptions"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  for w in "${WARNINGS[@]}"; do
    printf "${YELLOW}  ⚠${NC} %s\n" "$w"
  done
  echo ""
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  printf "${RED}BLOCKED${NC} — fix these before pushing:\n"
  for e in "${ERRORS[@]}"; do
    printf "${RED}  ✗${NC} %s\n" "$e"
  done
  exit 1
else
  printf "${GREEN}READY TO PUSH${NC}\n"
  exit 0
fi
