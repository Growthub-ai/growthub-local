# growthub-local — Agent Workflow

This file is read by Codex, OpenAI agents, and any AI coding tool that follows AGENTS.md conventions.

## Before any work
- Work in a feature branch, never directly on main.
- Branch naming: fix/, feat/, chore/, refactor/, docs/, ci/, test/, perf/, adapter/, sync/
- Read source files before editing.

## Before pushing
Run `bash scripts/pr-ready.sh` — validates all pre-push contracts in one shot.

## Command guardrails
Run `bash scripts/guard.sh check-command "<command>"` before destructive git operations.
Blocked patterns: git reset --hard, git push --force, git clean -f, push to main.

## Two-repo reality
- growthub-local = source of truth, PR branch, CI/CD, npm packages
- growthub-core = browser testing only (HMR at localhost:3100)
- To test UI changes: copy file from worktree to growthub-core/growthub-core/ui/src/
- Always copy back after browser validation

## Version bumps (only when source changes ship to npm)
- cli/package.json version +1
- packages/create-growthub-local/package.json version +1
- Dep pin in create-growthub-local must match cli version exactly

## CI gates
- PR checks: smoke, validate, verify — all 3 must pass
- Local gate: node scripts/release-check.mjs
- After merge: gh workflow run release.yml --field dry_run=false
- Confirm npm versions updated before considering work complete

## Release Orchestrator (run after 3 greens)
```
node scripts/release-orchestrator.mjs [--pr <number>] [--skip-build] [--dry-run]
```
Runs 10 strict steps:
1. Re-verify CI state
2. Lockfile integrity
3. Version sync
4. Clean rebuild of dist
5. Dist checksum verification
6. Contract sync check
7. Golden check (release-check.mjs)
8. Dry-run npm pack
9. Tag release commit
10. Super Admin confirmation gate

All steps must pass. On confirmation the operator receives exact merge + publish commands to run manually.
