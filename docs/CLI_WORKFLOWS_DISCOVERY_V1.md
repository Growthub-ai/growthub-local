# CLI Workflows Discovery V1

This document is the public source of truth for the `@growthub/cli` workflow discovery extension now shipped in `growthub-local`.

It covers:

- how to use the workflows surface from the public CLI
- what the hosted bridge does
- what is supported in V1
- how the Discovery CLI maps to hosted Growthub execution

## What This Extension Adds

The CLI now exposes a first-class `Workflows` surface inside the interactive discovery hub.

That surface is designed for a hosted-authenticated Growthub user who wants to:

- browse their hosted saved workflows
- browse workflow templates
- assemble and save a new hosted workflow from a template
- execute a saved hosted workflow from the CLI
- see loading, progress, completion, summary, artifacts, and credits in the terminal

This is not a separate workflow engine. The CLI is a hosted bridge into the existing Growthub workflow runtime.

## How To Use It

Install the public CLI:

```bash
npm install -g @growthub/cli
```

Open the discovery hub:

```bash
growthub discover
```

Connect your hosted account if needed:

```bash
growthub auth login
```

Then enter:

```text
Discovery -> Workflows
```

Inside `Workflows`, V1 supports:

- `Saved Workflows`
- `Templates`
- `Dynamic Pipelines`

## Supported V1 Flows

### 1. Saved Workflows

Use this when the workflow already exists in hosted Growthub under the authenticated user.

Supported behavior:

- list hosted saved workflows
- load workflow detail
- show node count and metadata
- require double confirmation before execution
- execute the saved workflow through the hosted runtime
- show pre-init loading state
- show execution progress
- show final summary
- show credits after execution

### 2. Templates

Use this when you want to create a hosted workflow from a built-in template.

Supported behavior:

- browse template families from the CLI
- inspect template metadata and input shape
- assemble a single-node hosted workflow from the template
- save that workflow through the hosted workflow bridge

The current public template path is built around the shipped built-in catalog in the CLI so the public UX stays deterministic even when unrelated hosted catalog surfaces are unavailable.

### 3. Dynamic Pipelines

Use this when you want to assemble a pipeline interactively and execute it through the hosted runtime.

This path is available from the same workflow surface but is a separate authoring flow from template-backed saved workflows.

## How It Works

The public CLI does four things:

1. It authenticates the user against hosted Growthub.
2. It fetches hosted workflow metadata for that user.
3. It turns CLI selections into the hosted workflow config / execution payload shape.
4. It executes through the canonical hosted runtime and prints the results back into the terminal.

The CLI does not own workflow truth. Hosted Growthub does.

## Hosted Bridge Contract

The V1 workflow discovery path uses these hosted surfaces:

- `GET /api/cli/session`
- `GET /api/cli/profile?view=workflows`
- `GET /api/cli/profile?view=workflow&workflowId=<id>`
- `POST /api/cli/profile?action=save-workflow`
- `GET /api/cli/profile?view=credits`
- `POST /api/execute-workflow`
- hosted browser login at `/cli/login`

At a high level:

1. `growthub auth login` opens hosted `/cli/login`.
2. Hosted auth completes in the browser and returns the CLI bearer session.
3. The CLI uses that session to fetch workflow list/detail data.
4. The CLI can save a workflow config through the hosted profile bridge.
5. The CLI executes workflows through the canonical hosted workflow runtime.
6. The terminal prints progress, summary, artifact IDs, and credits.

## V1 UX Guarantees

For the workflow execution path, the CLI now guarantees:

- explicit confirmation before hosted execution
- a second confirmation when credits may be spent
- a loading state before the first streamed workflow event arrives
- progress rendering during execution
- final completion output on success
- final surfaced failure output on error
- summary and credits output after completion

## Output And Persistence Model

The CLI is only the invoking surface. Hosted Growthub remains the persistence layer.

That means successful workflow runs are expected to persist through hosted Growthub’s normal workflow storage and message surfaces, including:

- workflow run records
- user-visible artifacts
- chat message persistence
- structured `ui_message_parts`

This is the same direction as GH Max mode: CLI execution should be terminal-visible and also hosted-visible.

## V1 Supported Template Families

The public workflow template surface currently covers these shipped families:

- image
- video
- slides
- text
- research
- vision

The exact template inventory is determined by the current built-in CLI catalog and the hosted runtime support behind each node slug.

## Commands You’ll Actually Use

```bash
growthub discover
growthub workflow
growthub workflow templates
growthub workflow saved
growthub pipeline
growthub auth login
growthub auth whoami
```

## Validation Status

The V1 workflow discovery extension has been validated for:

- discovery hub entry into `Workflows`
- saved workflow list loading
- saved workflow detail loading
- saved workflow execution
- template-backed hosted workflow save
- loading/progress/completion states
- summary and credits reporting

## Public Positioning

If you are using the public CLI package, the correct mental model is:

- the CLI is the portable terminal surface
- hosted Growthub is the workflow source of truth
- the workflow discovery extension gives terminal access to hosted saved workflows and template-backed hosted execution without requiring the user to leave the CLI for the run itself

