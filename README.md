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

## Worker Kits

Growthub Agent Worker Kits package specialized local working environments for agents.

Each kit is a versioned folder-based package that can include:

- instructions and prompts
- templates and examples
- output standards
- required supporting files
- runtime assumptions for local adapter execution

The CLI currently provides a local export and validation surface for these packages.

- `growthub kit list`
- `growthub kit inspect <kit-id>`
- `growthub kit download <kit-id> [--out <path>]`
- `growthub kit path <kit-id> [--out <path>]`
- `growthub kit validate <path>`

In the current model, an exported kit is used by pointing an agent `Working directory` at the expanded folder and running a local adapter inside it.

The first bundled kit is `creative-strategist-v1`. The same packaging model can also be used for other environment types such as email marketing, browser-heavy GTM workflows, research/sourcing workflows, and local production environments such as motion or Remotion-based workflows.

### Worker Kits Glossary

- `Worker Kit`: a versioned local environment package for a specialized agent workflow
- `Kit contract`: the manifest and bundle metadata that define package identity, payload boundary, and export shape
- `Environment package`: the full working context, including prompts, templates, examples, standards, and runtime assumptions
- `Activation`: exporting the kit and running a local adapter inside the expanded folder through `Working directory`

### Worker Kits Navigation

- [Overview and source of truth](./docs/WORKER_KITS.md)
- [Architecture](./docs/WORKER_KIT_ARCHITECTURE.md)
- [Contributor guide](./docs/WORKER_KIT_CONTRIBUTOR_GUIDE.md)
- [Environment examples](./docs/WORKER_KIT_ENVIRONMENT_EXAMPLES.md)

## Development

This repository is the dedicated home for the local runtime product boundary. Hosted Growthub application code lives separately.

### Browser agents

GTM browser agents are validated through the issue-assignment heartbeat path, not through a free-run browser invoke.

The shipped runtime contract is:

- create a real issue
- assign it to the browser agent
- let heartbeat wake the assignee with issue context
- validate with `scripts/observability/tail-run.sh` and GTM `workspace-config`

Browser separation is injected at runtime through `paperclipBrowserIsolation`, including the default rule that browser work starts in the agent's own separate browser context.

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

### Observability

Use the built-in observability scripts when validating browser-agent behavior:

```bash
bash scripts/observability/watch-agents.sh <company-id> --today
bash scripts/observability/tail-run.sh <agent-prefix>
bash scripts/observability/tail-run.sh <agent-prefix> <run-prefix>
```

For the frozen validated browser-agent isolation state, see [docs/FROZEN_GTM_BROWSER_AGENT_ISOLATION_STATE.md](./docs/FROZEN_GTM_BROWSER_AGENT_ISOLATION_STATE.md).

### Isolated worktrees

For isolated development environments with their own database, port, and session state:

```bash
growthub worktree:make my-feature
```

Each worktree gets its own server port (3101+) and embedded Postgres instance. Your main instance stays untouched.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

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
