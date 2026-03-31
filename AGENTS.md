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

## Cursor Cloud specific instructions

### Repo structure
This public repo is a **published slice** of a private monorepo. Several workspace packages (adapters, db, plugin-sdk, adapter-utils) are **stubs** created for local dev — they export minimal symbols so `pnpm install`, server startup, and the Vite UI dev server all work. Tests that depend on real adapter/db implementations will fail against these stubs; that's expected.

### Running services
- **Server** (port 3100): `cd server && PAPERCLIP_MIGRATION_AUTO_APPLY=true pnpm dev`
  - Uses embedded PostgreSQL (auto-starts on port 54329, data in `~/.paperclip/instances/default/db`)
  - If embedded postgres fails with shared-library errors, run the hydrate script: `cd node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64 && node scripts/hydrate-symlinks.js`
- **UI** (port 5173): `cd ui && pnpm dev` — Vite dev server proxies `/api` to the server
- Both must run for the full dev experience. Server must start first.

### Key commands
| Task | Command |
|------|---------|
| Install deps | `pnpm install --no-frozen-lockfile` |
| Build shared (prereq) | `pnpm --filter @paperclipai/shared build` |
| Run all tests | `pnpm vitest run` (34/85 files pass with stubs) |
| Typecheck shared | `pnpm --filter @paperclipai/shared typecheck` |
| Server dev | `cd server && PAPERCLIP_MIGRATION_AUTO_APPLY=true pnpm dev` |
| UI dev | `cd ui && pnpm dev` |

### Gotchas
- **Lockfile**: CONTRIBUTING.md says never commit `pnpm-lock.yaml` — CI owns it. Use `--no-frozen-lockfile` on install.
- **Embedded Postgres symlinks**: The `@embedded-postgres/linux-x64` package needs its postinstall (`hydrate-symlinks.js`) to run. If pnpm skips build scripts, run it manually.
- **Stub table limitations**: The db stub tables have minimal column definitions. Some server routes (heartbeat runs, plugin system, sidebar badges) will throw non-fatal SQL errors at runtime. Core routes (companies, agents, issues, projects) work.
- **No ESLint/Prettier**: This repo has no linting tooling; TypeScript type-checking (`typecheck` scripts) is the code quality gate.
