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
 *   - `@growthub/api-contract/pipeline-kits`
 *   - `@growthub/api-contract/workspaces`
 *   - `@growthub/api-contract/adapters`
 *   - `@growthub/api-contract/pipeline-trace`
 *   - `@growthub/api-contract/health`
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

// Pipeline Kits (multi-stage governed-workspace pipeline contract —
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

// Workspaces (external dependencies + surfaces + output topology —
// docs/PIPELINE_KIT_CONTRACT_V1.md § external dependency contract)
export type {
  WorkspaceDependencyKind,
  WorkspaceSurfaceRef,
  WorkspaceOutputTopology,
  WorkspaceDependencyRef,
  WorkspaceConventionEnvelope,
  WorkspaceDependencyManifest,
} from "./workspaces.js";
export { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "./workspaces.js";

// Adapters (generic provider-boundary contract — docs/ADAPTER_CONTRACTS_V1.md)
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

// Kit health (health reports + maturity scores —
// docs/PIPELINE_KIT_CONTRACT_V1.md § validation)
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
