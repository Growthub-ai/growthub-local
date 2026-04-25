# @growthub/api-contract

## 1.3.0-alpha.1

Additive minor. Promotes the validated Pipeline Kit + Workspace
Dependency + Adapter + Trace + Health primitives shipped under
`docs/PIPELINE_KIT_CONTRACT_V1.md`, `docs/ADAPTER_CONTRACTS_V1.md`, and
`docs/PIPELINE_TRACE_CONVENTION_V1.md` (and proven by
`growthub-creative-video-pipeline-v1`) into the public type surface.

Pure type-only; no existing export shape changes. The CLI does not yet
consume these contracts at runtime — Phase 3 of the transition model.

### Added

- `pipeline-kits`: `PipelineKitManifest`, `PipelineStageRef`,
  `PipelineArtifactRef`, `PipelineAdapterModeRef`,
  `PipelineTraceExpectation`, `PipelineOutputTopology`,
  `PipelineTracePolicy`, `PipelineSessionMemoryPolicy`,
  `PipelineConventionEnvelope`. Sentinel
  `PIPELINE_KIT_MANIFEST_VERSION = 1`.
- `workspaces`: `WorkspaceDependencyManifest`, `WorkspaceDependencyRef`,
  `WorkspaceDependencyKind`, `WorkspaceSurfaceRef`,
  `WorkspaceOutputTopology`, `WorkspaceConventionEnvelope`. Sentinel
  `WORKSPACE_DEPENDENCY_MANIFEST_VERSION = 1`.
- `adapters`: `AdapterContractRef`, `AdapterKind`, `AdapterMode`,
  `AdapterInputRef`, `AdapterOutputRef`, `NormalizedConnectionRef`.
  Sentinel `ADAPTER_CONTRACT_VERSION = 1`.
- `pipeline-trace`: `PipelineTraceEvent` discriminated union over
  `pipeline_stage_started` / `pipeline_stage_completed` /
  `pipeline_stage_failed` / `pipeline_artifact_written` /
  `pipeline_handoff_created`, plus `isPipelineTraceEvent` guard and
  `PIPELINE_TRACE_VERSION = 1`. **Distinct from** `./events.ts`
  (`ExecutionEvent` for hosted CLI/SDK NDJSON streams).
- `health`: `KitHealthReport`, `KitHealthCheck`, `KitHealthSeverity`,
  `KitMaturityScore`, `KitMaturityDimension`. Sentinel
  `KIT_HEALTH_REPORT_VERSION = 1`.
- Subpath exports for all five new modules in `package.json`.

### Architectural anchor

The SDK describes what must be true, not how it is done. None of these
types reference provider SDKs, model identifiers, or kit-specific
implementation. The shapes mirror exactly what already ships under
`cli/assets/worker-kits/growthub-creative-video-pipeline-v1/pipeline.manifest.json`
and `workspace.dependencies.json`, so Phase 3 (CLI consumers) can adopt
these contracts without any kit-side change.

Promotion gate respected: this only landed because the kit-local
manifests, the docs, and the report-only scorecard already shipped
(commit on `claude/formalize-pipeline-primitives-fvkhW`). Phase 4 (CLI
commands `growthub kit pipeline inspect`, `growthub kit dependencies
inspect`, `growthub kit health`) is the next consumer.

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
