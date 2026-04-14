# CMS Node Orchestration — Frozen Snapshot + Roadmap

This document is the source of truth for the CMS node orchestration ecosystem state after PR #61 merged, and the prioritized roadmap for extension.

Read this before starting work on any orchestration, contract pipeline, workflow, or kit extension.

---

## Frozen Production State

### Merge + Release

- PR: `#61` — `feat/cms-node-contract-pipeline`
- Merge commit: `822614d2acaf68449c7dd3ef3dc5d67fce370c36`
- CI gates passed: `smoke`, `validate`, `verify`
- Published: `@growthub/cli@0.3.50`, `@growthub/create-growthub-local@0.1.53`
- Installer pin aligned: `@growthub/cli: 0.3.50`

### What Was Delivered

A **generic CMS Node Contract Pipeline** in CLI discovery and execution flow. Not node-family-specific logic.

Delivered pillars:

- Contract introspection from hosted CMS node truth
- Contract presentation for humans and agents in discovery
- Normalization and compile path before save/run
- Pre-execution transparency summary with warnings
- Workflow lifecycle controls including archive/delete
- Hosted-first behavior with operational resilience
- Docs lane split freeze between OSS contributor and super-admin release
- Versioning and publish lane completion

### Frozen Architecture Statement

**Hosted CMS/runtime truth -> CLI contract introspection -> contract presenter -> normalization/compile -> hosted save/execute -> execution summary -> workflow lifecycle hygiene**

---

## Runtime Primitives (Merged)

### `cli/src/runtime/cms-node-contracts/`

| Primitive | Purpose |
|-----------|---------|
| `introspectNodeContract(node)` | Convert CMS capability into typed input/output field contracts |
| `normalizeNodeBindings(raw, node)` | Sanitize placeholders, coerce types, merge with template defaults |
| `validateNodeBindings(bindings, node)` | Check missing required inputs and bindings |
| `compileToHostedWorkflowConfig(pipeline)` | Produce exact hosted graph format with start/end nodes and edges |
| `inferWorkflowName(pipeline)` | Derive workflow name from metadata or slug |
| `buildPreExecutionSummary(input)` | Per-node validation, asset counts, missing requirements, compiled config |
| `renderPreExecutionSummary(summary)` | Terminal-friendly per-node readout |
| `renderContractCard(contract)` | Full contract inspection card |
| `renderPreSaveReview(input)` | Pre-save confirmation with warnings |

### `cli/src/runtime/workflow-hygiene/`

| Primitive | Purpose |
|-----------|---------|
| `createWorkflowHygieneStore()` | Lifecycle labeling store at `~/.paperclip/workflow-hygiene/labels.json` |
| `inferDefaultLabel(name, createdAt, versionCount)` | Auto-classify: canonical (3+ versions), experimental, archived (90+ days) |
| `renderWorkflowLabel(label)` | Color-coded terminal label |
| `enrichWorkflowSummaries(entries, store)` | Merge hygiene labels into workflow list entries |

### Hosted Bridge Extensions (`cli/src/auth/hosted-client.ts`)

| Primitive | Purpose |
|-----------|---------|
| `archiveHostedWorkflow(session, payload)` | Archive a saved workflow via hosted bridge |
| `deleteHostedWorkflow(session, payload)` | Delete a saved workflow via hosted bridge |

### Capability Registry Refactor (`cli/src/runtime/cms-capability-registry/`)

- Removed all hardcoded fallback arrays (`BUILTIN_*`)
- Capability listing centered on hosted truth
- Added `deriveCapabilitiesFromHostedWorkflows()` fallback when capability endpoint is empty
- Registry self-populates from user's actual saved workflow history

---

## Existing Ecosystem Surfaces (Pre-PR #61)

These are the four CLI product surfaces the roadmap extends:

### 1. Kit System

- `growthub kit` — interactive browser with type filtering
- `growthub kit download` — complete agent workspace environments
- `growthub kit list --family <family>` — filter by studio, workflow, operator, ops
- `growthub kit inspect` — manifest introspection
- `growthub kit validate` — schema contract validation
- `growthub kit families` — taxonomy display
- Three shipped kits: creative-strategist-v1, email-marketing-v1, higgsfield-studio-v1

### 2. Template System

- `growthub template` — two-step interactive picker (family -> group -> artifact -> action)
- Discriminated artifact types: `AdFormatArtifact`, `SceneModuleArtifact`
- Template families: video-creative, email, motion, general
- Filter by type, subtype, compatible format, tags
- Copy, print, resolve by fuzzy slug

### 3. Capability System

- `growthub capability` — interactive browser with family filtering
- `growthub capability resolve` — machine-scoped 5-gate resolution
- `growthub capability inspect` — full node introspection
- 8 capability families: video, image, slides, text, data, ops, research, vision

### 4. Workflow + Pipeline System

