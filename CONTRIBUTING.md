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
| Server behavior, API routes, migrations | `server/src/` |
| GTM UI | `ui/src/gtm/` |
| DX UI | `ui/src/` (root App) |
| CLI commands | `cli/src/commands/` |
| Installer logic | `packages/create-growthub-local/bin/` |
| Shared types | `packages/shared/src/` |

---

## Submitting a PR

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/growthub-local
cd growthub-local

# 2. Create a branch
git checkout -b feat/your-feature

# 3. Make your changes

# 4. Commit with conventional format
git commit -m "feat(server): add your change"

# 5. Push and open PR
git push origin feat/your-feature
```

CI runs automatically. All 3 checks must pass. Once green, the maintainer reviews and merges.

---

## Agent-submitted PRs

AI agents (Claude, Codex, Cursor, etc.) can submit PRs directly. The pipeline auto-detects `[bot]` actors and applies the `agent-pr` label. No special setup needed — structure your commits and branch names the same way a human would.

---

## After merge

When a PR merges to `main`, the pipeline automatically notifies the private monorepo to pull in the validated changes. The maintainer reviews the sync PR there before it lands in the private codebase. You don't need to do anything after your PR merges.

---

## Worktree development

For isolated testing with its own database, ports, and runtime:

```bash
# Create an isolated worktree from current branch
growthub worktree:make my-feature

# Or from a specific start point
growthub worktree:make my-feature --start-point origin/feat/some-branch
```

This creates a git worktree, installs dependencies, seeds an isolated database, and runs the bootstrap pipeline. Each worktree gets its own server port (3101+) so it doesn't interfere with your main instance.

### Testing PR changes in browser

The bootstrap script automates the full PR → browser pipeline:

```bash
cd your-worktree
node scripts/worktree-bootstrap.mjs
```

**What it does:**

1. Validates worktree identity (`.paperclip/config.json`, `.git`, `cli/dist`)
2. Detects changed files vs `origin/main`
3. If `GROWTHUB_CORE_PATH` is set: syncs `ui/src/` and `server/src/` changes to the build environment, rebuilds the UI via vite, and swaps the built assets into `cli/dist/runtime/server/ui-dist/`
4. Clears stale session state
5. Starts the server on the worktree's configured port
6. Opens the browser to the GTM/DX surface

**Environment variables:**

| Variable | Purpose |
|---|---|
| `GROWTHUB_CORE_PATH` | Path to a local build environment with vite/esbuild toolchain. Required for UI rebuilds from source. |

Without `GROWTHUB_CORE_PATH`, the bootstrap uses the existing pre-built `cli/dist` — useful for testing server-only changes or validating the current shipped UI.

### Pre-push validation

Before pushing any branch:

```bash
bash scripts/pr-ready.sh
```

This validates worktree location, branch naming, remote origin, version sync, dist artifacts, and release contracts in one shot.

---

## Release

Releases are triggered manually by the maintainer only. Contributing a feature does not automatically publish it — the maintainer controls when stable versions ship to npm.
