# @growthub/api-contract

## 1.3.0-alpha.1

Additive minor. Promotes the **Worker Kit** universal primitive and
five orthogonal optional specializations into the public type surface.
Companion CLI consumers ship in `@growthub/cli@0.9.0` (`growthub kit
pipeline inspect`, `growthub kit dependencies inspect`, `growthub kit
health`).

Pure type-only; no existing export shape changes; v1.0 + v1.2
surfaces unchanged.

### Added — universal foundation

- `worker-kits` — UNIVERSAL `kit.json` contract. Captures schemas v1
  and v2 as a discriminated union: `WorkerKitManifest =
  WorkerKitManifestV1 | WorkerKitManifestV2`. Mirrors the existing
  internal `cli/src/kits/contract.ts` types so the CLI's truth becomes
  a public contract without semantic change.

  - **Schema v1** = Worker Kit core primitive: baseline, localized,
    open-source agent environment.
  - **Schema v2** = same primitive extended to package full
    applications inside the governed workspace
    (`kit.type: "ui"`, `executionMode: install/mount/run`,
    `ui?` metadata block, `compatibility.requiredCapabilities`,
    `provenance` metadata).

  Both are first-class siblings; v1 is not deprecated.

  Exports: `WorkerKitManifest` / `V1` / `V2`,
  `WorkerKitBundleManifest` / `V1` / `V2`,
  `WorkerKitCapabilityType` (`worker / workflow / output / ui`),
  `WorkerKitExecutionMode` (`export / install / mount / run`),
  `WorkerKitFamily`, `WorkerKitVisibility`, `WorkerKitCompatibility`,
  `WorkerKitInstallMetadata`, `WorkerKitUIMetadata`,
  `WorkerKitProvenance`, `WorkerKitIdentityV1` / `V2`,
  `WorkerKitEntrypoint`, `WorkerKitBundleRef`,
  `WorkerKitOutputStandard`.

  Type guards: `isWorkerKitManifestV1` / `V2`,
  `isWorkerKitBundleManifestV1` / `V2`, `isAppKit`.

  Sentinels: `WORKER_KIT_LATEST_SCHEMA_VERSION = 2`,
  `WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS = [1, 2]`,
  `WORKER_KIT_FAMILIES`.

### Added — optional orthogonal specializations

Each is independent of the others. None changes the underlying Worker
Kit contract.

- `pipeline-kits` — multi-stage worker kits. `PipelineKitManifest`,
  `PipelineStageRef`, `PipelineArtifactRef`, `PipelineAdapterModeRef`,
  `PipelineTraceExpectation`, `PipelineOutputTopology`,
  `PipelineTracePolicy`, `PipelineSessionMemoryPolicy`,
  `PipelineConventionEnvelope`. Sentinel
  `PIPELINE_KIT_MANIFEST_VERSION = 1`.
- `workspaces` — kits with external repos / forks / system binaries.
  `WorkspaceDependencyManifest`, `WorkspaceDependencyRef`,
  `WorkspaceDependencyKind` (open union), `WorkspaceSurfaceRef`
  (apps + studio surfaces), `WorkspaceOutputTopology`,
  `WorkspaceConventionEnvelope`. Sentinel
  `WORKSPACE_DEPENDENCY_MANIFEST_VERSION = 1`.
- `adapters` — generic provider-boundary contract.
  `AdapterContractRef`, `AdapterKind` (open union: `generative /
  persistence / auth / payment / integration / reporting /
  hosted-bridge / byo-api-key / external-repo-handoff / …`),
  `AdapterMode`, `AdapterInputRef`, `AdapterOutputRef`,
  `NormalizedConnectionRef`. Sentinel `ADAPTER_CONTRACT_VERSION = 1`.
- `pipeline-trace` — additive stage-boundary trace events for
  multi-stage kits. `PipelineTraceEvent` discriminated union over
  `pipeline_stage_started` / `pipeline_stage_completed` /
  `pipeline_stage_failed` / `pipeline_artifact_written` /
  `pipeline_handoff_created`, plus `isPipelineTraceEvent` guard.
  Sentinel `PIPELINE_TRACE_VERSION = 1`. **Distinct** from `./events`
  (hosted CLI/SDK `ExecutionEvent` NDJSON).
- `health` — UNIVERSAL kit-health shape. `KitHealthReport`,
  `KitHealthCheck`, `KitHealthSeverity`, `KitMaturityScore`,
  `KitMaturityDimension`. Sentinel `KIT_HEALTH_REPORT_VERSION = 1`.

### Subpath exports

Subpath exports added in `package.json` for all six new modules:
`./worker-kits`, `./pipeline-kits`, `./workspaces`, `./adapters`,
`./pipeline-trace`, `./health`.

### Architectural anchor

The SDK describes what must be true, not how it is done. Zero
references to provider SDKs, model identifiers, or kit-specific
implementation. Mirrors existing kit-local JSON and CLI internals 1:1
so consumers (CLI runtime readers, agents, hosted surfaces) adopt
these types with no kit-side change.

## 1.2.0-alpha.1

Additive minor. Introduces the public Skill manifest surface used by the
CLI skill catalog, worker-kit `SKILL.md` entries, and the Claude Code
`.claude/skills/*` tree. Pure type-only; no existing export shape changes.

### Added

- `skills`: `SkillManifest`, `SkillNode`, `SkillCatalog`, `SkillHelperRef`,
  `SkillSubSkillRef`, `SkillSelfEval`, `SkillSessionMemory`, `SkillSource`.
- `SKILL_MANIFEST_VERSION` literal `1` sentinel.
- `./skills` subpath export in `package.json`.

### Architectural anchor

Every field beyond `name` and `description` is optional so the nine
existing `.claude/skills/*/SKILL.md` files and all new kit-level
`SKILL.md` files validate under a single contract:

- `helpers[]`  — safe-shell tool layer (primitive #6)
- `subSkills[]` — nested `skills/<slug>/SKILL.md` pointers (primitive #5)
- `selfEval`   — `criteria[]` + `maxRetries` (primitive #4)
- `sessionMemory` — default `.growthub-fork/project.md` (primitive #3)
- `mcpTools[]` — declarative MCP routing vocabulary (safe-action layer)

`SkillNode` projects a manifest onto the `CapabilityNode` shape so the
discovery hub can surface skills alongside capability rows using the same
consumer ergonomics.

## 1.0.0-alpha.1

Initial CMS SDK v1 contract package (Phase 1).

Type-only public surface that freezes the existing `growthub-local` CLI truth into one stable public contract. No runtime behavior.

### Added

- `capabilities`: `CapabilityFamily`, `CapabilityExecutionKind`, `CapabilityNode`, `CapabilityRecord`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CAPABILITY_FAMILIES`, execution binding + tokens.
- `execution`: `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`, status unions, summary.
- `providers`: `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderRecord`, `ProviderAssemblyHints`.
- `profile`: `Profile`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef`.
- `events`: `ExecutionEvent` union, per-event shapes (`node_start`, `node_complete`, `node_error`, `credit_warning`, `progress`, `complete`, `error`), `isExecutionEvent` guard.
- `manifests`: `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`, `CapabilityExecutionHints`.
- `schemas`: `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union (text, long-text, number, boolean, select, array, json, url, file, url-or-file), `NodeInputAttachment`.
- `API_CONTRACT_VERSION` literal `1` sentinel.
