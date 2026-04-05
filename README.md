# Growthub Local

Local Growthub runtime for DX and Go-to-Market.

`Growthub Local` is the installable local product that runs on a user's machine and connects back to the hosted Growthub app.

It owns:

- the GTM local surface
- the DX local surface
- the local CLI
- the local server
- the local UI
- the local installer packages

## Install

For Go-to-Market:

```bash
npm create growthub-local@latest -- --profile gtm
```

For DX:

```bash
npm create growthub-local@latest -- --profile dx
```

## What Happens Next

1. Install the local app from npm.
2. Launch the local app.
3. Open the `Growthub Connection` card.
4. Click `Open Configuration`.
5. Complete authentication in hosted Growthub.
6. Return to the local app callback.
7. Use `Pulse` to verify the hosted bridge is live.

## Profiles

- `gtm`: local Go-to-Market surface
- `dx`: local DX tool surface

## Packages

This repo is the source of truth for:

- `@growthub/cli`
- `create-growthub-local`

## Development

This repository is the dedicated home for the local runtime product boundary. Hosted Growthub application code lives separately.

### Canonical dev loop

Use **`scripts/runtime-control.sh`** from the repo root — one deterministic path for humans and agents (stops stale processes, optionally syncs the target git branch, starts **server `dev:watch` + Vite** with your Paperclip config):

```bash
scripts/runtime-control.sh up-main
# or: scripts/runtime-control.sh up-branch <branch>
# or: scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh status
scripts/runtime-control.sh stop
```

Set **`GH_SERVER_PORT`** to match the port your API actually listens on if it differs from the script default (see `CONTRIBUTING.md`). Then open the surface you are testing, for example GTM:

```text
http://127.0.0.1:5173/gtm/<COMPANY_PREFIX>/workspace
```

Published semver for `@growthub/cli` and the installer is defined only in **`cli/package.json`** and **`packages/create-growthub-local/package.json`** — see **`docs/ARTIFACT_VERSIONS.md`**.

### Pre-push gate

Before pushing any branch:

```bash
bash scripts/pr-ready.sh
```

Validates branch naming, remote origin, version consistency, dist artifacts, and release contracts in one shot.

### Isolated worktrees

For isolated development environments with their own database, port, and session state:

```bash
growthub worktree:make my-feature
```

Each worktree gets its own server port (3101+) and embedded Postgres instance. Your main instance stays untouched.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

### Custom model training (local)

Optional **Python** stack for Gemma/Unsloth/verl/vLLM-style workflows: install with **`bash scripts/setup-model-training-venv.sh`**, then **`export GROWTHUB_PYTHON`** to the venv’s `python3`. CLI: **`growthub model:bootstrap`**, **`growthub model:train`**, **`growthub rl:grpo`**, **`growthub agent:reason`** (OpenAI-compatible HTTP). Details and requirement bundles: **`packages/model-training/README.md`**.

## Contributing

Growthub Local is open source and built to be extended — by humans and AI agents alike.

```bash
# Fork this repo, then:
git checkout -b feat/your-feature
# make changes
git commit -m "feat(server): your change"
git push origin feat/your-feature
# open a PR — CI runs automatically
```

**Branch prefixes:** `feat/` `fix/` `docs/` `chore/` `ci/` `refactor/` `adapter/` `sync/`

**PR titles:** must follow [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): description`

**All PRs require** passing CI (`verify` + `validate` + `smoke`) and maintainer review before merge. Agent-submitted PRs are fully supported — the pipeline auto-detects bot actors and labels them `agent-pr`.

See [**CONTRIBUTING.md**](./CONTRIBUTING.md) for the full workflow.
