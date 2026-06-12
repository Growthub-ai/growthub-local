/**
 * @growthub/api-contract — Workspace mutation policy (CMS SDK v1)
 *
 * Public contract for the governed-workspace mutation boundary enforced by
 * the workspace runtime (`growthub-custom-workspace-starter-v1` and every
 * fork):
 *
 *   - `PATCH /api/workspace` — config mutation, permanently allowlisted to
 *     four fields and policed by `lib/workspace-patch-policy.js` before any
 *     write. Policy rejections return HTTP 422 with `violations[]`.
 *   - `POST /api/workspace/patch/preflight` — dry-run of the exact gates the
 *     real PATCH applies (policy + merged-config schema validation), no write.
 *   - `POST /api/workspace/workflow/publish` — the ONLY transition from a
 *     saved, successfully draft-tested orchestration graph to the live
 *     workflow fields. Direct PATCH of live fields is policy-blocked.
 *
 * Type-only plus frozen vocabulary constants, mirroring the helper contract
 * (`./helper.ts`). Runtime truth lives in the workspace app; if a fork's
 * route files diverge, the routes win.
 */
/** The permanent `PATCH /api/workspace` allowlist. */
export declare const WORKSPACE_PATCH_ALLOWED_FIELDS: readonly ["dashboards", "widgetTypes", "canvas", "dataModel"];
export type WorkspacePatchAllowedField = (typeof WORKSPACE_PATCH_ALLOWED_FIELDS)[number];
/**
 * Live workflow fields on sandbox-environment rows. Publish-owned: only
 * `POST /api/workspace/workflow/publish` may change them. Direct PATCH may
 * only echo persisted values. `version` increments and the
 * `lifecycleStatus: "live"` transition are equally publish-owned.
 */
export declare const WORKSPACE_LIVE_WORKFLOW_FIELDS: readonly ["orchestrationGraph", "orchestrationConfig", "orchestrationPublishedAt", "orchestrationDeltas"];
export type WorkspaceLiveWorkflowField = (typeof WORKSPACE_LIVE_WORKFLOW_FIELDS)[number];
/** Draft workflow fields — direct PATCH may save these freely. */
export declare const WORKSPACE_DRAFT_WORKFLOW_FIELDS: readonly ["orchestrationDraftGraph", "orchestrationDraftConfig", "orchestrationDraftStatus", "orchestrationDraftUpdatedAt", "orchestrationDraftBaseVersion", "orchestrationDraftTestPassed", "orchestrationDraftTestedConfig", "orchestrationDraftLastRunId", "orchestrationDraftLastTested", "orchestrationDraftLastResponse"];
export type WorkspaceDraftWorkflowField = (typeof WORKSPACE_DRAFT_WORKFLOW_FIELDS)[number];
/**
 * Stable machine-readable violation codes emitted by the patch policy.
 * Additive: consumers must tolerate unknown codes.
 */
export type WorkspacePatchViolationCode = "invalid_body" | "unknown_field" | "full_config_body" | "source_records_through_patch" | "oversized_patch" | "oversized_object" | "oversized_row" | "oversized_node_config" | "history_smuggling" | "credential_field" | "live_workflow_field" | "live_publish_via_patch";
export interface WorkspacePatchViolation {
    code: WorkspacePatchViolationCode | (string & {});
    /** JSON-path-ish locator, e.g. `dataModel.objects[0].rows[2].version`. */
    path: string;
    /** Human-readable reason, including the governed alternative to use. */
    message: string;
}
/** Size ceilings enforced by the policy (serialized JSON text lengths). */
export interface WorkspacePatchLimits {
    maxPatchBytes: number;
    maxRowBytes: number;
    maxRowsPerObject: number;
    maxNodeConfigBytes: number;
}
export interface WorkspacePatchPolicyRejection {
    error: "patch rejected by workspace mutation policy";
    violations: WorkspacePatchViolation[];
    /** Pointer to the dry-run route. */
    preflight: string;
}
/** The request body is the exact body you intend to PATCH. */
export type WorkspacePatchPreflightRequest = Record<string, unknown>;
export interface WorkspacePatchPreflightResponse {
    /** Overall verdict: policy AND schema both pass. */
    ok: boolean;
    allowed: readonly string[];
    policy: {
        ok: boolean;
        violations: WorkspacePatchViolation[];
    };
    schema: {
        ok: boolean;
        errors: string[];
    };
    persistence: {
        mode: "filesystem" | "read-only" | "database";
        canSave: boolean;
        guidance: string | null;
    } | null;
}
export interface WorkflowPublishRequest {
    /** `dataModel.objects[]` id of the sandbox-environment object. */
    objectId: string;
    /** The row's capital-N `Name` column value. */
    name: string;
}
/** Stable failure codes for publish gates. Additive. */
export type WorkflowPublishFailureCode = "invalid_body" | "object_not_found" | "row_not_found" | "no_draft" | "draft_not_tested" | "draft_changed_after_test" | "draft_run_not_verified" | "invalid_graph" | "invalid_config" | "read_only" | "write_failed";
export interface WorkflowPublishSuccess {
    ok: true;
    objectId: string;
    name: string;
    /** The new (post-increment) row version. */
    version: string;
    publishedAt: string;
    /** Which live field received the draft (`orchestrationConfig` | `orchestrationGraph`). */
    liveField: string;
    /** sha256 of the published serialized graph — also recorded in the delta entry. */
    publishedSha256: string;
    /** Full persisted config after the publish write. */
    workspaceConfig: Record<string, unknown>;
}
export interface WorkflowPublishFailure {
    ok: false;
    code: WorkflowPublishFailureCode | (string & {});
    error: string;
    /** Present on `draft_changed_after_test`. */
    draftSha256?: string;
    testedSha256?: string;
    /** Present on `invalid_graph` / `invalid_config`. */
    details?: string[];
    /** Present on `read_only`. */
    guidance?: string | null;
}
export type WorkflowPublishResponse = WorkflowPublishSuccess | WorkflowPublishFailure;
export declare function isWorkspacePatchPolicyRejection(value: unknown): value is WorkspacePatchPolicyRejection;
export declare function isWorkflowPublishSuccess(value: unknown): value is WorkflowPublishSuccess;
/**
 * Surfaces consuming this module may read the sentinel to confirm the v1
 * mutation-boundary contract. Additive changes keep the literal `1`.
 */
export declare const WORKSPACE_PATCH_CONTRACT_VERSION: 1;
//# sourceMappingURL=workspace-patch.d.ts.map