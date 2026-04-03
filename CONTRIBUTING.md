# Contributing to Growthub Local

Growthub Local is open source and agent-native. Contributions from humans and AI agents follow the same pipeline.

---

## Quick rules

| Rule | Value |
|---|---|
| Branch prefix | `feat/` `fix/` `docs/` `chore/` `ci/` `refactor/` `adapter/` `sync/` |
| PR title | Conventional Commits: `type(scope): description` (min 10 chars after colon) |
| PR description | Required — min 20 chars, describe what and why |
| lockfile | Never commit `pnpm-lock.yaml` — CI owns it |
| Review | All PRs require maintainer approval (`@antonioromero1220`) |

---

## CI checks (all must pass)

| Check | What it verifies |
|---|---|
| `verify` | Freeze boundary exists, package manifests are valid, version pins are consistent |
| `validate` | Branch name, PR title format, description present, auto-labels PR type and agent vs human |
| `smoke` | Source contract tokens present in key files, version consistency across packages |

---

## What this repo owns

This repo is a **published slice** of the private monorepo. It contains:

- `cli/` — `@growthub/cli` (the `growthub` command)
- `packages/create-growthub-local/` — `create-growthub-local` installer
- `packages/shared/` — `@paperclipai/shared` types
- `server/` — `@paperclipai/server` core HTTP server
- `ui/` — Vite/React UI (GTM + DX surfaces)

It does **not** contain adapter packages, the DB package, or plugin infrastructure — those live in the private monorepo.

---

## Layer guide — where to make changes

| What you want to change | File location |
|---|---|
| Server behavior, API routes, agent execution | `server/src/` |
| GTM UI | `ui/src/gtm/` |
| DX UI | `ui/src/` (root App) |
| CLI commands | `cli/src/commands/` |
| Installer logic | `packages/create-growthub-local/bin/` |
| Shared types | `packages/shared/src/` |

---

## Canonical dev loop

Start backend and UI from source — this is the only default for feature development:

```bash
# Terminal 1
pnpm --dir server run dev:watch

# Terminal 2
pnpm --dir ui run dev
```

Open the surface you are testing:

```bash
# GTM
http://127.0.0.1:5173/gtm/<COMPANY_PREFIX>/workspace

# DX
http://127.0.0.1:5173/dx/...
```

Verify both are healthy before validating:

```bash
curl http://127.0.0.1:3101/api/health
curl http://127.0.0.1:5173/api/health
```

Run the pre-push gate before any push:

```bash
bash scripts/pr-ready.sh
```

---

## Submitting a PR

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/growthub-local
cd growthub-local

# 2. Create a branch
git checkout -b feat/your-feature

# 3. Make your changes

# 4. Run pre-push gate
bash scripts/pr-ready.sh

# 5. Commit and push
git commit -m "feat(server): add your change"
git push origin feat/your-feature
```

CI runs automatically. All 3 checks must pass. Once green, the maintainer reviews and merges.

---

## Agent-submitted PRs

AI agents (Claude, Codex, Cursor, etc.) can submit PRs directly. The pipeline auto-detects `[bot]` actors and applies the `agent-pr` label. Structure your commits and branch names the same way a human would — no special setup needed.

---

## After merge

When a PR merges to `main`, the pipeline automatically notifies the private monorepo to pull in the validated changes. The maintainer reviews the sync PR there before it lands in the private codebase. You don't need to do anything after your PR merges.

---

## Isolated worktrees

For a fully isolated environment with its own database, port, and session state:

```bash
# Create from current branch
growthub worktree:make my-feature

# Or from a specific start point
growthub worktree:make my-feature --start-point origin/feat/some-branch
```

Each worktree gets its own server port (3101+) and embedded Postgres instance. Your main instance stays untouched.

---

## Version bumps

Version bumps are only required when source behavior ships to npm:

- bump `cli/package.json`
- bump `packages/create-growthub-local/package.json`
- the dep pin in `create-growthub-local` must match the cli version exactly

Docs-only, config-only, or script-only changes do not require a bump.

---

## Release

Releases are triggered manually by the maintainer only. Contributing a feature does not automatically publish it — the maintainer controls when stable versions ship to npm.
