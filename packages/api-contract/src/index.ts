/**
 * @growthub/api-contract — public entry point (CMS SDK v1)
 *
 * One contract, many surfaces.
 *
 * This package freezes the existing growthub-local CLI truth into a
 * single stable public surface for capabilities, manifests, provider
 * assembly, execution payloads, streaming events, and hosted profile.
 *
 * Phase 1 of the CMS SDK v1 plan is intentionally type-only: CLI
 * imports can migrate onto these contracts without any runtime
 * behavior change.
 *
 * See individual modules for narrow imports:
 *
 *   - `@growthub/api-contract/capabilities`
 *   - `@growthub/api-contract/execution`
 *   - `@growthub/api-contract/providers`
 *   - `@growthub/api-contract/profile`
 *   - `@growthub/api-contract/events`
 *   - `@growthub/api-contract/manifests`
 *   - `@growthub/api-contract/schemas`
 *   - `@growthub/api-contract/skills`
 *   - `@growthub/api-contract/worker-kits`     — universal kit.json contract
 *   - `@growthub/api-contract/pipeline-kits`   — multi-stage specialization
 *   - `@growthub/api-contract/workspaces`      — external-dep specialization
 *   - `@growthub/api-contract/adapters`        — provider-boundary specialization
 *   - `@growthub/api-contract/pipeline-trace`  — additive trace events
 *   - `@growthub/api-contract/health`          — universal kit health
 */

// Capabilities
export type {
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityNodeType,
  CapabilityVisibility,
  CapabilityExecutionStrategy,
  CapabilityExecutionBinding,
  CapabilityExecutionTokens,
  CapabilityRecord,
  CapabilityNode,
  CapabilityQuery,
  CapabilityRegistrySource,
  CapabilityRegistryMeta,
} from "./capabilities.js";
export { CAPABILITY_FAMILIES } from "./capabilities.js";

// Execution
export type {
  ExecutionMode,
  ExecuteNodePayload,
  ExecuteWorkflowInput,
  ExecuteWorkflowResult,
  WorkflowExecutionStatus,
  NodeExecutionStatus,
  NodeResult,
  ExecutionArtifactRef,
  WorkflowExecutionSummary,
} from "./execution.js";

// Providers
export type {
  ProviderStatus,
  ProviderRecord,
  ProviderAssemblyInput,
  ProviderAssemblyStatus,
  ProviderAssemblyResult,
  ProviderAssemblyHints,
} from "./providers.js";

// Profile
export type {
  PreferredExecutionMode,
  ExecutionDefaults,
  Entitlement,
  GatedCapabilityRef,
  Profile,
} from "./profile.js";

// Events
export type {
  ExecutionEventType,
  NodeStartEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  CreditWarningEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  ExecutionEvent,
} from "./events.js";
export { isExecutionEvent } from "./events.js";

// Manifests
export type {
  ManifestOriginType,
  ManifestProvenance,
  CapabilityExecutionHints,
  CapabilityManifest,
  ManifestDriftMarker,
  ManifestDriftReport,
  CapabilityManifestEnvelope,
} from "./manifests.js";

// Schemas
export type {
  NodeInputUiHint,
  NodeInputProviderNeutralIntent,
  NodeInputExecutionModeHints,
  TextField,
  LongTextField,
  NumberField,
  BooleanField,
  SelectOption,
  SelectField,
  ArrayField,
  JsonField,
  UrlField,
  FileField,
  UrlOrFileField,
  NodeInputField,
  NodeOutputFieldType,
  NodeOutputField,
  NodeInputSchema,
  NodeOutputSchema,
  NodeInputAttachment,
} from "./schemas.js";

// Skills (primitive discovery surface — SKILL.md manifest, helpers,
// sub-skills, self-eval, session memory, MCP routing vocabulary)
export type {
  SkillHelperRef,
  SkillSubSkillRef,
  SkillSelfEval,
  SkillSessionMemory,
  SkillSource,
  SkillManifest,
  SkillNode,
  SkillCatalog,
} from "./skills.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";

