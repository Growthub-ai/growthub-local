/**
 * Training runtime state — the composed lifecycle machine. Pure: no React,
 * no fetch, no fs. Builds ON TOP of deriveTrainingLedgerState (PR #229's
 * evidence spine) and deriveTrainingRunState (the governed run-receipt
 * layer) without re-deriving or weakening either.
 *
 * The correction this encodes: "export the corpus and train elsewhere" is
 * NOT the product boundary. Growthub Local owns the run lifecycle. PR #229
 * compresses the ladder to seven public states; this deriver splits the
 * `exported → deployed` plateau into the honest internal sub-states the
 * run receipts prove:
 *
 *   blocked → eligible → exported → prepared → running → trained →
 *   imported → deployed → verified → sandbox-ready → complete
 *
 * Additivity invariant: the run sub-states ONLY refine the `exported`
 * plateau. Once the ledger reaches `deployed`/`verified`/`sandbox-ready`/
 * `complete` from registry + sandbox proof, that stronger evidence stands
 * unchanged (PR #229's seed/QA path is never demoted). A deployed model
 * with no run receipt surfaces as `runGap` for the drivers to flag — it is
 * a recommendation, not a demotion.
 */

import { deriveTrainingLedgerState, parseExportSummary } from "./training-ledger.js";
import { deriveTrainingRunState } from "./training-run-receipts.js";

/** Internal refined states, ordered. */
export const RUNTIME_STATES = [
  "blocked", "eligible", "exported", "prepared", "running",
  "trained", "imported", "deployed", "verified", "sandbox-ready", "complete",
];

/** Map an internal refined state to PR #229's seven public states. */
export function toPublicState(state) {
  if (state === "prepared" || state === "running" || state === "trained" || state === "imported") return "exported";
  return state;
}

const NEXT_BY_STATE = {
  blocked: "Gather governed traces from real workspace work.",
  eligible: "Export the governed training corpus.",
  exported: "Prepare a training run — pick a profile and reserve the tuned tag.",
  prepared: "Execute the prepared training run.",
  running: "Finish the run and import the resulting artifact.",
  trained: "Import the artifact identity (path + sha256 + model tag) back into the ledger.",
  imported: "Register the model endpoint in the API Registry.",
  deployed: "Test the endpoint — the response must serve the tuned tag.",
  verified: "Bind the verified model into a sandbox/workflow.",
  "sandbox-ready": "Run the sandbox smoke to produce run proof.",
  complete: "Verified and runnable — keep improving from new usage evidence.",
};

/** Gather every export id the slug knows about (row stamp + sidecar history). */
function knownExportIdsFor(workspaceConfig, workspaceSourceRecords, slug) {
  const ids = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const o of objects) {
    if (o?.objectType !== "model-training") continue;
    for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
      if (String(r?.lastExportId || "").trim()) ids.add(String(r.lastExportId).trim());
      const summary = parseExportSummary(r?.lastExportSummary);
      if (summary?.exportId) ids.add(String(summary.exportId));
    }
  }
  const sidecar = workspaceSourceRecords?.[`training:model-training:${slug}`];
  for (const rec of (Array.isArray(sidecar?.records) ? sidecar.records : [])) {
    if (rec?.exportId) ids.add(String(rec.exportId));
  }
  return [...ids];
}

/**
 * Derive the composed runtime state. Pure, never throws.
 */
export function deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug = "workspace-local" } = {}) {
  const ledger = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords });
  const knownExportIds = knownExportIdsFor(workspaceConfig, workspaceSourceRecords, slug);
  const runState = deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug, knownExportIds });

  const ledgerState = ledger.eligibility?.state || "blocked";
  let state = ledgerState;

  // Refine ONLY the exported plateau with run-receipt evidence.
  if (ledgerState === "exported" && runState.present) {
    const map = { prepared: "prepared", running: "running", trained: "trained", imported: "imported", failed: "exported" };
    state = map[runState.runState] || "exported";
  }

  // A ledger past `exported` with no run receipt is a legacy/registry-first
  // path — flag the gap, never demote the proven registry/sandbox evidence.
  const advancedStates = new Set(["deployed", "verified", "sandbox-ready", "complete"]);
  const runGap = advancedStates.has(ledgerState) && !runState.present;

  return {
    state,
    publicState: toPublicState(state),
    next: NEXT_BY_STATE[state] || ledger.eligibility?.next || "",
    runGap,
    ledger,
    runState,
    identityChain: ledger.identityChain,
    knownExportIds,
  };
}