- `growthub workflow` — saved workflows, CMS node contracts, dynamic pipelines
- `growthub pipeline` — interactive assembler, validate, execute, save
- `growthub artifact` — list and inspect pipeline execution artifacts
- Three discovery paths: CMS Node Contracts, Dynamic Pipelines, Saved Workflows

### Supporting Infrastructure

- `growthub auth login/logout/whoami` — browser-driven OAuth bridge
- `growthub profile status/pull/push` — layered profile management
- `growthub worktree:make` — isolated runtimes (own port, DB, session)
- Full local server, embedded Postgres, Vite/React UI, agent system, heartbeat, plugins

---

## Roadmap: Prioritized by Value / Complexity

### Tier 1 — Immediate (Wire Existing Primitives)

These use merged primitives directly. Each is a single focused PR.

#### 1. Pipeline Template Sharing via Canonical Labels

An agent assembles a pipeline, `compileToHostedWorkflowConfig()` produces the hosted graph, `saveHostedWorkflow()` persists it with versioning. The hygiene system already labels workflows as `canonical` when they reach 3+ versions. Surfacing `canonical`-labeled workflows as browsable templates inside the `Templates` path makes every mature pipeline a reusable template for every agent in the org.

**Uses:** `compileToHostedWorkflowConfig()`, `saveHostedWorkflow()`, `enrichWorkflowSummaries()`, `inferDefaultLabel()`

**Work:** Filter option in workflow list for `canonical`-labeled entries as browsable templates.

#### 2. Kit Capability Declarations

Add `capabilitySlugs: string[]` to `KitManifestV2`. The creative-strategist declares `["image-generation", "slides-generation", "deep-research-perplexity"]`. The Higgsfield studio declares `["video-generation"]`. `growthub kit list --json` and `growthub kit inspect` render it automatically. An orchestrating agent reading JSON output can match kit capabilities against pipeline node requirements.

**Uses:** `KitManifestV2` schema, `listBundledKits()`, `inspectBundledKit()`, `validateKitDirectory()`

**Work:** One field in kit contract schema, populate in 3 shipped kit manifests, validate in `growthub kit validate`.

#### 3. Pre-Execution Summary as Agent-Readable JSON

`buildPreExecutionSummary()` already produces structured `PreExecutionSummary` with per-node validation, binding counts, asset counts, missing requirements, compiled config, and warnings. Add `--json` output to the pipeline execute flow or a standalone `growthub pipeline validate --json` subcommand. Agents read JSON, check `warnings.length === 0`, proceed.

**Uses:** `buildPreExecutionSummary()`, `PreExecutionSummary` type

**Work:** JSON output path in pipeline execute flow or standalone validate subcommand.

#### 4. Artifact Provenance Filtering by Connection

`GrowthubArtifactManifest` already tracks `createdByConnectionId`. Add `connectionId` to `ArtifactQuery` and expose as `--connection <id>` on `growthub artifact list`. Any workspace sees what other workspaces produced.

**Uses:** `ArtifactQuery`, `createArtifactStore()`, `GrowthubArtifactManifest.createdByConnectionId`

**Work:** One field in `ArtifactQuery`, one CLI flag, one filter predicate.

---

### Tier 2 — Structural (New Modules on Merged Foundation)

#### 5. Template-to-Pipeline Binding

Add optional `sourcePipeline` field to `TemplateArtifact`: `{ pipelineId: string; nodeSequence: string[]; executionMode: string }`. An agent browsing `growthub template get <slug> --json` sees the pipeline that produced the artifact. It feeds those node slugs into `createPipelineBuilder()` to reproduce or modify.

**Uses:** `TemplateArtifact` union, `ArtifactFilter`, template catalog, `createPipelineBuilder()`

**Work:** Schema extension in template contract, populate from pipeline execution metadata when templates are frozen.

#### 6. Workflow Hygiene: Execution History + Artifact Family

Extend `WorkflowHygieneRecord` to track `lastExecutedAt`, `executionCount`, `primaryArtifactFamily`, `lastCreditCost`. Smarter label inference: high execution count with recent activity = `canonical`, single run 90 days ago = archive candidate.

**Uses:** `WorkflowHygieneStore`, `enrichWorkflowSummaries()`, `inferDefaultLabel()`

**Work:** Extended record fields, update store after each execution, update inference heuristics.

#### 7. Headless Pipeline API (No TTY)

The contract pipeline is already pure functions: `createPipelineBuilder()` -> `addNode()` -> `build()` -> `normalizeNodeBindings()` -> `validateNodeBindings()` -> `buildPreExecutionSummary()` -> `compileToHostedWorkflowConfig()`. Add `growthub pipeline execute --file pipeline.json --yes --json` that reads a `SerializedPipeline` from disk, runs through the contract pipeline, submits to hosted execution, returns JSON output.

**Uses:** `deserializePipeline()`, `normalizeNodeBindings()`, `compileToHostedWorkflowConfig()`, hosted execution client

**Work:** File-based input path, JSON output mode, non-interactive confirmation bypass.

#### 8. Contract Diffing Between Node Versions

