#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# guard.sh — Universal guardrail for growthub-local.
#
# Works with any AI coding agent (Claude, Codex, Cursor, etc.) and
# any git hook. Blocks destructive patterns before they cause damage.
#
# Usage:
#   scripts/guard.sh pre-push          Called by .githooks/pre-push
#   scripts/guard.sh check-command "git stash"   Validate a command
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

CHECK="${1:-}"
shift || true

case "$CHECK" in

  # ── pre-push: run before every git push ──────────────────────────────────
  pre-push)
    BRANCH="$(git branch --show-current 2>/dev/null || echo '')"

    # Block direct push to main/master
    if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
      printf "${RED}BLOCKED${NC}: Do not push directly to main. Use a feature branch.\n" >&2
      exit 1
    fi

    # Branch name convention
    if [[ -n "$BRANCH" ]] && ! echo "$BRANCH" | grep -qE '^(fix|feat|chore|refactor|docs|ci|test|perf|adapter|sync)/'; then
      printf "${RED}BLOCKED${NC}: Branch '%s' does not follow naming convention (fix/|feat/|chore/|...).\n" "$BRANCH" >&2
      exit 1
    fi

    # release-check must pass
    if ! node scripts/release-check.mjs >/dev/null 2>&1; then
      printf "${RED}BLOCKED${NC}: release-check.mjs failed. Run it manually for details.\n" >&2
      exit 1
    fi

    printf "${GREEN}guard: pre-push passed${NC}\n"
    exit 0
    ;;

  # ── check-command: validate a shell command before execution ──────────────
  check-command)
    CMD="${*}"
    TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || echo '')"

    # Block stash/checkout main inside worktrees
    if [[ "$TOPLEVEL" == *"/.claude/worktrees/"* ]] || [[ "$TOPLEVEL" == *"/worktrees/"* ]]; then
      if echo "$CMD" | grep -qE 'git\s+(stash|checkout\s+main|checkout\s+master|checkout\s+-)'; then
        printf "${RED}BLOCKED${NC}: '%s' — do not escape the worktree. Work stays here.\n" "$CMD" >&2
        exit 1
      fi
    fi

    # Block destructive operations everywhere
    if echo "$CMD" | grep -qE 'git\s+reset\s+--hard'; then
      printf "${RED}BLOCKED${NC}: git reset --hard is destructive. Use 'git checkout -- <file>' instead.\n" >&2
      exit 1
    fi
    if echo "$CMD" | grep -qE 'git\s+push\s+--force'; then
      printf "${RED}BLOCKED${NC}: Force push is not allowed.\n" >&2
      exit 1
    fi
    if echo "$CMD" | grep -qE 'git\s+clean\s+-f'; then
      printf "${RED}BLOCKED${NC}: git clean -f is destructive. Remove files explicitly.\n" >&2
      exit 1
    fi
    if echo "$CMD" | grep -qE 'git\s+push\s+origin\s+(main|master)\b'; then
      printf "${RED}BLOCKED${NC}: Do not push directly to main.\n" >&2
      exit 1
    fi

    exit 0
    ;;

  *)
    echo "Usage: guard.sh <pre-push|check-command> [args]" >&2
    exit 1
    ;;
esac
