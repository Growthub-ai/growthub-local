# growthub-local — Agent Workflow

This file defines the repo-level workflow for agents working in `growthub-local`.

## Scope

This repo-level agent file should stay focused on:

- how agents work in this repo
- which files are the source of truth
- how the local runtime is started
- how the current CLI discovery surface is organized

If a section drifts into stale release notes, old package folklore, or side-runbooks that are not part of the current agent workflow, replace it.

## Frozen architecture snapshot

The current repo documentation baseline is frozen to this shipped workflow split:

- CLI feature/docs flow: discovery UX, commands, and contributor-facing behavior
- maintainer/super-admin flow: release timing, npm publication, and admin-only merge governance

Do not blend these lanes in routine feature/docs updates.

## Source of truth

For current behavior, read these files before editing docs or instructions:

- `scripts/runtime-control.sh`
- `cli/src/index.ts`
- `cli/src/commands/`
- `README.md`
- `CLAUDE.md`

If older prose conflicts with those files, the source files win.

## Before any work

- Work in a feature branch or worktree, never directly on `main`.
- Read the files you are about to change before editing them.
- Replace stale guidance directly instead of stacking corrections on top of it.

## Canonical runtime

From the repo root, use:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Current runtime facts from source:

- the script starts `server` in `dev:watch`
- the script starts the Vite UI
- `GH_SERVER_PORT` defaults to `3100`
- `GH_UI_PORT` defaults to `5173`
- the UI is started with `VITE_API_ORIGIN=http://127.0.0.1:${GH_SERVER_PORT}`

If the API is actually listening on `3101`, start the runtime with:

```bash
GH_SERVER_PORT=3101 scripts/runtime-control.sh up-main
```

Typical GTM URL:

```text
http://localhost:5173/gtm/GHA/workspace
```

## CLI discovery

The only documented discovery entrypoint for this repo is:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

That discovery hub exposes these user-facing paths:

- `Agent Harness` (filter by type: Paperclip Local App, Open Agents)
- `Worker Kits`
- `Templates`
- `Workflows`
- `Local Intelligence`
- `Connect Growthub Account`
- `Help CLI`

If repo docs describe discovery, they should use that command path and match this current surface.

## Anti-patterns

- Do not replace `scripts/runtime-control.sh` with an ad-hoc `pnpm --dir server` plus `pnpm --dir ui` loop unless a maintainer explicitly tells you to.
- Do not run `node scripts/worktree-bootstrap.mjs`.
- Do not manually copy code into `growthub-core`.
- Do not leave stale command lists in place once the source says otherwise.

## Worktrees

When you need an isolated local environment, use:

```bash
growthub worktree:make my-feature
```

Do not improvise bootstrap steps around `worktree-bootstrap.mjs`.

## Before pushing

Run:

```bash
bash scripts/pr-ready.sh
```

## Guardrails

Before destructive git operations, run:

```bash
bash scripts/guard.sh check-command "<command>"
```
