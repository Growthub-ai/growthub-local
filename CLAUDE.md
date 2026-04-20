# growthub-local — Repo Agent Rules

This file is the repo-specific agent contract for `growthub-local`.

## Required grounding

Before changing repo docs or instructions, read:

- `AGENTS.md`
- `README.md`
- `scripts/runtime-control.sh`
- `cli/src/index.ts`

Use `cli/src/commands/` when a command surface needs more detail than the top-level help text.

## Core rules

1. Work in a feature branch or git worktree, not on `main`.
2. Treat `scripts/runtime-control.sh` as the canonical source-dev runtime path.
3. Keep repo agent docs focused on agent workflow and current CLI discovery.
4. Replace stale instructions directly instead of layering patches on top of old prose.
5. Do not invent discovery options or command paths that the current repo does not ship.

## Documentation lane split

Keep docs and instructions separated by lane:

- CLI/open-source lane: user features, discovery UX, command behavior, contribution flow
- maintainer/super-admin lane: merge governance, release orchestration, npm publication steps

Paperclip/admin operational scripts are lower priority unless the task explicitly targets them.

## Canonical runtime

Use:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Current runtime facts from source:

- `GH_SERVER_PORT` defaults to `3100`
- `GH_UI_PORT` defaults to `5173`
- the UI is started with `VITE_API_ORIGIN=http://127.0.0.1:${GH_SERVER_PORT}`
- the server runs in `dev:watch`

If the API is really on `3101`, set `GH_SERVER_PORT=3101` when starting the runtime.

## Current CLI discovery surface

The only documented discovery entrypoint for this repo is:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

Current discovery options:

- `Worker Kits`
- `Templates`
- `Workflows`
- `Local Intelligence`
- `Agent Harness` (filter by type: Paperclip Local App, Open Agents, Qwen Code CLI, T3 Code CLI)
- `Settings` (contains: Connect Growthub Account, GitHub Integration, Fork Sync Agent, Service Status, Custom Workspace Starter, Fleet Operations)
- `Help CLI`

If repo docs mention discovery, they should use that command path and reflect this structure.

## Anti-patterns

- Do not run `node scripts/worktree-bootstrap.mjs`.
- Do not manually copy `ui/src` or `server/src` into `growthub-core`.
- Do not describe raw two-terminal dev loops as the repo default when `scripts/runtime-control.sh` is the documented control surface.
- Do not leave old discovery menus or old command lists in repo docs after the source changes.

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
