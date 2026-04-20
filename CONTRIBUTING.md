# Contributing to Growthub Local

Growthub Local is open source and agent-native. Contributions from humans and AI agents follow the same quality gates.

---

## Product Grounding First

Before coding or documenting, align to the canonical model in `README.md`:

`repo / skill / starter / kit -> governed workspace -> customize safely -> sync safely -> optional hosted authority`

If your change conflicts with that model, fix the change or update the docs in the same PR.

---

## Quick Rules

- Branch prefixes: `feat/` `fix/` `docs/` `chore/` `ci/` `refactor/` `adapter/` `sync/`
- PR titles must follow Conventional Commits: `type(scope): description`
- PR description is required (explain what changed and why)
- Maintainer approval is required before merge

---

## Workflow Separation

### Contributor lane (default)

Most work belongs here:

1. implement scoped change
2. run local validation
3. open PR
4. pass CI
5. maintainer review + merge

### Maintainer lane (release/admin)

This is maintainer-owned:

- release timing and npm publication
- privileged operational governance

If your PR is feature/docs/bugfix scope, do not mix in release-admin changes.

---

## What This Repo Owns

Key surfaces:

- `cli/` — `@growthub/cli` (the `growthub` command)
- `packages/create-growthub-local/` — `@growthub/create-growthub-local` installer
- `packages/shared/` — shared runtime/types
- `server/` and `ui/` — local control-plane runtime surfaces

---

## Where To Make Changes

- CLI commands and discovery: `cli/src/commands/`, `cli/src/index.ts`
- Installer flow: `packages/create-growthub-local/bin/`
- Server behavior/API: `server/src/`
- UI behavior: `ui/src/`
- Shared contracts/types: `packages/shared/src/`

---

## Canonical dev loop

From repo root, use `scripts/runtime-control.sh`:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

If API is not on default port:

```bash
GH_SERVER_PORT=3101 scripts/runtime-control.sh up-main
```

Anti-patterns:

- do not run `node scripts/worktree-bootstrap.mjs` unless explicitly assigned
- do not replace the runtime script with ad-hoc server/UI loops as default
- do not rely on stale docs over source behavior

Run the pre-push gate before any push:

```bash
bash scripts/pr-ready.sh
```

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

# 5. Commit and push (example)
git commit -m "feat(server): add your change"
git push origin feat/your-feature
```

CI runs automatically. Once green, maintainer review controls merge.

---

## Agent-submitted PRs

AI agents (Claude, Codex, Cursor, etc.) can submit PRs directly. The pipeline auto-detects `[bot]` actors and applies the `agent-pr` label. Structure your commits and branch names the same way a human would — no special setup needed.

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

When published package behavior changes, bump and align in one PR:

- bump `cli/package.json` `version`
- bump `packages/create-growthub-local/package.json` `version`
- set `packages/create-growthub-local/package.json` `dependencies["@growthub/cli"]` to the **same** semver as the CLI

Docs-only changes do not require a package bump.

---

## Release

Releases are maintainer-triggered. Contributor PRs do not publish npm artifacts automatically.