// Worker Kits (UNIVERSAL — kit.json schema v1 + v2; the foundation
// every kit conforms to regardless of family or specialization. v2
// extends v1 with the `"ui"` capability type that supports full app
// kits inside the governed workspace. The pipeline-kits / workspaces
// / adapters modules are orthogonal opt-in companions.)
export type {
  WorkerKitCapabilityType,
  WorkerKitExecutionMode,
  WorkerKitActivationMode,
  WorkerKitFamily,
  WorkerKitVisibility,
  WorkerKitCompatibility,
  WorkerKitInstallMetadata,
  WorkerKitUIMetadata,
  WorkerKitProvenance,
  WorkerKitIdentityV1,
  WorkerKitIdentityV2,
  WorkerKitEntrypoint,
  WorkerKitBundleRef,
  WorkerKitOutputType,
  WorkerKitOutputStandard,
  WorkerKitManifestV1,
  WorkerKitManifestV2,
  WorkerKitManifest,
  WorkerKitBundleIdentity,
  WorkerKitBundleExportSpec,
  WorkerKitBundleManifestV1,
  WorkerKitBundleManifestV2,
  WorkerKitBundleManifest,
} from "./worker-kits.js";
export {
  WORKER_KIT_FAMILIES,
  WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS,
  WORKER_KIT_LATEST_SCHEMA_VERSION,
  isWorkerKitManifestV1,
  isWorkerKitManifestV2,
  isWorkerKitBundleManifestV1,
  isWorkerKitBundleManifestV2,
  isAppKit,
} from "./worker-kits.js";

// Pipeline Kits (OPTIONAL specialization — multi-stage worker kits;
// declared via `pipeline.manifest.json` alongside `kit.json`.
// docs/PIPELINE_KIT_CONTRACT_V1.md)
export type {
  PipelineArtifactRef,
  PipelineAdapterModeRef,
  PipelineTraceExpectation,
  PipelineStageRef,
  PipelineOutputTopology,
  PipelineTracePolicy,
  PipelineSessionMemoryPolicy,
  PipelineConventionEnvelope,
  PipelineKitManifest,
} from "./pipeline-kits.js";
export { PIPELINE_KIT_MANIFEST_VERSION } from "./pipeline-kits.js";

// Workspaces (OPTIONAL specialization — declares external repos / forks
// the kit delegates to; orthogonal to pipeline-kits, applies to any
// family. docs/WORKER_KIT_CONTRACT_V1.md § workspace dependencies)
export type {
  WorkspaceDependencyKind,
  WorkspaceSurfaceRef,
  WorkspaceOutputTopology,
  WorkspaceDependencyRef,
  WorkspaceConventionEnvelope,
  WorkspaceDependencyManifest,
} from "./workspaces.js";
export { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "./workspaces.js";

// Adapters (OPTIONAL specialization — generic provider-boundary contract;
// orthogonal, applies across any kit family. docs/ADAPTER_CONTRACTS_V1.md)
export type {
  AdapterKind,
  AdapterMode,
  AdapterInputRef,
  AdapterOutputRef,
  NormalizedConnectionRef,
  AdapterContractRef,
} from "./adapters.js";
export { ADAPTER_CONTRACT_VERSION } from "./adapters.js";

// Pipeline trace (additive stage-boundary event shapes —
// docs/PIPELINE_TRACE_CONVENTION_V1.md). Distinct from `./events.ts`,
// which types hosted CLI/SDK ExecutionEvent NDJSON streams.
export type {
  PipelineTraceEventType,
  PipelineTraceEnvelope,
  PipelineStageStartedEvent,
  PipelineStageCompletedEvent,
  PipelineStageFailedEvent,
  PipelineArtifactWrittenEvent,
  PipelineHandoffCreatedEvent,
  PipelineTraceEvent,
} from "./pipeline-trace.js";
export { isPipelineTraceEvent, PIPELINE_TRACE_VERSION } from "./pipeline-trace.js";

// Kit health (UNIVERSAL — health reports + maturity scores; applies to
// every kit, not just pipeline kits. docs/WORKER_KIT_CONTRACT_V1.md § health)
export type {
  KitHealthSeverity,
  KitHealthCheck,
  KitHealthReport,
  KitMaturityDimension,
  KitMaturityScore,
} from "./health.js";
export { KIT_HEALTH_REPORT_VERSION } from "./health.js";

// Version sentinel — surfaces may read this to confirm they are talking
// to the v1 contract surface. Additive changes keep this literal `1`.
export const API_CONTRACT_VERSION = 1 as const;
