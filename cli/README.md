# @growthub/cli

`@growthub/cli` is the published CLI for Growthub Local. It covers five shipped user flows:

- full local app discovery and onboarding
- worker kit discovery, export, inspection, and validation
- shared template discovery and extraction
- hosted workflows, capabilities, dynamic pipelines, and artifacts
- hosted Growthub auth + machine profile bridge

## Install

```bash
npm install -g @growthub/cli
```

You can also install through the guided installer:

```bash
npm create growthub-local@latest
```

Or jump directly to a profile:

```bash
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx
```

## CLI Editions

The current CLI exposes five user-facing flows through `growthub discover` and direct subcommands.

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
growthub kit inspect growthub-postiz-social-v1
growthub kit inspect growthub-email-marketing-v1 --json

growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit download growthub-postiz-social-v1
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
| `growthub-geo-seo-v1` | studio | GEO + SEO audits via geo-seo-claude fork |
| `growthub-postiz-social-v1` | studio | Postiz (gitroomhq/postiz-app) social + AEO distribution workspace |

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

### 4. Hosted Workflows

Use this when you want CMS node contract discovery, dynamic hosted pipeline creation, and saved workflow lifecycle management.

```bash
growthub workflow
growthub workflow saved
growthub pipeline assemble
```

### 5. Hosted Auth Bridge

Use this when you want the hosted Growthub account to remain the top-level identity while syncing safe local-machine metadata into the CLI runtime.

```bash
growthub auth login
growthub auth whoami
growthub auth logout
growthub profile status
growthub profile pull
growthub profile push
```

Contract:

1. Hosted Growthub auth remains the source of truth for the user identity.
2. Local workspace config stays local-first and is not overwritten by hosted state.
3. Hosted machine linkage is stored separately from `instances/<id>/config.json`.
4. `growthub` and `paperclipai` remain intentional side-by-side surfaces rather than auto-loading one another.

## Workflows Discovery V1

The public CLI now supports a hosted workflow discovery flow inside the interactive hub for all Growthub Auth Users:

```bash
growthub discover
growthub workflow
growthub workflow saved
```

Use this when you want to:

- inspect CMS node contracts from the interactive contracts browser
- list hosted saved workflows and inspect detail
- create/save hosted workflows through Dynamic Pipelines
- execute a hosted saved workflow from the CLI
- manage workflow lifecycle actions (archive/delete) from CLI

The full public usage and architecture notes live here:

- [CLI Workflows Discovery V1](../docs/CLI_WORKFLOWS_DISCOVERY_V1.md)

## Contribution Model

The CLI has two extension surfaces for content:

- worker kits in `cli/assets/worker-kits/`
- shared templates in `cli/assets/shared-templates/`

Use shared templates for reusable cross-kit primitives. Use worker kits for full opinionated environments with prompts, standards, examples, and runtime assumptions.

For the agent-facing extension workflow, see [docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md](../docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md).

## Development Notes

- `@growthub/cli` version: `0.3.49`
- Node.js: `>=20`
- Source of truth repo: [Growthub Local](https://github.com/Growthub-ai/growthub-local)

## Links

- [GitHub README](https://github.com/Growthub-ai/growthub-local#readme)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
- [Growthub Authentication Bridge](https://github.com/Growthub-ai/growthub-local/blob/main/docs/GROWTHUB_AUTH_BRIDGE.md)
- [CLI Workflows Discovery V1](https://github.com/Growthub-ai/growthub-local/blob/main/docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Worker Kits](https://github.com/Growthub-ai/growthub-local/blob/main/docs/WORKER_KITS.md)
- [CLI Template Contribution Extension Workflows](https://github.com/Growthub-ai/growthub-local/blob/main/docs/CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md)
