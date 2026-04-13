# Growthub Local

Growthub Local is the source-of-truth repo for the local Growthub runtime, the published CLI packages, the bundled worker kits, and the shared template library used by agent workflows.

This repository ships and documents:

- the local app runtime for `gtm` and `dx`
- the published CLI package `@growthub/cli`
- the installer package `create-growthub-local`
- bundled Growthub Agent Worker Kits
- the shared template library exposed through `growthub template`

## Install Paths

Choose the install path that matches the job you need to do.

### Full local app: GTM

```bash
npm create growthub-local@latest -- --profile gtm
```

Use this when you want the full Go-to-Market local surface.

### Full local app: DX

```bash
npm create growthub-local@latest -- --profile dx
```

Use this when you want the full Developer Experience local surface.

### CLI-only workflows

```bash
npm install -g @growthub/cli
```

Use this when you want CLI-first access to:

- local app discovery and onboarding
- worker kit discovery, inspection, export, and validation
- shared template browsing and extraction

## CLI Editions And User Flows

The shipped CLI has three top-level user flows. They are exposed in the interactive discovery hub and through direct commands.

### 1. Full Local App

This path is for installing or reopening a full local Growthub surface.

Entry points:

```bash
growthub
growthub list
growthub discover
growthub onboard
growthub run
```

User flow:

1. Open the discovery hub or call `create-growthub-local`.
2. Choose `Full Local App`.
3. Create a new `gtm` or `dx` profile, or load an existing local profile.
4. Complete onboarding and save config.
5. Start the local runtime.
6. Authenticate through the Growthub Connection flow and verify the bridge.

### 2. Worker Kits

This path is for exporting a working-directory-ready agent environment.

Entry points:

```bash
growthub list
growthub kit
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1
growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
```

User flow:

1. Browse or filter the bundled kit catalog.
2. Inspect the kit manifest and required paths.
3. Export the kit locally.
4. Point the agent `Working directory` at the exported folder.
5. Run the local adapter inside that exported environment.
6. Validate any modified or newly built kit before pushing.

### 3. Shared Templates

This path is for browsing and extracting reusable artifact primitives without exporting a full kit.

Entry points:

```bash
growthub template
growthub template list
growthub template list --type ad-formats
growthub template list --type scene-modules --subtype hooks
growthub template get villain-animation
growthub template get meme-overlay --out ~/kit/hooks
```

User flow:

1. Open the interactive template browser or use filtered list commands.
2. Narrow by family, artifact type, and subtype.
3. Preview the selected artifact.
4. Print it, copy it into a local workspace, or use the slug in another workflow.

## What Happens Next

### After a full local app install

1. Start the local app.
2. Open the `Growthub Connection` card.
3. Complete authentication in hosted Growthub.
4. Return to the local callback.
5. Use `Pulse` to verify the hosted bridge is live.

### After a worker-kit export

1. Locate the expanded export folder.
2. Point the agent `Working directory` at that folder.
3. Add any runtime-only environment variables the kit expects.
4. Start a new agent session so the kit entrypoint contract is loaded from `CLAUDE.md`.

### After pulling a shared template

1. Copy the artifact into the target workspace.
2. Adapt it to the specific kit, client, or output context.
3. If the artifact becomes a reusable primitive, freeze it back into the correct template library instead of duplicating ad hoc logic.

## Worker Kits

Growthub Agent Worker Kits are versioned, exportable agent environments.

Each kit can package:

- operating instructions and prompts
- templates and reusable working materials
- examples and calibration references
- output standards and expected structure
- runtime assumptions for local adapter execution

The current bundled kits are:

- `creative-strategist-v1`
- `growthub-email-marketing-v1`
- `growthub-open-higgsfield-studio-v1`

### How local adapters use worker kits

Local adapters such as Codex, Claude Code, Cursor, Gemini, and OpenCode run inside the configured agent `Working directory`.

That makes the current worker-kit runtime path:

1. Build or update a self-contained kit folder in `cli/assets/worker-kits/<kit-id>`.
2. Validate it with `growthub kit validate <path>`.
3. Export it with `growthub kit download <kit-id>` or resolve the folder with `growthub kit path <kit-id>`.
4. Point the agent `Working directory` at the expanded exported folder.
5. Run the local adapter inside that exported environment.

## Shared Templates

The shared template library is a separate CLI surface from worker kits.

Use shared templates when you need:

- reusable cross-kit artifact primitives
- a frozen library of ad formats or scene modules
- copyable building blocks that should not require a full kit export

The current shared template implementation lives in:

- `cli/assets/shared-templates/`
- `cli/src/templates/catalog.ts`
- `cli/src/templates/service.ts`
- `cli/src/commands/template.ts`

The rule is simple: shared templates stay generic and reusable; worker kits compose them into opinionated, working-directory-ready environments.

## Contributor Docs

- [Worker Kits Overview](./docs/WORKER_KITS.md)
- [Worker Kit Architecture](./docs/WORKER_KIT_ARCHITECTURE.md)
- [Worker Kit Contributor Guide](./docs/WORKER_KIT_CONTRIBUTOR_GUIDE.md)
- [Worker Kit Environment Examples](./docs/WORKER_KIT_ENVIRONMENT_EXAMPLES.md)
- [CLI Template Contribution Extension Workflows](./docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md)

## Development

Use the canonical local runtime control path from the repo root:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh status
scripts/runtime-control.sh stop
```

If the API is listening on `3101` instead of the script default, set `GH_SERVER_PORT` explicitly:

```bash
GH_SERVER_PORT=3101 scripts/runtime-control.sh up-main
```

Typical GTM URL:

```text
http://127.0.0.1:5173/gtm/<COMPANY_PREFIX>/workspace
```

Before pushing:

```bash
bash scripts/pr-ready.sh
```

## Contributing

Work from a feature branch or worktree, read source files before editing, and preserve the existing shipped runtime patterns.

Branch prefixes:

- `fix/`
- `feat/`
- `chore/`
- `refactor/`
- `docs/`
- `ci/`
- `test/`
- `perf/`
- `adapter/`
- `sync/`

PR checks:

- `smoke`
- `validate`
- `verify`

For the full contribution workflow, see [CONTRIBUTING.md](./CONTRIBUTING.md).
