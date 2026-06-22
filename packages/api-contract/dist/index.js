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
 *   - `@growthub/api-contract/workspaces`      — external-dep specialization
 *   - `@growthub/api-contract/adapters`        — provider-boundary specialization
 *   - `@growthub/api-contract/bridge`          — Growthub bridge resources
 *   - `@growthub/api-contract/helper`          — workspace helper propose/apply
 *   - `@growthub/api-contract/workspace-patch` — governed mutation boundary
 *   - `@growthub/api-contract/workspace-outcome` — Agent Outcome Loop V1
 *   - `@growthub/api-contract/workspace-apps`  — Application Control Plane V1
 *   - `@growthub/api-contract/resolver-registry` — Unified API Resolver Registry (1.5.1)
 */
export { CAPABILITY_FAMILIES } from "./capabilities.js";
export { isExecutionEvent } from "./events.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";
export { WORKER_KIT_FAMILIES, WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS, WORKER_KIT_LATEST_SCHEMA_VERSION, isWorkerKitManifestV1, isWorkerKitManifestV2, isWorkerKitBundleManifestV1, isWorkerKitBundleManifestV2, isAppKit, } from "./worker-kits.js";
export { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "./workspaces.js";
export { ADAPTER_CONTRACT_VERSION } from "./adapters.js";
export { WORKSPACE_HELPER_INTENT_VALUES, WORKSPACE_HELPER_PROPOSAL_TYPES, PROPOSAL_TYPE_TO_PATCH_FIELD, isWorkspaceHelperResponse, isWorkspaceProposal, WORKSPACE_HELPER_CONTRACT_VERSION, } from "./helper.js";
export { WORKSPACE_PATCH_ALLOWED_FIELDS, WORKSPACE_LIVE_WORKFLOW_FIELDS, WORKSPACE_DRAFT_WORKFLOW_FIELDS, isWorkspacePatchPolicyRejection, isWorkflowPublishSuccess, WORKSPACE_PATCH_CONTRACT_VERSION, } from "./workspace-patch.js";
export { AGENT_OUTCOME_RECEIPT_KINDS, AGENT_OUTCOME_STATUSES, AGENT_OUTCOMES_SOURCE_ID, WORKSPACE_AGENT_LOOP_V1, isAgentOutcomeReceipt, WORKSPACE_OUTCOME_CONTRACT_VERSION, } from "./workspace-outcome.js";
export { APP_REGISTRY_OBJECT_ID, APP_SURFACE_OBJECT_TYPE, isAppAssignmentPacket, WORKSPACE_APPS_CONTRACT_VERSION, } from "./workspace-apps.js";
export { RESOLVER_CONNECTOR_KINDS, RESOLVER_PROVENANCE_VALUES, RESOLVER_REGISTRY_INDEX_KIND, RESOLVER_ENDPOINT_MANIFEST_KIND, RESOLVER_REGISTRY_DIR, RESOLVER_REGISTRY_INDEX_FILE, RESOLVER_ENDPOINT_MANIFEST_FILE, RESOLVER_ENDPOINT_BASE, RESOLVER_GENERATED_BANNER, isResolverRegistryIndex, WORKSPACE_RESOLVER_REGISTRY_CONTRACT_VERSION, } from "./resolver-registry.js";
// Version sentinel — surfaces may read this to confirm they are talking
// to the v1 contract surface. Additive changes keep this literal `1`.
export const API_CONTRACT_VERSION = 1;
//# sourceMappingURL=index.js.map