# Growthub Local — Local Agent Handoff

This file is the persistent agent handoff for this repository.

It exists so future agents have the right mental model before touching code or docs. Keep it aligned with `README.md`, `AGENTS.md`, and the current source.

Public source of truth remains:

1. `README.md`
2. `AGENTS.md`
3. `cli/src/index.ts`
4. `cli/src/commands/`
5. `scripts/runtime-control.sh`
6. focused docs in `docs/`
7. current package manifests

Current package grounding must always be read from:

- `cli/package.json`
- `packages/create-growthub-local/package.json`
- `packages/api-contract/package.json`
- `docs/ARTIFACT_VERSIONS.md`

As of this branch, the local package manifests show:

- `@growthub/cli@0.9.17`
- `@growthub/create-growthub-local@0.5.17`
- create package pin: `@growthub/cli@0.9.17`
- `@growthub/api-contract@1.3.0-alpha.2`

Never cite semver from memory.

## The Holistic Product Reality

Growthub Local is the reference implementation of Agent Workspace as Code (AWaC).

AWaC means the workspace is the owned artifact. It is not just a dashboard, a repo clone, a prompt pack, an integration list, a workflow runner, or a no-code UI. It is the complete operating envelope:

- source import
- forkable app
- `growthub.config.json`
- Workspace Builder
- governed Data Model
- integration primitives
- resolver extension point
- worker kits
- agent-readable contracts
- helper scripts
- workflow and pipeline surfaces
- fork policy
- lifecycle trace
- runtime/deploy checks
- optional hosted authority

The key is fusion. None of those primitives alone is the product. AWaC emerges when they move together as one governed workspace artifact that can be customized locally, exported, deployed, forked, audited, repaired, and optionally connected to hosted authority.

## Canonical Mental Model

Growthub Local turns a repo, skill, starter, kit, or template into a governed AI workspace that can be operated by humans and agents.

Canonical path:

1. Discover source.
2. Create or export Workspace.
3. Register fork.
4. Customize through the builder, config, CLI, or agent primitives.
5. Operate and deploy through checks.
6. Sync/heal safely over time.
7. Optionally connect hosted authority.

Do not frame Growthub Local as only:

- a dashboard builder
- a data governance tool
- a worker-kit downloader
- a CLI menu
- a hosted integration bridge
- a fork-sync utility
- a starter kit

All of those are surfaces inside the larger AWaC architecture.

## The DevOps Analogy

AWaC is the DevOps layer for AI workspaces.

The underlying business pressure is the same pattern that made DevOps necessary for apps:

- **Scale:** teams cannot manually set up reliable environments for every agent, operator, client, repo, and workflow.
- **Security and governance:** teams must know what an agent can touch, what it cannot touch, and where that policy lives.
- **Reliability:** when an agent workflow fails, the exact environment must be reconstructible so humans can debug what happened.

Growthub Local answers with a portable governed workspace artifact. The same artifact can run locally, be inspected by agents, be customized by non-technical operators, be exported as a deployable app, and carry policy/trace across the lifecycle.

## Audience Utility

Future agents must preserve the fact that the same AWaC substrate serves different audiences at different depth.

For non-technical users:

- Growthub Local gives them a real workspace they can open, customize, trust, hand off, and deploy without wiring repos, scripts, credentials, prompts, and integrations by hand.
- The no-code dashboard is not cosmetic. It is the visible admin surface over governed primitives.

For builders and no-code innovators:

- A repo, skill, starter, template, or worker kit can become a working product surface.
- The builder gives dashboards, tabs, widgets, templates, settings, import/export, and Data Model editing without losing the upgrade path.

For agents and operators:

- The CLI, JSON output, `AGENTS.md`, `SKILL.md`, helper scripts, session memory, self-eval loops, and trace give agents a legible operating contract.
- Agents should not guess from loose folders or prompt history. They should read the workspace artifact and its contracts.

For enterprise developers:

- The value is local-first flexibility plus fork safety, deploy checks, credential boundaries, audit trace, and optional hosted authority.
- Hosted authority is additive; it does not replace local ownership.

## Architecture Primitives

Treat these as fused layers, not independent products.

### 1. Source Import Layer

Inputs:

- GitHub repositories
- skills.sh skills
- starters
- worker kits
- templates

