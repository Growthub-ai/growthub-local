/**
 * Growthub Workspace Contract-Compliance V1 — governed-mutation predicate.
 *
 * Given a PROPOSED mutation and a role/SKILL contract, derive the set of proofs,
 * ledgers, and review states that must be satisfied for the mutation to be
 * legal — and which of those are already satisfied by the supplied evidence.
 *
 * This is a PURE PREDICATE over law artifacts the caller already holds (the
 * contract rules + the evidence gathered from receipts/review state). It reads
 * NO state itself, writes nothing, and exposes no secrets. It does not widen
 * any mutation boundary — it only reports what the existing governed lanes
 * require, the same rules the `governed-workspace-mutation` SKILL encodes:
 *   - live workflow fields are never PATCHed directly — they need a draft, a
 *     proving sandbox-run, then publish;
 *   - dataModel / dashboard mutations need a preflight receipt;
 *   - anything outside the PATCH allowlist is rejected by construction.
 *
 * Default contract (when none supplied) mirrors the shipped boundary so the
 * predicate is useful out of the box; callers pass a stricter contract per role.
 */

const CONTRACT_COMPLIANCE_KIND = "growthub-workspace-contract-compliance-v1";
const CONTRACT_COMPLIANCE_VERSION = 1;

// The permanent PATCH allowlist — the floor every contract inherits.
const DEFAULT_ALLOWED_FIELDS = ["dashboards", "widgetTypes", "canvas", "dataModel"];

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultContract() {
  return {
    role: "default",
    allowedFields: DEFAULT_ALLOWED_FIELDS.slice(),
    // Field groups that require a recorded preflight receipt before the write.
    requiresReceiptFor: ["dataModel", "dashboards"],
    // Field groups that require a human/super-admin review state.
    requiresReviewFor: [],
    // Live workflow changes must go draft → sandbox-run proof → publish.
    liveWorkflowRequiresPublishProof: true
  };
}

/**
 * @param {object} mutation the proposed change.
 *   `{ changedFields: string[], touchesLiveWorkflow?: boolean, lane?: string }`
 * @param {object} [contract] role/SKILL contract (see `defaultContract`).
 * @param {object} [evidence] proof already gathered.
 *   `{ hasPreflightReceipt?: boolean, hasPublishProof?: boolean, reviewState?: string }`
 * @returns {object} `{ kind, version, role, compliant, required[], satisfied[], missing[], violations[], nextAction, summary }`
 */
function deriveContractCompliance(mutation, contract, evidence = {}) {
  const rules = { ...defaultContract(), ...(contract && typeof contract === "object" ? contract : {}) };
  const role = safeString(rules.role) || "default";

  const empty = (warning) => ({
    kind: CONTRACT_COMPLIANCE_KIND,
    version: CONTRACT_COMPLIANCE_VERSION,
    role,
    compliant: false,
    required: [],
    satisfied: [],
    missing: [],
    violations: warning ? [{ code: "invalid_input", message: warning }] : [],
    nextAction: null,
    summary: warning || "No compliance computed."
  });

  if (!mutation || typeof mutation !== "object") return empty("mutation missing or malformed");

  const changedFields = asArray(mutation.changedFields).map(safeString).filter(Boolean);
  const allowed = new Set(asArray(rules.allowedFields).map(safeString));
  const required = [];
  const satisfied = [];
  const missing = [];
  const violations = [];

  // 1. Allowlist — disallowed fields are a hard violation (rejected by the route).
  for (const field of changedFields) {
    if (!allowed.has(field)) {
      violations.push({
        code: "field_not_allowed",
        field,
        message: `Field "${field}" is outside the PATCH allowlist (${Array.from(allowed).join(", ")}).`
      });
    }
  }

  // 2. Preflight receipt requirement.
  const receiptGroups = new Set(asArray(rules.requiresReceiptFor).map(safeString));
  if (changedFields.some((f) => receiptGroups.has(f))) {
    const req = { code: "preflight_receipt", message: "A recorded patch-preflight receipt is required." };
    required.push(req);
    (evidence.hasPreflightReceipt ? satisfied : missing).push(req);
  }

  // 3. Review state requirement.
  const reviewGroups = new Set(asArray(rules.requiresReviewFor).map(safeString));
  if (changedFields.some((f) => reviewGroups.has(f))) {
    const req = { code: "review_state", message: "A human/super-admin review state is required (e.g. approved)." };
    required.push(req);
    const reviewOk = ["approved", "accepted", "merged"].includes(safeString(evidence.reviewState).toLowerCase());
    (reviewOk ? satisfied : missing).push(req);
  }

  // 4. Live workflow proof chain.
  if (mutation.touchesLiveWorkflow && rules.liveWorkflowRequiresPublishProof) {
    const req = { code: "publish_proof", message: "Live workflow change requires draft → sandbox-run proof → publish." };
    required.push(req);
    (evidence.hasPublishProof ? satisfied : missing).push(req);
  }

  const compliant = violations.length === 0 && missing.length === 0;
  const nextAction = violations.length
    ? `Remove disallowed field(s): ${violations.filter((v) => v.code === "field_not_allowed").map((v) => v.field).join(", ") || "see violations"}.`
    : (missing[0]
      ? missingNextAction(missing[0])
      : (compliant ? "Compliant — proceed through the governed PATCH/publish lane." : null));

  return {
    kind: CONTRACT_COMPLIANCE_KIND,
    version: CONTRACT_COMPLIANCE_VERSION,
    role,
    compliant,
    required,
    satisfied,
    missing,
    violations,
    nextAction,
    summary: summarizeCompliance(role, compliant, required, missing, violations)
  };
}

function missingNextAction(req) {
  switch (req.code) {
    case "preflight_receipt": return "Run POST /api/workspace/patch/preflight and record the receipt before PATCH.";
    case "review_state": return "Obtain an approved review state before applying.";
    case "publish_proof": return "Save a draft, prove it with sandbox-run, then POST /api/workspace/workflow/publish.";
    default: return `Satisfy: ${req.message}`;
  }
}

function summarizeCompliance(role, compliant, required, missing, violations) {
  if (violations.length) {
    return `Non-compliant (${role}): ${violations.length} hard violation(s) — ${violations[0].message}`;
  }
  if (compliant) {
    return required.length
      ? `Compliant (${role}): all ${required.length} requirement(s) satisfied.`
      : `Compliant (${role}): no governed requirements triggered.`;
  }
  return `Non-compliant (${role}): ${missing.length} of ${required.length} requirement(s) unmet.`;
}

export {
  CONTRACT_COMPLIANCE_KIND,
  CONTRACT_COMPLIANCE_VERSION,
  DEFAULT_ALLOWED_FIELDS,
  defaultContract,
  deriveContractCompliance,
  summarizeCompliance
};
