# growthub-local — Agent Workflow

This file is read by Codex, OpenAI agents, and any AI coding tool that follows AGENTS.md conventions.

## Before any work
- Work in a feature branch or worktree, never directly on `main`.
- Branch naming: `fix/`, `feat/`, `chore/`, `refactor/`, `docs/`, `ci/`, `test/`, `perf/`, `adapter/`, `sync/`
- Read source files before editing.

## Canonical runtime (source dev — use this)
From the **growthub-local** repo root, the deterministic control surface is **`scripts/runtime-control.sh`** (kills stale processes, checks out the target branch when applicable, starts **server `dev:watch` + Vite** with the configured instance).

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Typical GTM dev URL after `up-main` (adjust company slug if yours differs): `http://localhost:5173/gtm/GHA/workspace`

**Ports:** The script defaults `GH_SERVER_PORT` to **3100**. Your API may listen on **3101** (see `ui/vite.config.ts` proxy default). If health checks or the UI fail to reach the API, set `GH_SERVER_PORT` to match the real listener, for example:

```bash
GH_SERVER_PORT=3101 scripts/runtime-control.sh up-main
```

**Paths:** Override with `GH_LOCAL_ROOT`, `GH_CONFIG`, `GH_UI_PORT`, `GH_LOG_DIR` when not using defaults.

## Anti-patterns (do not do this)
- **Do not** improvise a “two-terminal” `pnpm --dir server` + `pnpm --dir ui` loop as your own primary workflow unless a maintainer explicitly told you to — it skips the same cleanup, env, and branch discipline as **`scripts/runtime-control.sh`**.
- **Do not** run **`node scripts/worktree-bootstrap.mjs`** or copy files by hand into **growthub-core** — those paths are **maintainer / automation only**, not agent runbooks.
- **Do not** treat copy-pasted **semver** numbers from chat, old PRs, or blog posts as truth — see **`docs/ARTIFACT_VERSIONS.md`** and read **`cli/package.json`** on your checkout.

## Isolated environments
When you need an isolated DB, port, and instance state:

```bash
growthub worktree:make my-feature
```

Use the maintainer’s instructions for that worktree; still **do not** run bootstrap scripts yourself.

## Before pushing
Run `bash scripts/pr-ready.sh` — validates pre-push contracts in one shot.

## Command guardrails
Run `bash scripts/guard.sh check-command "<command>"` before destructive git operations.  
Blocked patterns: `git reset --hard`, `git push --force`, `git clean -f`, push to `main`.

## Two-repo reality
- **growthub-local** = source of truth for PRs, CI/CD, and npm (`@growthub/cli`, `create-growthub-local`).
- **growthub-core** and other private trees are **outside** the agent runbook unless a maintainer gives you explicit steps.

## Version bumps (only when npm-facing behavior ships)
- Bump `cli/package.json`
- Bump `packages/create-growthub-local/package.json`
- The installer pin for `@growthub/cli` must match the CLI version exactly

## CI gates
- PR checks: `smoke`, `validate`, `verify` — all must pass
- Local gate: `node scripts/release-check.mjs`
- After merge: maintainer runs release workflow; confirm npm versions if you shipped packages
