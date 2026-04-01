# growthub-local — Agent Workflow

## Before any work
1. You MUST be in a worktree under `.claude/worktrees/`
2. Branch must follow convention: `fix/`, `feat/`, `chore/`, `refactor/`, `docs/`, `ci/`, `test/`, `perf/`, `adapter/`, `sync/`
3. Remote must point to `growthub-local`
4. Read source files before editing

## Before pushing
Run `bash scripts/pr-ready.sh` — it validates everything in one shot.

## Command guardrails
Run `bash scripts/guard.sh check-command "<command>"` before any git operation to verify it's safe.

## Two-repo reality
- `growthub-local` = source of truth, PR branch, CI/CD, npm
- `growthub-core` = browser testing only (HMR at localhost:3100)
- To test: `cp worktree/ui/src/file → growthub-core/growthub-core/ui/src/file`
- Always sync back after validation

## Version bumps (only when source changes ship to npm)
- `cli/package.json` version +1
- `packages/create-growthub-local/package.json` version +1
- dep pin in create must match cli version exactly

## CI must pass before merge
- smoke, validate, verify — all 3 green
- Then: `node scripts/release-check.mjs` locally
- Then: merge, run release.yml, confirm npm
