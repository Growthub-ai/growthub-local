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
// ---------------------------------------------------------------------------
// Allowlist + protected-field vocabulary
// ---------------------------------------------------------------------------
/** The permanent `PATCH /api/workspace` allowlist. */
export const WORKSPACE_PATCH_ALLOWED_FIELDS = [
    "dashboards",
    "widgetTypes",
    "canvas",
    "dataModel",
];
/**
 * Live workflow fields on sandbox-environment rows. Publish-owned: only
 * `POST /api/workspace/workflow/publish` may change them. Direct PATCH may
 * only echo persisted values. `version` increments and the
 * `lifecycleStatus: "live"` transition are equally publish-owned.
 */
export const WORKSPACE_LIVE_WORKFLOW_FIELDS = [
    "orchestrationGraph",
    "orchestrationConfig",
    "orchestrationPublishedAt",
    "orchestrationDeltas",
];
/** Draft workflow fields — direct PATCH may save these freely. */
export const WORKSPACE_DRAFT_WORKFLOW_FIELDS = [
    "orchestrationDraftGraph",
    "orchestrationDraftConfig",
    "orchestrationDraftStatus",
    "orchestrationDraftUpdatedAt",
    "orchestrationDraftBaseVersion",
    "orchestrationDraftTestPassed",
    "orchestrationDraftTestedConfig",
    "orchestrationDraftLastRunId",
    "orchestrationDraftLastTested",
    "orchestrationDraftLastResponse",
];
// ---------------------------------------------------------------------------
// Guards + version sentinel
// ---------------------------------------------------------------------------
export function isWorkspacePatchPolicyRejection(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.error === "patch rejected by workspace mutation policy" &&
        Array.isArray(value.violations));
}
export function isWorkflowPublishSuccess(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.ok === true &&
        typeof value.version === "string" &&
        typeof value.publishedSha256 === "string");
}
/**
 * Surfaces consuming this module may read the sentinel to confirm the v1
 * mutation-boundary contract. Additive changes keep the literal `1`.
 */
export const WORKSPACE_PATCH_CONTRACT_VERSION = 1;
//# sourceMappingURL=workspace-patch.js.map