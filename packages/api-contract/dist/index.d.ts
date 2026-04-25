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
export type { CapabilityFamily, CapabilityExecutionKind, CapabilityNodeType, CapabilityVisibility, CapabilityExecutionStrategy, CapabilityExecutionBinding, CapabilityExecutionTokens, CapabilityRecord, CapabilityNode, CapabilityQuery, CapabilityRegistrySource, CapabilityRegistryMeta, } from "./capabilities.js";
export { CAPABILITY_FAMILIES } from "./capabilities.js";
export type { ExecutionMode, ExecuteNodePayload, ExecuteWorkflowInput, ExecuteWorkflowResult, WorkflowExecutionStatus, NodeExecutionStatus, NodeResult, ExecutionArtifactRef, WorkflowExecutionSummary, } from "./execution.js";
export type { ProviderStatus, ProviderRecord, ProviderAssemblyInput, ProviderAssemblyStatus, ProviderAssemblyResult, ProviderAssemblyHints, } from "./providers.js";
export type { PreferredExecutionMode, ExecutionDefaults, Entitlement, GatedCapabilityRef, Profile, } from "./profile.js";
export type { ExecutionEventType, NodeStartEvent, NodeCompleteEvent, NodeErrorEvent, CreditWarningEvent, ProgressEvent, CompleteEvent, ErrorEvent, ExecutionEvent, } from "./events.js";
export { isExecutionEvent } from "./events.js";
export type { ManifestOriginType, ManifestProvenance, CapabilityExecutionHints, CapabilityManifest, ManifestDriftMarker, ManifestDriftReport, CapabilityManifestEnvelope, } from "./manifests.js";
export type { NodeInputUiHint, NodeInputProviderNeutralIntent, NodeInputExecutionModeHints, TextField, LongTextField, NumberField, BooleanField, SelectOption, SelectField, ArrayField, JsonField, UrlField, FileField, UrlOrFileField, NodeInputField, NodeOutputFieldType, NodeOutputField, NodeInputSchema, NodeOutputSchema, NodeInputAttachment, } from "./schemas.js";
export type { SkillHelperRef, SkillSubSkillRef, SkillSelfEval, SkillSessionMemory, SkillSource, SkillManifest, SkillNode, SkillCatalog, } from "./skills.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";
export type { PipelineArtifactRef, PipelineAdapterModeRef, PipelineTraceExpectation, PipelineStageRef, PipelineOutputTopology, PipelineTracePolicy, PipelineSessionMemoryPolicy, PipelineConventionEnvelope, PipelineKitManifest, } from "./pipeline-kits.js";
export { PIPELINE_KIT_MANIFEST_VERSION } from "./pipeline-kits.js";
export type { WorkspaceDependencyKind, WorkspaceSurfaceRef, WorkspaceOutputTopology, WorkspaceDependencyRef, WorkspaceConventionEnvelope, WorkspaceDependencyManifest, } from "./workspaces.js";
export { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "./workspaces.js";
export type { AdapterKind, AdapterMode, AdapterInputRef, AdapterOutputRef, NormalizedConnectionRef, AdapterContractRef, } from "./adapters.js";
export { ADAPTER_CONTRACT_VERSION } from "./adapters.js";
export type { PipelineTraceEventType, PipelineTraceEnvelope, PipelineStageStartedEvent, PipelineStageCompletedEvent, PipelineStageFailedEvent, PipelineArtifactWrittenEvent, PipelineHandoffCreatedEvent, PipelineTraceEvent, } from "./pipeline-trace.js";
export { isPipelineTraceEvent, PIPELINE_TRACE_VERSION } from "./pipeline-trace.js";
export type { KitHealthSeverity, KitHealthCheck, KitHealthReport, KitMaturityDimension, KitMaturityScore, } from "./health.js";
export { KIT_HEALTH_REPORT_VERSION } from "./health.js";
export declare const API_CONTRACT_VERSION: 1;
//# sourceMappingURL=index.d.ts.map