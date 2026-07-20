# @growthub/api-contract

## 1.7.0

Additive minor. Extends the inference contract into the **evidentiary
backbone**: receipt lineage as a Merkle DAG, signed cache envelopes with
governed invalidation, multi-tier economic routing evidence, deterministic
streaming redaction evidence, and the signed inference manifest that binds a
published workflow version to the live gateway identity.

### Added

- `InferenceRequest.parent_receipt_id` / `span_kind`
  (`ROOT`/`CHILD_TOOL`/`CHILD_WORKFLOW`), plus `max_cost_cents` and
  `min_quality_score` economic controls.
- `ReceiptLineageEvidence` + `ChildReceiptLink`: parent receipts store the
  SHA-256 of each child's full receipt, so the DAG chains
  `parent_hash -> child_hash -> grandchild_hash`; a declared child that never
  ingests a receipt is an explicit `MISSING`/`incomplete` state, and a failed
  child is recorded with its exact error. `InferenceToolResult.child_receipt`
  carries the ingested child receipt; `ToolCallAuditEntry.child_receipt_hash`
  + `child_status` record the Merkle edge.
- `CacheEnvelope` / `SignedCacheEnvelope`: HMAC-signed entry identity
  (receipt id, model/adapter SHA, schema hash, workflow version, credential-
  derived `cache_version`, redaction flags). `CacheInvalidationRequest` /
  `CacheInvalidationResult` with `MODEL_UPDATE`/`SCHEMA_CHANGE`/
  `FEEDBACK_CORRECTION`/`SECURITY` reasons and exact-key/semantic-cluster/
  model/schema/workflow scopes. Cache evidence gains
  `envelope_signature_state`, `cache_version`, `poisoned_by`, and
  `semantic_bucket`; a poisoned bypass reports `CACHE_BYPASS_POISONED`.
- `RoutingDecisionEvidence`: cost-capability/quality-fallback/budget
  evidence with real token-count cost estimates and a log-prob-derived
  confidence; a runtime without log-probs reports
  `confidence_basis: "unavailable"` and quality `UNVERIFIED`, never an
  estimated score. `QUALITY_UNMET` marks a kept-local result whose fallback
  exceeded budget.
- `StreamRedactionEvidence` + `RedactionEvent`: deterministic streaming
  PII redaction events carrying source offsets and match hashes only;
  `raw_output_cached` is always false when redaction ran.
- `InferenceManifest` / `SignedInferenceManifest` /
  `ManifestVerificationEvidence`: the draft -> publish -> runtime binding
  (composite SHA over base model + allowed adapters + schema, tool OpenAPI
  hash, cache TTL, cost policy) signed with the workspace signing key.
- `VerificationReceipt` gains optional `lineage`, `routing_decision`,
  `redaction`, and `manifest` blocks — optional on the wire so pre-1.7.0
  receipts stay valid; a 1.7.0 runtime always emits all four with explicit
  `not_requested`/`leaf` states.
- `WORKSPACE_LIVE_WORKFLOW_FIELDS` gains `inferenceManifests`: signed
  manifests are publish-owned and PATCH-forgery is policy-blocked.

## 1.6.0

Additive minor. Introduces a public, type-only contract for evidence-bearing
custom-model inference without changing the existing workspace mutation or
execution routes.

### Added

- `./inference` subpath and root re-export for inference requests, responses,
  streaming events, and verification receipts.
- Base-model and LoRA artifact references with resolved SHA-256, served-alias,
  adapter-scale, and model-tag binding evidence.
- Exact/semantic gateway-cache and native-prefix-cache policy/evidence,
  including synthetic cache keys, TTL, similarity, and warm-instance status.
- Versioned JSON Schema contracts and generation-time plus final-output
  validation evidence, with the complete schema wrapper hash bound to model
  identity.
- OpenAPI operation references, raw tool-call capture, correlated external
  result audit records, executor provenance, redaction, and child-span evidence.
