/**
 * @growthub/api-contract — Agent Outcome Loop V1 (CMS SDK v1)
 *
 * The positive-governance layer above the workspace mutation boundary
 * (`./workspace-patch`). The mutation firewall answers "can this change
 * happen?"; this contract answers "what outcome did the agent produce,
 * what proves it, and how does the next agent continue from it?".
 *
 * Every mutation lane in the workspace runtime emits the same canonical
 * receipt into the existing source-record sidecar
 * (`growthub.source-records.json`) under the stable source id
 * `workspace:agent-outcomes` — no new persistence backend:
 *
 *   - `PATCH /api/workspace`                  → kind "direct-patch"
 *   - `POST /api/workspace/patch/preflight`   → kind "patch-preflight" (blocked only)
 *   - `POST /api/workspace/sandbox-run`       → kind "sandbox-run"
 *   - `POST /api/workspace/workflow/publish`  → kind "workflow-publish"
 *   - `POST /api/workspace/helper/apply`      → kind "helper-apply"
 *
 * Read side: `GET /api/workspace/agent-outcomes` returns the receipt
 * stream plus the derived governance summary (the cockpit data model).
 *
 * Type-only plus frozen vocabulary constants. Runtime truth lives in the
 * workspace app (`lib/workspace-outcome-receipts.js`).
 */
// ---------------------------------------------------------------------------
// Receipt vocabulary
// ---------------------------------------------------------------------------
/** Which mutation/proof lane produced the receipt. Additive union. */
export const AGENT_OUTCOME_RECEIPT_KINDS = [
    "patch-preflight",
    "direct-patch",
    "helper-apply",
    "sandbox-run",
    "workflow-publish",
    "agent-outcome",
];
/** Where the receipt sits in the outcome lifecycle. Additive union. */
export const AGENT_OUTCOME_STATUSES = [
    "blocked",
    "drafted",
    "tested",
    "published",
    "failed",
    "verified",
];
// ---------------------------------------------------------------------------
// Receipt stream + governance summary (cockpit data model)
// ---------------------------------------------------------------------------
/** Stable sidecar source id the receipt stream is stored under. */
export const AGENT_OUTCOMES_SOURCE_ID = "workspace:agent-outcomes";
// ---------------------------------------------------------------------------
// The canonical agent loop (recipe — sequence logic agents must not invent)
// ---------------------------------------------------------------------------
/**
 * Agent Outcome Loop V1. Each step names the route that owns it. The SDK
 * stays type-only; this constant is the blessed sequence a client wrapper
 * or an agent follows verbatim instead of hand-rolling route order.
 */
export const WORKSPACE_AGENT_LOOP_V1 = [
    { step: "understand", call: "GET /api/workspace" },
    { step: "preflight", call: "POST /api/workspace/patch/preflight" },
    { step: "draft", call: "PATCH /api/workspace (allowlisted keys / draft fields only)" },
    { step: "prove", call: "POST /api/workspace/sandbox-run (useDraft:true for workflow drafts)" },
    { step: "publish", call: "POST /api/workspace/workflow/publish (workflow drafts) or the PATCH above (plain config)" },
    { step: "receipt", call: "GET /api/workspace/agent-outcomes (verify your receipt; cite receiptId)" },
];
// ---------------------------------------------------------------------------
// Guards + version sentinel
// ---------------------------------------------------------------------------
export function isAgentOutcomeReceipt(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.receiptId === "string" &&
        typeof value.kind === "string" &&
        typeof value.outcomeStatus === "string" &&
        typeof value.summary === "string" &&
        typeof value.createdAt === "string");
}
/** Additive changes keep the literal `1`. */
export const WORKSPACE_OUTCOME_CONTRACT_VERSION = 1;
//# sourceMappingURL=workspace-outcome.js.map