The source import path must lead into the same governed workspace lifecycle. Do not create divergent one-off paths that bypass fork registration, policy, trace, or the starter-derived workspace model.

### 2. Governed Workspace Artifact

The artifact is the portable unit:

- Next.js app surface
- `growthub.config.json`
- `.growthub-fork/`
- workspace-local docs and helpers
- optional `authority.json`

The workspace artifact is the thing users own. Discovery indexes, CLI homes, hosted accounts, and generated outputs support it; they are not the canonical product object.

### 3. Builder + Data Model

The Workspace Builder is the no-code super-admin surface over the artifact.

It manages:

- dashboards
- tabs
- widgets
- templates
- settings
- import/export
- Data Model objects
- integration records
- tested source records
- widget bindings

The Data Model is not an isolated feature. It is how the workspace gives business objects, integration objects, and widget-consumable data the same governed shape.

The shipped custom workspace starter now includes `objectType: "sandbox-environment"` in this same governed surface. Treat it as AWaC runtime configuration for local/serverless execution, not as a widget source and not as a separate parallel model.

### 4. Capability Layer

Capabilities include:

- worker kits
- templates
- workflows
- pipeline assembly/execution
- local intelligence
- Open Agents
- Qwen Code
- T3 Code
- memory and knowledge surfaces
- skills and helper scripts

These are not random utilities. They plug into the workspace so agents and humans operate through consistent primitives.

### 5. Integration Layer

This is the most important nuance to preserve.

The real architectural breakthrough is not "we added API integrations." The breakthrough is that Growthub Local added a governed primitive for integration.

The opinion is:

> Do not add API connections beside the workspace. Make the API connection itself a first-class governed business object: typed, testable, relatable, credential-safe, and composable like every other Data Model object.

That means integration is represented through:

- API Registry objects
- Data Source objects
- hard test-before-bind gates
- server-side credential resolution
- resolver drop-zone extension files
- sidecar source records
- widget source picker status gating

### 6. Operations Layer

Operations are JSON-first and agent-legible:

- `growthub workspace status --json`
- QA checks
- deploy checks
- Vercel env output
- upstream/fork checks
- surface detection
- portal preparation
- fork sync/heal previews

These checks let the same artifact move across local runtime, deployment prep, and ongoing maintenance without losing continuity.

### 7. Authority Layer

Hosted authority is optional and additive.

It may provide:

- Growthub account identity
- bridge-backed connections
- MCP accounts
- hosted agents
- CMS pipeline execution
- signed fork authority
- capability activation

Do not make hosted SaaS mandatory for local value. Do not collapse hosted authority into local config. Do not store provider secrets in the browser workspace config.

## Governed Integration Primitive

This is the part future agents must not flatten.

The architecture deliberately splits integration into two governed object types:

1. **API Registry** — how to call or resolve a provider.
2. **Data Source** — what tested business data widgets may consume.

The split matters because it creates a real foreign-key relationship inside the workspace model.

Current grounded files:

- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-data-model.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/page.jsx`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/test-source/route.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/refresh-sources/route.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/integrations/source-resolver-registry.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/integrations/resolver-loader.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/docs/data-sources-api-registry.md`

The Data Source record has `registryId`.

`registryId` is not a raw URL field. In the Data Model UI it must behave as a governed reference to existing `api-registry` objects. That means the user should select a registry row that exists in the same workspace config, not type an arbitrary string and hope it lines up.

This is the architectural meaning of "opinionated":

- It is not a UI preference.
- It is a structural constraint.
- Incorrect configurations should become difficult or impossible because the schema and UI guide the user into valid relationships.

## Integration Invariants

Preserve these invariants:

- API Registry records define callable provider/resolver configuration.
- Data Source records define tested data a widget can consume.
- Data Source `registryId` references API Registry `integrationId`.
- `authRef` is a named secret reference only.
- Provider credentials resolve server-side through env, adapters, or bridge authority.
- Browser config never stores provider tokens.
- Data Sources must be tested before widget binding.
- Widget source picker should only expose Data Source rows with trusted statuses such as `connected`, `approved`, `ok`, or `success`.
- Live records are written to `growthub.source-records.json` sidecar storage, not embedded into `growthub.config.json`.
- Resolver files live in the drop-zone and compose additively without modifying governed core files.
- Resolver additions must be fork-sync safe.

