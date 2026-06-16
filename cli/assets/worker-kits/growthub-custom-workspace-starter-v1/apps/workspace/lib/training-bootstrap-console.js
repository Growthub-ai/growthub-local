/**
 * Training bootstrap projection — the first-use closed-loop checklist for the
 * Custom Model Training Runtime, mirroring the CEO bootstrap pattern exactly
 * (ceo-bootstrap-console.js / deriveCeoBootstrapState).
 *
 * PURE deriver — no React, no fetch, no fs, no config writes, no localStorage.
 * It derives TWO modes from workspace state alone:
 *
 *   - "bootstrap"   — shown until the workspace has a training completion
 *                     marker. A state-derived checklist that walks the user
 *                     through the whole loop the FIRST time (understand →
 *                     curate → export → train+import → register → INVOKE →
 *                     complete), cockpit-style.
 *   - "operational" — the existing Training Ledger, after completion.
 *
 * The mode comes from a completion marker on the existing well-known
 * workspace-helper sandbox row (the SAME row CEO uses) — never a browser flag.
 * No new object type, no new API, no new execution path: the checklist is a
 * projection over the existing training runtime state + custom-models evidence,
 * and the one mutation (the marker) is stamped through the existing governed
 * PATCH lane.
 *
 * Completion is gated on config-provable evidence — the API Registry endpoint
 * has returned a chat-completions response carrying the TUNED model tag (a
 * real invocation of the user's local custom model, not the base) — so "done"
 * means the model actually answered as itself, not that a button was clicked.
 */

import { deriveTrainingRuntimeState } from "./training-runtime.js";
import { deriveDistillationPipelineState, MIN_FINETUNE_TRACES } from "./training-ledger.js";
import { deriveCustomModelsState } from "./custom-models-ledger.js";

export const WORKSPACE_HELPER_SANDBOX_OBJECT_ID = "workspace-helper-sandbox";
export const WORKSPACE_HELPER_ROW_NAME = "workspace-helper";
export const TRAINING_BOOTSTRAP_COMPLETE_PROPOSAL_TYPE = "training.bootstrap.complete";
export const TRAINING_BOOTSTRAP_MARKER_FIELD = "trainingBootstrapCompletedAt";
export const TRAINING_BOOTSTRAP_BY_FIELD = "trainingBootstrapCompletedBy";
export const TRAINING_BOOTSTRAP_RECEIPT_FIELD = "trainingBootstrapReceiptId";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findHelperRowLocation(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const objectIndex = objects.findIndex((o) => o?.id === WORKSPACE_HELPER_SANDBOX_OBJECT_ID);
  if (objectIndex < 0) return { objectIndex: -1, rowIndex: -1, object: null, row: null };
  const object = objects[objectIndex];
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  let rowIndex = rows.findIndex((r) => clean(r?.Name) === WORKSPACE_HELPER_ROW_NAME);
  if (rowIndex < 0 && rows.length > 0) rowIndex = 0;
  return { objectIndex, rowIndex, object, row: rowIndex >= 0 ? rows[rowIndex] : null };
}

function readCompletion(workspaceConfig) {
  const { object, row } = findHelperRowLocation(workspaceConfig);
  const at = clean(row?.[TRAINING_BOOTSTRAP_MARKER_FIELD]);
  if (!row || !at) return null;
  return {
    objectId: object?.id || WORKSPACE_HELPER_SANDBOX_OBJECT_ID,
    rowName: clean(row?.Name) || WORKSPACE_HELPER_ROW_NAME,
    completedAt: at,
    completedBy: clean(row?.[TRAINING_BOOTSTRAP_BY_FIELD]) || null,
    receiptId: clean(row?.[TRAINING_BOOTSTRAP_RECEIPT_FIELD]) || null,
  };
}

function item(id, label, status, { guidance = "", evidenceRefs = [], nextAction = null } = {}) {
  return { id, label, status, guidance, evidenceRefs, nextAction };
}

/**
 * Derive the training bootstrap state from workspace config (+ source records).
 * Pure. Returns { title, mode, completed, completionRef, checklist,
 * primaryAction, progress, apiRegistryId }.
 */
