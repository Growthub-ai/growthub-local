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
- `packages/model-training/` — Python orchestration for custom model training (Unsloth / verl / vLLM integration points)

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
| Custom model training (venv, manifests, RL/SFT hooks) | `packages/model-training/` + `bash scripts/setup-model-training-venv.sh` |
| SFT / manifest JSON contracts (no real data) | `data/schemas/` |

**Model-training install:** run **`bash scripts/setup-model-training-venv.sh`** from repo root; set **`GROWTHUB_PYTHON`** to the venv interpreter so **`growthub model:*`** / **`rl:*`** spawn the right Python. See **`packages/model-training/README.md`** for optional **`--with-unsloth`**, distilabel, and vLLM bundles.

---

## Canonical dev loop

**Default:** from the repo root, use **`scripts/runtime-control.sh`** so cleanup, env (`PAPERCLIP_CONFIG`, `PAPERCLIP_SURFACE_PROFILE=gtm`, `VITE_API_ORIGIN`), and branch checkout stay consistent:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

**Ports:** The script defaults `GH_SERVER_PORT=3100` and sets `VITE_API_ORIGIN` from it. The Vite dev proxy in `ui/vite.config.ts` otherwise defaults to **3101**. If your `pnpm --dir server run dev:watch` process listens on **3101**, run with `GH_SERVER_PORT=3101` so the UI hits the correct API.

**Anti-patterns for agents:** Do not run **`node scripts/worktree-bootstrap.mjs`**. Do not improvise raw `pnpm --dir server` + `pnpm --dir ui` as a substitute for **`scripts/runtime-control.sh`** unless a maintainer explicitly instructs you. Do not manually copy sources into **growthub-core** for validation.

Open the surface you are testing — for example GTM:

```text
http://127.0.0.1:5173/gtm/<COMPANY_PREFIX>/workspace
```

Verify health against the **same API port** you configured (`GH_SERVER_PORT` / your server config), for example:

```bash
curl "http://127.0.0.1:${GH_SERVER_PORT:-3100}/api/health"
curl http://127.0.0.1:5173/api/health
```

**Grounding:** Never treat prose or old PRs as semver truth — read **`docs/ARTIFACT_VERSIONS.md`** and the `package.json` files on your branch.

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

When **`@growthub/cli`** or **`create-growthub-local`** behavior that consumers rely on changes, bump and align in **one PR**:

- bump `cli/package.json` `version`
- bump `packages/create-growthub-local/package.json` `version`
- set `packages/create-growthub-local/package.json` `dependencies["@growthub/cli"]` to the **same** semver as the CLI

Pure documentation or repo-only hygiene that does **not** change published package behavior does not require a version bump — but the PR description should still say what stayed **out of scope** for npm so reviewers do not assume a release. See **`docs/ARTIFACT_VERSIONS.md`**.

---

## Release

Releases are triggered manually by the maintainer only. Contributing a feature does not automatically publish it — the maintainer controls when stable versions ship to npm.
