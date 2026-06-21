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
 *   - `@growthub/api-contract/bridge`          — Growthub bridge resources
 *   - `@growthub/api-contract/helper`          — workspace helper propose/apply
 *   - `@growthub/api-contract/workspace-patch` — governed mutation boundary
 *   - `@growthub/api-contract/workspace-outcome` — Agent Outcome Loop V1
 *   - `@growthub/api-contract/workspace-apps`  — Application Control Plane V1
 *   - `@growthub/api-contract/resolver-registry` — Unified API Resolver Registry (1.5.1)
 */
export type { CapabilityFamily, CapabilityExecutionKind, CapabilityNodeType, CapabilityVisibility, CapabilityExecutionStrategy, CapabilityExecutionBinding, CapabilityExecutionTokens, CapabilityRecord, CapabilityNode, CapabilityQuery, CapabilityRegistrySource, CapabilityRegistryMeta, } from "./capabilities.js";
export { CAPABILITY_FAMILIES } from "./capabilities.js";
export type { BridgeAssetType, BridgeAssetSource, BridgeAssetItem, BridgePagination, BridgeAssetListResponse, BridgeBrandKit, BridgeBrandAsset, BridgeBrandKitListResponse, BridgeBrandAssetListResponse, BridgeKnowledgeItem, BridgeKnowledgeTable, BridgeKnowledgeListResponse, BridgeKnowledgeTableListResponse, BridgeKnowledgeSaveInput, BridgeKnowledgeSaveResponse, BridgeKnowledgeMetadataPatchInput, BridgeRunOutputSyncInput, BridgeMcpAccount, BridgeMcpAccountsResponse, BridgeHostedAgentSourceStatus, BridgeHostedAgentSourceDiagnostics, BridgeHostedAgentDiagnostics, BridgeHostedAgentManifest, BridgeHostedAgentManifestListResponse, BridgeHostedAgentManifestResponse, BridgeHostedAgentWorkspaceBinding, BridgeHostedAgentWorkspaceBindingResponse, BridgeHostedAgentWorkspaceBindingsResponse, } from "./bridge.js";
export type { ExecutionMode, ExecuteNodePayload, ExecuteWorkflowInput, ExecuteWorkflowResult, WorkflowExecutionStatus, NodeExecutionStatus, NodeResult, ExecutionArtifactRef, WorkflowExecutionSummary, } from "./execution.js";
export type { ProviderStatus, ProviderRecord, ProviderAssemblyInput, ProviderAssemblyStatus, ProviderAssemblyResult, ProviderAssemblyHints, } from "./providers.js";
export type { PreferredExecutionMode, ExecutionDefaults, Entitlement, GatedCapabilityRef, Profile, } from "./profile.js";
export type { ExecutionEventType, NodeStartEvent, NodeCompleteEvent, NodeErrorEvent, CreditWarningEvent, ProgressEvent, CompleteEvent, ErrorEvent, ExecutionEvent, } from "./events.js";
export { isExecutionEvent } from "./events.js";
export type { ManifestOriginType, ManifestProvenance, CapabilityExecutionHints, CapabilityManifest, ManifestDriftMarker, ManifestDriftReport, CapabilityManifestEnvelope, } from "./manifests.js";
export type { NodeInputUiHint, NodeInputProviderNeutralIntent, NodeInputExecutionModeHints, TextField, LongTextField, NumberField, BooleanField, SelectOption, SelectField, ArrayField, JsonField, UrlField, FileField, UrlOrFileField, NodeInputField, NodeOutputFieldType, NodeOutputField, NodeInputSchema, NodeOutputSchema, NodeInputAttachment, } from "./schemas.js";
export type { SkillHelperRef, SkillSubSkillRef, SkillSelfEval, SkillSessionMemory, SkillSource, SkillManifest, SkillNode, SkillCatalog, } from "./skills.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";
export type { WorkerKitCapabilityType, WorkerKitExecutionMode, WorkerKitActivationMode, WorkerKitFamily, WorkerKitVisibility, WorkerKitCompatibility, WorkerKitInstallMetadata, WorkerKitUIMetadata, WorkerKitProvenance, WorkerKitIdentityV1, WorkerKitIdentityV2, WorkerKitEntrypoint, WorkerKitBundleRef, WorkerKitOutputType, WorkerKitOutputStandard, WorkerKitManifestV1, WorkerKitManifestV2, WorkerKitManifest, WorkerKitBundleIdentity, WorkerKitBundleExportSpec, WorkerKitBundleManifestV1, WorkerKitBundleManifestV2, WorkerKitBundleManifest, } from "./worker-kits.js";
export { WORKER_KIT_FAMILIES, WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS, WORKER_KIT_LATEST_SCHEMA_VERSION, isWorkerKitManifestV1, isWorkerKitManifestV2, isWorkerKitBundleManifestV1, isWorkerKitBundleManifestV2, isAppKit, } from "./worker-kits.js";
export type { PipelineArtifactRef, PipelineAdapterModeRef, PipelineTraceExpectation, PipelineStageRef, PipelineOutputTopology, PipelineTracePolicy, PipelineSessionMemoryPolicy, PipelineConventionEnvelope, PipelineKitManifest, } from "./pipeline-kits.js";
export { PIPELINE_KIT_MANIFEST_VERSION } from "./pipeline-kits.js";
export type { WorkspaceDependencyKind, WorkspaceSurfaceRef, WorkspaceOutputTopology, WorkspaceDependencyRef, WorkspaceConventionEnvelope, WorkspaceDependencyManifest, } from "./workspaces.js";
export { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "./workspaces.js";
export type { AdapterKind, AdapterMode, AdapterInputRef, AdapterOutputRef, LocalModelRuntimeRef, LocalModelAdapterOutputRef, NormalizedConnectionRef, AdapterContractRef, } from "./adapters.js";
export { ADAPTER_CONTRACT_VERSION } from "./adapters.js";
export type { PipelineTraceEventType, PipelineTraceEnvelope, PipelineStageStartedEvent, PipelineStageCompletedEvent, PipelineStageFailedEvent, PipelineArtifactWrittenEvent, PipelineHandoffCreatedEvent, PipelineTraceEvent, } from "./pipeline-trace.js";
export { isPipelineTraceEvent, PIPELINE_TRACE_VERSION } from "./pipeline-trace.js";
export type { KitHealthSeverity, KitHealthCheck, KitHealthReport, KitMaturityDimension, KitMaturityScore, } from "./health.js";
export { KIT_HEALTH_REPORT_VERSION } from "./health.js";
export type { WorkspaceHelperIntent, WorkspaceHelperProposal, WorkspaceProposalType, WorkspaceHelperReceipt, WorkspaceHelperSnapshot, WorkspaceHelperQuery, WorkspaceHelperResponse, WorkspaceHelperApplyRequest, WorkspaceHelperApplyReceipt, WorkspaceHelperApplyResponse, WorkspaceHelperNodeInput, WorkspaceHelperNodeOutput, WorkspaceHelperCapabilityManifest, } from "./helper.js";
export { WORKSPACE_HELPER_INTENT_VALUES, WORKSPACE_HELPER_PROPOSAL_TYPES, PROPOSAL_TYPE_TO_PATCH_FIELD, isWorkspaceHelperResponse, isWorkspaceProposal, WORKSPACE_HELPER_CONTRACT_VERSION, } from "./helper.js";
export type { WorkspacePatchAllowedField, WorkspaceLiveWorkflowField, WorkspaceDraftWorkflowField, WorkspacePatchViolationCode, WorkspacePatchViolation, WorkspacePatchLimits, WorkspacePatchPolicyRejection, WorkspacePatchPreflightRequest, WorkspacePatchPreflightResponse, WorkflowPublishRequest, WorkflowPublishFailureCode, WorkflowPublishSuccess, WorkflowPublishFailure, WorkflowPublishResponse, } from "./workspace-patch.js";
export { WORKSPACE_PATCH_ALLOWED_FIELDS, WORKSPACE_LIVE_WORKFLOW_FIELDS, WORKSPACE_DRAFT_WORKFLOW_FIELDS, isWorkspacePatchPolicyRejection, isWorkflowPublishSuccess, WORKSPACE_PATCH_CONTRACT_VERSION, } from "./workspace-patch.js";
export type { AgentOutcomeReceiptKind, AgentOutcomeStatus, AgentOutcomeLane, AgentOutcomeObjectRef, AgentOutcomeReceipt, WorkspaceGovernanceSummary, AgentOutcomesResponse, } from "./workspace-outcome.js";
export { AGENT_OUTCOME_RECEIPT_KINDS, AGENT_OUTCOME_STATUSES, AGENT_OUTCOMES_SOURCE_ID, WORKSPACE_AGENT_LOOP_V1, isAgentOutcomeReceipt, WORKSPACE_OUTCOME_CONTRACT_VERSION, } from "./workspace-outcome.js";
export type { AppSurfaceRow, AppHealthStatus, AppLinkRollup, AppNextAction, AppAssignmentPacket, WorkspaceAppEntry, DetectedAppSurface, WorkspaceFleetSummary, WorkspaceAppsResponse, } from "./workspace-apps.js";
export { APP_REGISTRY_OBJECT_ID, APP_SURFACE_OBJECT_TYPE, isAppAssignmentPacket, WORKSPACE_APPS_CONTRACT_VERSION, } from "./workspace-apps.js";
export type { ResolverConnectorKind, ResolverProvenance, ResolverRecordRef, ResolverShapeProfile, ResolverNextAction, ResolverRegistryEntry, ResolverRegistrySummary, ResolverRegistryIndex, UnifiedResolverRegistryResponse, ResolverEndpointManifest, } from "./resolver-registry.js";
export { RESOLVER_CONNECTOR_KINDS, RESOLVER_PROVENANCE_VALUES, RESOLVER_REGISTRY_INDEX_KIND, RESOLVER_ENDPOINT_MANIFEST_KIND, RESOLVER_REGISTRY_DIR, RESOLVER_REGISTRY_INDEX_FILE, RESOLVER_ENDPOINT_MANIFEST_FILE, RESOLVER_ENDPOINT_BASE, RESOLVER_GENERATED_BANNER, isResolverRegistryIndex, WORKSPACE_RESOLVER_REGISTRY_CONTRACT_VERSION, } from "./resolver-registry.js";
export declare const API_CONTRACT_VERSION: 1;
//# sourceMappingURL=index.d.ts.map