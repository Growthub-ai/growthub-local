# @growthub/cli

`@growthub/cli` is the published CLI for Growthub Local. It covers three shipped workflows:

- full local app discovery and onboarding
- worker kit discovery, export, inspection, and validation
- shared template discovery and extraction

## Install

```bash
npm install -g @growthub/cli
```

You can also install through the guided installer:

```bash
npx create-growthub-local
```

Or jump directly to a profile:

```bash
npx create-growthub-local --profile gtm
npx create-growthub-local --profile dx
```

## CLI Editions

The current CLI exposes three user-facing editions through `growthub discover` and direct subcommands.

### 1. Full Local App

Use this when you want to create or reopen a full Growthub local surface.

```bash
growthub
growthub list
growthub discover
growthub onboard
growthub run
```

User flow:

1. Open the discovery hub.
2. Choose `Full Local App`.
3. Create a new `gtm` or `dx` profile, or load an existing local profile.
4. Complete onboarding.
5. Start the local server and finish the hosted authentication bridge.

### 2. Worker Kits

Use this when you want a working-directory-ready environment for an agent.

### Discovery

```bash
# Interactive discovery hub
growthub list

# Interactive browser — type filter → kit selector → actions
growthub kit

# All kits grouped by family with descriptions and inline commands
growthub kit list

# Filter by family
growthub kit list --family studio
growthub kit list --family studio,operator

# Machine-readable output
growthub kit list --json

# Family taxonomy
growthub kit families
```

### Inspect, download, and validate

```bash
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1
growthub kit inspect growthub-email-marketing-v1 --json

growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit download higgsfield --yes

growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
```

### After download

1. Point Growthub local or your local adapter `Working directory` at the exported folder.
2. Add runtime-only environment variables required by the kit.
3. Start a new session so the operator contract loads from `CLAUDE.md`.

### Available bundled kits

| Kit | Family | Description |
|---|---|---|
| `creative-strategist-v1` | workflow | Video creative briefs and campaign strategy |
| `growthub-email-marketing-v1` | operator | Brand-aware email campaigns, sequences, and campaign planning |
| `growthub-open-higgsfield-studio-v1` | studio | Open Higgsfield visual production workflows |

### How local adapters use worker kits

Local adapters execute inside the agent `Working directory` path. Worker kits are designed to plug into that path directly:

1. `growthub kit download <id>` exports the kit as a folder plus zip.
2. Point the agent `Working directory` at the exported folder.
3. Start a new session so the agent reads the kit contract from `CLAUDE.md`.

### 3. Shared Templates

Use this when you need a reusable artifact primitive without exporting a full kit.

```bash
growthub template
growthub template list
growthub template list --type ad-formats
growthub template list --type scene-modules --subtype hooks
growthub template get villain-animation
growthub template get meme-overlay --out ~/kit/hooks/
growthub template get villain-animation --json
```

User flow:

1. Browse by family and artifact group.
2. Preview the selected artifact.
3. Print it, copy it to a local workspace, or use the slug in another workflow.

## Contribution Model

The CLI has two extension surfaces for content:

- worker kits in `cli/assets/worker-kits/`
- shared templates in `cli/assets/shared-templates/`

Use shared templates for reusable cross-kit primitives. Use worker kits for full opinionated environments with prompts, standards, examples, and runtime assumptions.

For the agent-facing extension workflow, see [docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md](../docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md).

## Development Notes

- `@growthub/cli` version: `0.3.45`
- Node.js: `>=20`
- Source of truth repo: [Growthub Local](https://github.com/Growthub-ai/growthub-local)

## Links

- [GitHub README](https://github.com/Growthub-ai/growthub-local#readme)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
- [Worker Kits](https://github.com/Growthub-ai/growthub-local/blob/main/docs/WORKER_KITS.md)
- [CLI Template Contribution Extension Workflows](https://github.com/Growthub-ai/growthub-local/blob/main/docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md)
