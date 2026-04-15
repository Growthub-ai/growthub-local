# Worker Kits

Growthub Agent Worker Kits are versioned local environment packages that can be exported by the CLI and used through local adapters.

This document is the public source of truth for:

- how worker kits relate to prompts, templates, examples, outputs, and standards
- how local adapters use exported kits today
- how contributors should build new kit environments
- what kinds of environments the current architecture already supports

Related pages:

- [Worker Kit Architecture](./WORKER_KIT_ARCHITECTURE.md)
- [Worker Kit Contributor Guide](./WORKER_KIT_CONTRIBUTOR_GUIDE.md)
- [Worker Kit Environment Examples](./WORKER_KIT_ENVIRONMENT_EXAMPLES.md)
- [Custom Workspace Kernel Packet](./kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACES.md)
- [Kernel Packet Registry](./kernel-packets/README.md)

## V1 Scope

V1 ships a narrow local file export surface in `@growthub/cli`:

- `growthub kit list`
- `growthub kit inspect <kit-id>`
- `growthub kit download <kit-id> [--out <path>]`
- `growthub kit path <kit-id> [--out <path>]`
- `growthub kit validate <path>`

The first and only bundled kit in V1 is `creative-strategist-v1`.

## Core Mental Model

A worker kit is a self-contained execution environment that packages:

- prompts and role instructions
- templates and reusable working materials
- examples and calibration references
- output standards and expected folder structures
- environment assumptions about how the agent will work locally

The manifest and bundle metadata define the contract. The files inside the kit folder are the working materials. The exported folder is what local adapters run inside through the agent `Working directory`.

## How The Layers Fit Together

The easiest way to reason about a kit is as five connected layers:

1. Contract layer
   `kit.json`, bundle manifests, versioning, bundle IDs, and public payload boundary.
2. Cognitive layer
   prompts, role instructions, examples, heuristics, and constraints.
3. Production layer
   templates, schemas, standards, required outputs, and folder conventions.
4. Runtime layer
   local files, browser/editor assumptions, tool affordances, and adapter compatibility.
5. Activation layer
   export the kit locally, point `Working directory` at the expanded folder, and run the local adapter inside it.

Prompts are one part of the system. The reusable unit is the full environment package.

## What V1 Does

- ships bundled catalog metadata inside the CLI package
- validates the frozen bundled kit source before export
- writes one deterministic zip and one expanded export folder
- uses a deterministic CLI-owned default export root under Paperclip home when `--out` is omitted
- produces a folder that can be pointed at directly with existing Working Directory path support

## What V1 Does Not Do

- no heartbeat integration
- no server routes
- no agent runtime injection
- no app-side install surface
- no plugin lifecycle reuse
- no database registry or persistence for kits

## How Local Adapters Use Worker Kits

Local adapters such as Claude, Codex, Cursor, Gemini, and OpenCode execute inside the configured
agent `Working directory`.

That makes the current runtime path:

1. Build or update a self-contained kit folder in `cli/assets/worker-kits/<kit-id>`.
2. Validate it with `growthub kit validate <path>` and repo-level checks.
3. Export it with `growthub kit download <kit-id>` or resolve it with `growthub kit path <kit-id>`.
4. Point the agent `Working directory` at the expanded exported folder.
5. Run the local adapter inside that exported environment.

Operationally, the exported folder is the environment the agent works inside. That is the current worker-kit integration surface.

## Relationship Between Materials And Environment Packaging

Prompts, templates, examples, outputs, and standards should be treated as coordinated parts of one
environment package:

- prompts define behavior and reasoning
- templates define repeatable working structures
- examples calibrate tone, quality, and pattern matching
- outputs define artifact types and expected destination structure
- standards define what acceptable completion looks like

The environment decides how those materials are actually used in practice.

For example:

- a creative strategy environment may output campaign briefs, planning docs, and structured strategy assets
- an email marketing environment may output sequences, tests, campaign drafts, and lifecycle plans
- a motion environment may output composition plans, asset maps, and local machine video artifacts
- a browser-heavy GTM environment may output research, CRM updates, sourced prospects, or browser-assisted execution artifacts

The packaging model is the same across all of them. What changes is the payload and runtime assumptions.