If a future implementation weakens any of those invariants, it is probably breaking AWaC.

## Sandbox Environment Primitive

Sandbox Environment is the governed execution-environment object inside `dataModel.objects[]`.

Grounded files:

- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-data-model.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/page.jsx`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-adapters/route.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/sandboxes/default-local-agent-host.js`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/docs/sandbox-environment-primitive.md`

Preserve these invariants:

- Sandbox rows are config-backed governed records, not new storage primitives.
- `instructions` travel with `prompt` into the local adapter handoff.
- `runLocality=local` executes through local adapters such as `local-agent-host`.
- `runLocality=serverless` delegates through an API Registry scheduler reference.
- `envKeyRefs[]` store named server-side references only; secrets never move into browser config.
- `lifecycleStatus` and `version` support draft/live and previous-configuration UX without forking object type behavior.
- `lastRunId`, `lastSourceId`, `lastResponse`, and status fields are observable run state written back after execution.
- Normalized sandbox run output belongs in source-record sidecar storage with a source type accepted by the workspace source system.
- Sandbox Environment rows are not directly bindable View widget sources; users consume normalized tested output through source records and governed references.

The Codex thin local adapter syntax is intentionally explicit:

```text
codex exec --skip-git-repo-check --sandbox read-only -
```

Do not replace that handoff with a shell-specific one-off. The adapter owns command construction and stdin payload assembly.

## Resolver Drop-Zone

The resolver drop-zone is the extension model for provider-specific logic.

Grounded files:

- `lib/adapters/integrations/resolvers/README.md`
- `lib/adapters/integrations/source-resolver-registry.js`
- `lib/adapters/integrations/resolver-loader.js`

Operators add local resolver files for Asana, Linear, HubSpot, custom APIs, BYO token endpoints, webhooks, or anything else.

Resolver files register provider behavior server-side. The browser sees normalized metadata and tested rows, not secrets and not provider-specific imperative logic.

This is why extensibility can be infinite without corrupting governed workspace files.

## Source Records Sidecar

Live data records should not bloat or destabilize `growthub.config.json`.

The governed config stores shape, references, and relationships. Runtime source records belong in sidecar storage keyed by stable source IDs.

Grounded schema concepts:

- `sourceStorage: "workspace-source-records"`
- `sourceId`
- `growthub.source-records.json`

Keep config as the contract. Keep fetched/live records as data.

## Builder Mental Model

The Workspace Builder is the super-admin control surface for AWaC.

It is not only a dashboard UI. It is how non-technical users directly operate the same primitives that agents and developers use through files and CLI commands.

Builder changes must preserve:

- validated `PATCH /api/workspace` saves
- schema-backed config mutation
- dashboard/tab/widget identity stability
- Data Model object separation
- integration credential boundary
- test-before-bind workflow
- import/export compatibility
- no fabricated provider data
- no hidden token storage

If a UI change bypasses the governed model, it is architectural debt even if it looks easier.

## CLI Mental Model

The CLI is the local executor and lifecycle control plane.

It is responsible for:

- discovery
- starter/kit export
- workspace creation
- fork registration
- fork inspection
- fork sync/heal
- worker kit operations
- workflow/pipeline operations
- auth and bridge connection
- workspace status
- deploy prep
- JSON-first agent interfaces

The CLI should be understood as the machine-readable path through the AWaC architecture, not only an installer.

Important user-facing commands:

```bash
npm create @growthub/growthub-local@latest
npm install -g @growthub/cli
growthub
growthub discover
growthub workspace status --json
growthub kit
growthub workflow
growthub pipeline assemble
growthub auth login
growthub auth whoami
```

## Runtime And Deploy Continuity

The same primitives must survive across:

- local builder use
- local agent operation
- exported workspace folder
- fork metadata
- runtime app deployment
- Vercel deploy prep
- ongoing fork sync
- hosted authority attachment

Do not create features that only work in one runtime mode while losing the governed contract elsewhere.

The whole point of AWaC is continuity across local, runtime, deployment, and ongoing maintenance.

## Fork Lifecycle

`.growthub-fork/` is the lifecycle envelope.

It can carry:

- `fork.json`
- `policy.json`
- `trace.jsonl`
- `project.md`
- optional `authority.json`

Forks are first-class. Customization should not mean decay. Fork sync should detect drift, preview safe changes, preserve protected paths, and avoid overwriting user modifications or local resolver/custom skill additions.

## Agent Primitives

Every governed fork/worker kit should preserve the six agent-facing primitives:

1. `SKILL.md`
2. root `AGENTS.md` pointer
3. `.growthub-fork/project.md`
4. `selfEval.criteria[]` and `maxRetries`
5. nested `skills/<slug>/SKILL.md`
6. `helpers/<verb>.{sh,mjs,py}`

These are not decorative. They make the workspace legible to agents and allow repeatable generate/apply/evaluate/record loops.

## What Not To Overweight

Do not overweight the latest feature just because it is fresh.

The governed data workspace is critical, especially now that API Registry and Data Source are first-class objects. But it is one powerful layer inside the AWaC whole.

Similarly, do not overweight:

- fork sync alone
- bridge alone
- worker kits alone
- templates alone
- the CLI alone
- dashboard UI alone

The truth is the continuum: governed primitives fused behind a no-code super-admin surface and exposed to agents/devs through CLI, files, JSON, helper scripts, and deployable runtime.

## Documentation Rules

When updating docs:

- Root `README.md` is the product/AWaC front door.
- `cli/README.md` is the npm-facing CLI/operator surface.
- `packages/create-growthub-local/README.md` is the guided installer/npm bootstrap surface.
- Focused docs in `docs/` can hold deeper mechanics.
- Do not duplicate huge mechanics in the root README.
- Do not remove important product truth just because it is technical; compress and route it.
- Keep startup commands current and scoped:

```bash
npm create @growthub/growthub-local@latest
npm install -g @growthub/cli
growthub workspace status --json
```

## Source Of Truth Order

When behavior conflicts, use this order:

1. `README.md`
2. `AGENTS.md`
3. `cli/src/index.ts`
4. `cli/src/commands/`
5. `scripts/runtime-control.sh`
6. focused docs in `docs/`
7. current source under `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`

For workspace builder behavior, inspect:

1. `docs/WORKSPACE_BUILDER_RUNTIME_V1.md`
2. `docs/WORKSPACE_BUILDER_RUNTIME_V1_1.md`
3. `docs/WORKSPACE_CONFIG_CONTRACT_V1.md`
4. `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`
5. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/workspace-builder.jsx`
6. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/page.jsx`
7. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-data-model.js`
8. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js`
9. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-config.js`