export function deriveTrainingBootstrapState({ workspaceConfig, workspaceSourceRecords, slug = "workspace-local" } = {}) {
  const completionRef = readCompletion(workspaceConfig);
  const runtime = deriveTrainingRuntimeState({ workspaceConfig, workspaceSourceRecords, slug });
  const pipeline = deriveDistillationPipelineState({ workspaceConfig });
  const models = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords });
  const reached = (s) => RANK[runtime.state] >= RANK[s];

  // The model under setup + its bonded endpoint (the invoke target).
  const focusModel = models.models[models.models.length - 1] || null;
  const apiRegistryId = focusModel?.apiRegistryId || runtime.identityChain?.apiRegistryId || "";
  const tunedTagVerified = reached("verified");
  const sandboxProven = reached("complete");

  const checklist = [];

  // 1 — Mental model primer (informational; satisfied by reading the loop).
  checklist.push(item("mental-model", "Understand the training loop", "complete", {
    guidance: "Turn real workspace traces into a custom model: curate → export → train → import → register → invoke. Growthub Local proves every step; nothing is faked.",
  }));

  // 2 — Curate enough governed traces (redaction-aware). Monotonic: once the
  // lifecycle reached `exported`, curation is by definition done.
  if (pipeline.graded >= MIN_FINETUNE_TRACES || reached("exported")) {
    checklist.push(item("curate", "Curate governed traces", "complete", {
      guidance: reached("exported") ? "Curated traces were exported into the dataset." : `${pipeline.graded} qualified traces ready (floor ${MIN_FINETUNE_TRACES}).`,
    }));
  } else if (pipeline.blocked > 0 && pipeline.graded < MIN_FINETUNE_TRACES) {
    checklist.push(item("curate", "Curate governed traces", "blocked", {
      guidance: `${pipeline.blocked} trace(s) are redaction-blocked and cannot enter the corpus. Resolve or replace them, then reach ${MIN_FINETUNE_TRACES}.`,
      nextAction: { kind: "open-data-model", label: "Resolve in Data Model" },
    }));
  } else if (pipeline.total > 0) {
    checklist.push(item("curate", "Curate governed traces", "ready", {
      guidance: `${pipeline.graded} of ${MIN_FINETUNE_TRACES} qualified — open the runtime to curate the rest.`,
      nextAction: { kind: "open-runtime", label: "Open training runtime" },
    }));
  } else {
    checklist.push(item("curate", "Curate governed traces", "ready", {
      guidance: "Do governed workspace work (helper applies, sandbox runs), then harvest traces with `growthub intelligence export`.",
      nextAction: { kind: "open-runtime", label: "Open training runtime" },
    }));
  }

  // 3 — Export the governed dataset.
  checklist.push(item("dataset", "Export the training dataset", reached("exported") ? "complete" : pipeline.graded >= MIN_FINETUNE_TRACES ? "ready" : "pending", {
    guidance: reached("exported") ? "Dataset exported and linked to sidecar evidence." : "Prepare the dataset from your curated traces in the runtime modal.",
    nextAction: !reached("exported") && pipeline.graded >= MIN_FINETUNE_TRACES ? { kind: "open-runtime", label: "Open training runtime" } : null,
  }));

  // 4 — Train and import a REAL custom model artifact.
  checklist.push(item("model", "Train & import a real custom model", reached("imported") ? "complete" : reached("exported") ? "ready" : "pending", {
    guidance: reached("imported") ? `Custom model ${focusModel?.localModel || ""} imported and provable.` : "Run the fine-tune on your local runner (e.g. Ollama/Unsloth), then import the artifact identity.",
    nextAction: !reached("imported") && reached("exported") ? { kind: "open-runtime", label: "Open training runtime" } : null,
    evidenceRefs: focusModel?.localModel ? [focusModel.localModel] : [],
  }));

  // 5 — Register the API Registry endpoint (the bonded custom-model object).
  checklist.push(item("register", "Register the API Registry endpoint", reached("deployed") ? "complete" : reached("imported") ? "ready" : "pending", {
    guidance: reached("deployed") ? `API Registry row ${apiRegistryId} is bonded to the custom model.` : "Register the local endpoint as the bonded custom-model API Registry row.",
    nextAction: !reached("deployed") && reached("imported") ? { kind: "open-runtime", label: "Open training runtime" } : null,
    evidenceRefs: apiRegistryId ? [apiRegistryId] : [],
  }));

  // 6 — INVOKE the custom model: the Next button that fires the real API
  // Registry chat-completions call to the user's local model. Completion is
  // gated on the response carrying the TUNED tag (not the base model).
  if (tunedTagVerified) {
    checklist.push(item("invoke", "Test your custom model", "complete", {
      guidance: `Your custom model answered as ${focusModel?.localModel || "itself"} — not the base model.`,
      evidenceRefs: [focusModel?.lastVerifiedAt].filter(Boolean),
    }));
  } else if (reached("deployed") && apiRegistryId) {
    checklist.push(item("invoke", "Test your custom model", "ready", {
      guidance: "Send a real prompt to your local model. Start it locally (ollama serve), then test — its reply must come back as your model, not the base model, to verify.",
      nextAction: { kind: "invoke-endpoint", label: "Test custom model", apiRegistryId },
    }));
  } else {
    checklist.push(item("invoke", "Test your custom model", "pending", {
      guidance: "Connect the model first, then test its reply.",
    }));
  }

  // 7 — Prove it in a sandbox/workflow smoke. The final invariant requires the
  // run to write an outputHash; verified invocation alone is NOT enough.
  if (sandboxProven) {
    checklist.push(item("smoke", "Run it once in a workflow", "complete", {
      guidance: "A workflow run used your custom model and wrote proof — it works inside the workspace.",
    }));
  } else if (tunedTagVerified) {
    checklist.push(item("smoke", "Run it once in a workflow", "ready", {
      guidance: "Use the verified model in a workflow and run it once. Completion is blocked until the run writes proof.",
      nextAction: { kind: "open-workflows", label: "Open Workflow Canvas" },
    }));
  } else {
    checklist.push(item("smoke", "Run it once in a workflow", "pending", {
      guidance: "Test your model first, then run it in a workflow to capture proof.",
    }));
  }

  // 8 — Mark setup complete (the only mutation; the marker disappears this UI).
  // Completion requires the full proof chain INCLUDING the smoke outputHash.
  const prereqsMet = ["curate", "dataset", "model", "register", "invoke", "smoke"].every(
    (id) => checklist.find((c) => c.id === id)?.status === "complete",
  );
  if (completionRef) {
    checklist.push(item("complete", "Custom model setup complete", "complete", {
      guidance: sandboxProven ? "Setup complete — verified and proven in a workflow smoke." : "Setup complete — your custom model is verified and callable.",
      evidenceRefs: [completionRef.completedAt],
    }));
  } else if (prereqsMet) {
    checklist.push(item("complete", "Custom model setup complete", "ready", {
      guidance: "You invoked your custom model and it answered as itself. Lock it in — this setup checklist then disappears for this workspace.",
      nextAction: { kind: "mark-complete", label: "Complete setup" },
    }));
  } else {
    checklist.push(item("complete", "Custom model setup complete", "pending", {
      guidance: "Finish the steps above — completion unlocks once your custom model answers a real chat-completions call.",
    }));
  }

  const primaryItem = checklist.find((c) => (c.status === "ready" || c.status === "blocked") && c.nextAction);
  const primaryAction = primaryItem ? { itemId: primaryItem.id, ...primaryItem.nextAction } : null;
  const completedCount = checklist.filter((c) => c.status === "complete").length;

  return {
    title: "Custom Model Training",
    mode: completionRef ? "operational" : "bootstrap",
    completed: Boolean(completionRef),
    completionRef,
    checklist,
    primaryAction,
    progress: { completed: completedCount, total: checklist.length },
    apiRegistryId,
    runtimeState: runtime.state,
  };
}