## Environment Examples

### Creative Strategy

`creative-strategist-v1` is the first bundled example:

- strategy-specific instructions
- frozen templates
- example brand material
- output standards
- deterministic local export

### Motion / Remotion

A motion-focused kit can use the same packaging model. A Remotion-oriented kit would package:

- concepting and storyboard prompts
- composition templates
- motion examples
- output expectations for video artifacts
- local runtime assumptions for browser/editor workflows

The remaining work is freezing, validation, and bundling.

### Email Marketing

An email kit would follow the same model:

- campaign and sequence prompts
- offer and segmentation templates
- examples of approved messaging patterns
- QA and deliverability standards
- output structure for briefs, drafts, and reviews

### Browser-Heavy GTM Environments

Browser-capable workflows such as lead sourcing, outbound, browser QA, and Chrome-assisted GTM work are also compatible with the same packaging model when their runtime assumptions are documented in the environment.

### Social Media (Hosted API)

`growthub-zernio-social-v1` is the reference environment for a hosted social-media provider:

- campaign, calendar, caption, and scheduling-manifest instructions
- 14 supported platforms (X/Twitter, Instagram, Facebook, LinkedIn, TikTok, YouTube, Pinterest, Reddit, Bluesky, Threads, Google Business, Telegram, Snapchat, WhatsApp)
- Zernio REST API shape for posts and queues (`POST /api/v1/posts`, `POST /api/v1/queues`)
- `Idempotency-Key`-aware scheduling manifest so re-submission is safe
- single bearer-token auth via `ZERNIO_API_KEY` — no fork or docker required

## What The Current Architecture Supports

The current packaging model supports environments that depend on:

- local file execution
- browser-enabled workflows
- editor/tool-specific local runtime assumptions
- structured output folders
- reusable templates and standards

In practice, that means the system is already compatible with:

- strategy kits
- email marketing kits
- motion or Remotion kits
- browser operations kits
- research and sourcing kits

The main work for each environment type is packaging, freezing, validating, and publishing it cleanly.

## Contributor Workflow

Use this workflow when building a new kit:

1. Decide whether the new environment is best modeled as a variant of an existing kit or as a new capability family.
2. Create a self-contained folder under `cli/assets/worker-kits/<kit-id>`.
3. Add `kit.json` and one or more bundle manifests under `bundles/`.
4. Package the full environment:
   - prompts
   - templates
   - examples
   - standards
   - output expectations
   - agent-facing metadata
5. Register the kit in `cli/src/kits/catalog.ts`.
6. Run `growthub kit validate <path>`.
7. Run repo checks such as `bash scripts/pr-ready.sh`.
8. Export the kit and test it through a real local adapter using `Working directory`.

## Two Good Build Paths

### 1. Build On Top Of An Existing Kit

Use this when the new environment is mostly the same pattern as an existing bundled environment and
you mainly need to change instructions, templates, examples, or standards.

### 2. Reuse Only Primitives

Use this when you want to reuse only parts of the current system, such as:

- brand kit formats
- output standards
- reusable templates
- metadata conventions

Even in this path, the result should still be a full standalone kit folder, not scattered special-case CLI logic.

## What This Packaging Model Enables

This packaging model keeps the CLI generic while allowing the environment library to grow.

It enables:

- new bundled environments without inventing new user-facing commands
- consistent validation before merge and before publish
- reuse of approved primitives across multiple kits
- deterministic local export for real agent execution
- future expansion of activation modes without breaking the basic packaging model

The intended scaling path is:

- new kit folder
- new manifest and bundle metadata
- catalog registration
- validation
- export and real adapter test

not bespoke command code for every environment pattern.

## Public Payload Boundary

The public bundled Creative Strategist kit excludes confidential brand kits.

The V1 public export includes:

- `kit.json`
- `bundles/creative-strategist-v1.json`
- `skills.md`
- `workers/creative-strategist/CLAUDE.md`
- `templates/`
- `brands/_template/brand-kit.md`
- `brands/solawave/brand-kit.md`
- `growthub-meta/`

Exported zips and expanded folders are generated on the local machine at runtime. They are not committed runtime artifacts and they are not part of the bundled server runtime payload.