`introspectNodeContract()` produces `NodeContractSummary` with structured input/output fields. A `diffNodeContracts(before, after)` function compares: added fields, removed fields, type changes, new required bindings. Agents and users see what changed when a hosted CMS node evolves.

**Uses:** `introspectNodeContract()`, `NodeContractSummary`, `NodeInputFieldContract`

**Work:** Diff function, CLI presentation, version-aware introspection.

---

### Tier 3 — Compound (Self-Reinforcing Growth Loop)

Depends on Tier 1-2 foundations.

#### 9. Agents Freeze Artifacts as Templates

Execute pipeline -> inspect artifact -> confirm quality -> `growthub template freeze <artifact-id>` -> populate `TemplateArtifact` fields from artifact manifest and pipeline metadata -> validate against template contract -> add to catalog.

**Depends on:** Items 4, 5

#### 10. Agents Serialize Workspaces as Kits

`growthub kit export` reads workspace structure, builds manifest, validates against kit schema, produces zip. `growthub kit validate` verifies. Successful configurations become reproducible environments.

**Depends on:** Item 2

#### 11. Shared Knowledge Layer Across Workspaces

The `growthub_local` connector declares knowledge table tools. A `growthub knowledge` CLI surface lets agents query, write, and sync knowledge entries across workspaces through the bridge.

**Depends on:** Items 2, 4

#### 12. Cross-Workspace Pipeline Routing

Add optional `targetWorkspace` to `DynamicRegistryPipelineNode`. An orchestrating agent reads kit capability declarations, determines which workspace handles which node, submits pipeline segments to appropriate worktrees.

**Depends on:** Items 2, 7

---

### Tier 4 — Open Ecosystem

#### 13. Kit Composition (Multi-Workspace Bundles)

Composed kits bundle multiple kits with pre-wired pipelines between them. Download produces multi-worktree setup.

**Depends on:** Items 2, 7, 12

#### 14. Harness Interoperability

Paperclip and other harnesses speak the same `CmsCapabilityNode` vocabulary, validate against the same kit schema, assemble the same `DynamicRegistryPipeline` types.

**Depends on:** Items 7, 9, 10

#### 15. Community Marketplace

Shared registry for kits, templates, pipeline patterns across harnesses. Uses `visibility` field: `public | authenticated | admin`.

**Depends on:** Items 9, 10, 14

---

## Dependency Graph

```
Tier 1 (immediate)
  1. Pipeline template sharing
  2. Kit capability declarations
  3. Pre-execution summary JSON
  4. Artifact provenance filtering
     │
Tier 2 (structural)
  5. Template-to-pipeline binding ← (no deps)
  6. Workflow hygiene enrichment  ← (no deps)
  7. Headless pipeline API        ← (no deps)
  8. Contract diffing              ← (no deps)
     │
Tier 3 (compound)
  9.  Artifact → template freeze  ← 4, 5
  10. Workspace → kit export      ← 2
  11. Knowledge layer              ← 2, 4
  12. Cross-workspace routing      ← 2, 7
     │
Tier 4 (open)
  13. Kit composition             ← 2, 7, 12
  14. Harness interop             ← 7, 9, 10
  15. Marketplace                 ← 9, 10, 14
```

---

## Guardrails

- No rebuild of hosted orchestrator/router/executor
- No node-family-specific special framework
- CLI layer focuses on introspection, shaping, presentation, lifecycle control
- Hosted runtime remains canonical truth for execution behavior
- Runtime control path remains `scripts/runtime-control.sh`
- All extension work uses the merged contract pipeline primitives
- Run `bash scripts/pr-ready.sh` before pushing

---

## Files to Read Before Contributing

| Area | Files |
|------|-------|
| Contract pipeline | `cli/src/runtime/cms-node-contracts/*.ts` |
| Capability registry | `cli/src/runtime/cms-capability-registry/index.ts`, `types.ts` |
| Pipeline builder | `cli/src/runtime/dynamic-registry-pipeline/index.ts`, `types.ts` |
| Hosted execution | `cli/src/runtime/hosted-execution-client/index.ts`, `types.ts` |
| Workflow hygiene | `cli/src/runtime/workflow-hygiene/*.ts` |
| Artifact contracts | `cli/src/runtime/artifact-contracts/index.ts`, `types.ts` |
| Machine resolver | `cli/src/runtime/machine-capability-resolver/index.ts`, `types.ts` |
| Auth bridge | `cli/src/auth/hosted-client.ts`, `session-store.ts`, `workflow-access.ts` |
| Kit system | `cli/src/kits/service.ts`, `catalog.ts`, `contract.ts` |
| Template system | `cli/src/templates/contract.ts`, `service.ts` |
| CLI commands | `cli/src/commands/workflow.ts`, `pipeline.ts`, `kit.ts`, `template.ts`, `artifact.ts`, `capability.ts` |
| Tests | `cli/src/__tests__/cms-node-contracts-*.test.ts`, `workflow-hygiene.test.ts`, `workflow-discovery.test.ts` |