const RANK = ["blocked", "eligible", "exported", "prepared", "running", "trained", "imported", "deployed", "verified", "sandbox-ready", "complete"]
  .reduce((acc, s, i) => { acc[s] = i; return acc; }, {});

/**
 * Pure PATCH builder for the completion marker — stamps the well-known helper
 * row through the existing governed dataModel allowlist (no new field family,
 * no new lane). Returns the new objects array, or null when the helper row is
 * absent (the caller falls back to a no-op). Mirrors the CEO marker write.
 */
export function buildTrainingBootstrapMarkerPatch(workspaceConfig, { at, by = "", receiptId = "" } = {}) {
  const { objectIndex, rowIndex } = findHelperRowLocation(workspaceConfig);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  if (objectIndex < 0 || rowIndex < 0) return null;
  const stampedAt = clean(at) || new Date().toISOString();
  return objects.map((o, oi) => {
    if (oi !== objectIndex) return o;
    return {
      ...o,
      rows: (Array.isArray(o.rows) ? o.rows : []).map((r, ri) => (ri === rowIndex
        ? { ...r, [TRAINING_BOOTSTRAP_MARKER_FIELD]: stampedAt, [TRAINING_BOOTSTRAP_BY_FIELD]: clean(by), [TRAINING_BOOTSTRAP_RECEIPT_FIELD]: clean(receiptId) }
        : r)),
    };
  });
}