- W3C/OTel trace correlation and OTLP export status fields.
- Prefill/decode phase and role-pool routing evidence. The contract can report
  native disaggregation as unavailable and does not imply that llama.cpp has a
  stable prefill-to-decode KV-state handoff.

## 1.5.1

Additive patch. Introduces the Unified API Resolver Registry contract as a
typed, agent-readable projection of governed API Registry records.

### Added

- `./resolver-registry` subpath with resolver registry entry/index types,
  trust/provenance taxonomy constants, endpoint manifest constants, generated
  resolver artifact constants, and `isResolverRegistryIndex`.
- Contract docs for the browser and agent mental model:
  no-code resolver construction from tested response shape, generated resolver
  artifacts as projections of governed records, drift-guard enforcement, and
  the dynamic `/api/resolvers/<integrationId>` endpoint surface.

## 1.5.0

Additive minor. Promotes the **governed workspace mutation boundary** into
the public type surface, alongside the runtime enforcement that ships in
`growthub-custom-workspace-starter-v1` (`lib/workspace-patch-policy.js`,
`POST /api/workspace/patch/preflight`, `POST /api/workspace/workflow/publish`).

Pure type-only plus frozen vocabulary constants; no existing export shape
changes.

### Added

- `./workspace-apps` subpath — Governed Application Control Plane V1:
  `AppSurfaceRow` (the `workspace-app-registry` governed object rows),
  `AppLinkRollup` / `AppHealthStatus` / `AppNextAction`,
  `AppAssignmentPacket` (app-scoped swarm assignment),
  `WorkspaceAppsResponse` (`GET /api/workspace/apps`),
  `APP_REGISTRY_OBJECT_ID`, `APP_SURFACE_OBJECT_TYPE`,
  `isAppAssignmentPacket`, `WORKSPACE_APPS_CONTRACT_VERSION`.
- `./workspace-outcome` subpath — Agent Outcome Loop V1: `AgentOutcomeReceipt`
  (the canonical receipt every mutation lane emits into the
  `workspace:agent-outcomes` source-record stream), `AgentOutcomeLane`
  classification, `WorkspaceGovernanceSummary` + `AgentOutcomesResponse`
  (the `GET /api/workspace/agent-outcomes` cockpit data model),
  `WORKSPACE_AGENT_LOOP_V1` (the blessed call sequence),
  `isAgentOutcomeReceipt`, `WORKSPACE_OUTCOME_CONTRACT_VERSION`.
- `repairPlan` on the PATCH 422 rejection envelope and
  `repairPlan` / `safeNextStep` on the preflight response — policy
  rejections teach the governed alternative.
- `./workspace-patch` subpath — `WorkspacePatchViolation(Code)`,
  `WorkspacePatchPolicyRejection`, `WorkspacePatchPreflightRequest/Response`,
  `WorkflowPublishRequest/Response/Success/Failure(Code)`,
  `WORKSPACE_PATCH_ALLOWED_FIELDS`, `WORKSPACE_LIVE_WORKFLOW_FIELDS`,
  `WORKSPACE_DRAFT_WORKFLOW_FIELDS`, `isWorkspacePatchPolicyRejection`,
  `isWorkflowPublishSuccess`, `WORKSPACE_PATCH_CONTRACT_VERSION`.

### Fixed

- `./helper` subpath export was advertised by docs but missing from
  `package.json#exports`; it now resolves (`dist/helper.{js,d.ts}` already
  shipped via the root re-export).


## 1.3.0-alpha.2

Additive patch. Adds descriptive hosted Agent Builder manifest contracts to
the Growthub bridge surface.

Pure type-only; no execution semantics. The SDK describes hosted agents,
diagnostics, KV/CMS source status, warnings, and resolved slugs. Hosted
execution remains owned by gh-app; local consumption remains an authenticated
bridge inspection surface.

### Added

- `BridgeHostedAgentManifest`
- `BridgeHostedAgentDiagnostics`
- `BridgeHostedAgentSourceDiagnostics`
- `BridgeHostedAgentManifestListResponse`
- `BridgeHostedAgentManifestResponse`

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
