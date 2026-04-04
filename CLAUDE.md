# growthub-local — Agent Workflow

## Required reading
Before starting ANY work, read `CONTRIBUTING.md`, `AGENTS.md`, and `docs/ARTIFACT_VERSIONS.md`. Do not skip them.

## Before any work
1. Work in a feature branch or **git worktree** (isolation via `growthub worktree:make` when needed), not uncontrolled edits on **`main`**.
2. Branch naming: `fix/`, `feat/`, `chore/`, `refactor/`, `docs/`, `ci/`, `test/`, `perf/`, `adapter/`, `sync/`
3. Remote must point at the **growthub-local** GitHub repo you intend to PR against.
4. Read source files before editing.

## Canonical runtime
Use **`scripts/runtime-control.sh`** from the repo root — same commands as `AGENTS.md` (`up-main`, `up-branch`, `up-pr`, `stop`, `status`, `url`). Align **`GH_SERVER_PORT`** with the API process you are actually running.

## Anti-patterns
- **Never** run **`node scripts/worktree-bootstrap.mjs`** yourself — that file is **maintainer/automation only**, not an agent entrypoint.
- **Never** manually copy `ui/src` or `server/src` into **growthub-core** to “test”; that is not the agent workflow.
- **Never** treat ad-hoc “terminal 1 server + terminal 2 vite” as the default substitute for **`scripts/runtime-control.sh`**.

## Before pushing
Run `bash scripts/pr-ready.sh` — it validates everything in one shot.

## Command guardrails
Run `bash scripts/guard.sh check-command "<command>"` before any git operation to verify it's safe.

## Version bumps (only when source changes ship to npm)
- `cli/package.json` version +1
- `packages/create-growthub-local/package.json` version +1
- dep pin in create must match cli version exactly

## CI must pass before merge
- smoke, validate, verify — all 3 green
- Then: `node scripts/release-check.mjs` locally
- Then: merge, release workflow, confirm npm when packages ship
