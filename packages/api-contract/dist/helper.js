/**
 * @growthub/api-contract — Workspace Helper (v1)
 *
 * Typed surface for the Growthub workspace-native helper: a governed,
 * workspace-grammar-aware planning engine that drafts dashboards, widget
 * layouts, API registry rows, and custom business objects, then returns
 * structured proposals for explicit human review before any mutation.
 *
 * The helper always operates in propose mode first. Mutation is a separate
 * governed apply step (POST /api/workspace/helper/apply) that validates
 * every proposal against the PATCH allowlist before writing.
 *
 * Wire shape: POST /api/workspace/helper/query
 *
 * Rules:
 *   - Additive only. The proposal type registry is append-only.
 *   - No direct mutation. The helper never writes workspace config.
 *   - Secrets never enter the prompt. workspaceSnapshot is sanitized
 *     server-side before being passed to the inference adapter.
 *   - The PATCH allowlist (dashboards, widgetTypes, canvas, dataModel)
 *     is the ceiling for every proposal type.
 */
export const WORKSPACE_HELPER_INTENT_VALUES = [
    "build_dashboard",
    "create_widget",
    "register_api",
    "create_object",
    "edit_view",
    "repair",
    "explain",
    "swarm",
];
export const WORKSPACE_HELPER_PROPOSAL_TYPES = [
    "dashboard.create",
    "dashboard.update",
    "widgetType.bind",
    "canvas.widget.add",
    "canvas.tab.create",
    "dataModel.object.create",
    "dataModel.object.update",
    "dataModel.row.add",
    "repair.binding",
    "explain.object",
    "swarm.run.propose",
    "swarm.workflow.save",
    "swarm.run.resume",
];
/**
 * Maps each proposal type to the PATCH allowlist key it belongs to.
 * Used by the apply step to route without branching on string prefixes.
 */
export const PROPOSAL_TYPE_TO_PATCH_FIELD = {
    "dashboard.create": "dashboards",
    "dashboard.update": "dashboards",
    "widgetType.bind": "widgetTypes",
    "canvas.widget.add": "canvas",
    "canvas.tab.create": "canvas",
    "dataModel.object.create": "dataModel",
    "dataModel.object.update": "dataModel",
    "dataModel.row.add": "dataModel",
    "repair.binding": "dataModel",
    "explain.object": "dataModel",
    "swarm.run.propose": "dataModel",
    "swarm.workflow.save": "dataModel",
    "swarm.run.resume": "dataModel",
};
// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
export function isWorkspaceHelperResponse(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (typeof v["ok"] === "boolean" &&
        typeof v["summary"] === "string" &&
        Array.isArray(v["proposals"]) &&
        Array.isArray(v["warnings"]) &&
        v["receipts"] !== null &&
        typeof v["receipts"] === "object");
}
export function isWorkspaceProposal(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (typeof v["type"] === "string" &&
        typeof v["payload"] === "object" &&
        v["payload"] !== null &&
        typeof v["rationale"] === "string" &&
        typeof v["affectedField"] === "string");
}
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
export const WORKSPACE_HELPER_CONTRACT_VERSION = 1;
//# sourceMappingURL=helper.js.map