## Runtime Control

Use the canonical repo runtime surface:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Use `GH_SERVER_PORT` when the API is not on the script default.

Do not replace this with ad-hoc `pnpm --dir server` and `pnpm --dir ui` loops unless explicitly told.

For an exported AWaC workspace, runtime is scoped to the exported kit:

```bash
cd <workspace>/apps/workspace
npm install
npm run dev
```

Do not confuse those lanes. `runtime-control.sh` is for the Growthub Local repo services and PR/runtime validation. `apps/workspace` is the exported governed workspace app that buyers and operators open locally.

## Testing And Validation

For repo-level PR readiness:

```bash
bash scripts/pr-ready.sh
```

For CLI source checks, install dependencies first:

```bash
pnpm install
pnpm --filter @growthub/cli exec tsc --noEmit
pnpm --filter @growthub/cli exec tsc --noEmit -p tsconfig.test.json
pnpm --filter @growthub/cli exec vitest run
```

For docs-only edits, at minimum:

```bash
git diff --check
bash scripts/pr-ready.sh
```

## Hard Boundaries

Future agents must not:

- run `git revert`
- run destructive git commands without explicit approval
- put provider secrets into `growthub.config.json`
- make the browser the credential authority
- bypass `PATCH /api/workspace` validation for builder saves
- collapse API Registry and Data Source into one ad-hoc integration blob
- make hosted authority mandatory for local value
- hardcode user paths in tracked docs/templates
- preserve stale docs "for history" in active guidance
- add duplicate command trees that diverge from `growthub` / `growthub discover`

## One-Sentence Truth

Growthub Local turns sources into governed AI workspaces where builder state, data model, integrations, agent contracts, fork policy, trace, runtime checks, and optional authority travel together as one portable AWaC artifact.
