/**
 * CEO bootstrap projection — the first-use closed-loop harness for the CEO
 * cockpit (CEO_PRIMITIVE_COCKPIT_ROADMAP_V1, follow-up to R1/R2).
 *
 * This is a PURE deriver — no React, no fetch, no fs, no config writes, no
 * localStorage. It derives TWO modes from workspace state alone:
 *
 *   - "bootstrap"   — shown until the workspace has a CEO completion marker.
 *                     A state-derived smoke-test checklist that proves every
 *                     CEO primitive end-to-end (orchestrate → create → test →
 *                     launch → observe → review → govern → complete).
 *   - "operational" — the existing fleet cockpit, after completion.
 *
 * The mode comes from a completion marker that lives in workspace CONFIG (a
 * field on the existing well-known workspace-helper sandbox row), NEVER a
 * browser flag. It introduces no new object type, no new API, no new PATCH
 * field, and no new execution path: the checklist is a projection over the
 * existing swarm fleet + receipt stream, and completion is stamped through the
 * existing helper/apply lane via the `ceo.bootstrap.complete` proposal.
 *
 * Completion is gated on config-provable evidence — a governed swarm workflow
 * that is ready AND has a COMPLETED run on its row — so "done" means the loop
 * actually ran, not that a button was clicked.
 */

import { deriveCeoCockpit } from "./ceo-cockpit-console.js";
import { deriveHelperWidgetCausationState } from "./workspace-swarm-proposal.js";

// Well-known anchors — the same constants the swarm/helper lanes use. Kept
// local (they are module-private upstream) so this stays a pure leaf module.
export const WORKSPACE_HELPER_SANDBOX_OBJECT_ID = "workspace-helper-sandbox";
export const WORKSPACE_HELPER_ROW_NAME = "workspace-helper";
export const CEO_BOOTSTRAP_COMPLETE_PROPOSAL_TYPE = "ceo.bootstrap.complete";
export const CEO_BOOTSTRAP_MARKER_FIELD = "ceoBootstrapCompletedAt";
export const CEO_BOOTSTRAP_BY_FIELD = "ceoBootstrapCompletedBy";
export const CEO_BOOTSTRAP_RECEIPT_FIELD = "ceoBootstrapReceiptId";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Locate the well-known helper row (and its object) for marker read/write.
function findHelperRowLocation(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const objectIndex = objects.findIndex((o) => o?.id === WORKSPACE_HELPER_SANDBOX_OBJECT_ID);
  if (objectIndex < 0) return { objectIndex: -1, rowIndex: -1, object: null, row: null };
  const object = objects[objectIndex];
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  let rowIndex = rows.findIndex((r) => clean(r?.Name) === WORKSPACE_HELPER_ROW_NAME);
  if (rowIndex < 0 && rows.length > 0) rowIndex = 0;
  return { objectIndex, rowIndex, object, row: rowIndex >= 0 ? rows[rowIndex] : null };
}

// Read the completion marker from config (the single source of mode truth).
function readCompletion(workspaceConfig) {
  const { object, row } = findHelperRowLocation(workspaceConfig);
  const at = clean(row?.[CEO_BOOTSTRAP_MARKER_FIELD]);
  if (!row || !at) return null;
  return {
    objectId: object?.id || WORKSPACE_HELPER_SANDBOX_OBJECT_ID,
    rowName: clean(row?.Name) || WORKSPACE_HELPER_ROW_NAME,
    completedAt: at,
    completedBy: clean(row?.[CEO_BOOTSTRAP_BY_FIELD]) || null,
    receiptId: clean(row?.[CEO_BOOTSTRAP_RECEIPT_FIELD]) || null,
  };
}

// A receipt counts as governance evidence when it is an execution proof or a
// governed apply that succeeded — the same lane vocabulary the cockpit uses.
function hasGovernanceEvidence(receipts) {
  return (Array.isArray(receipts) ? receipts : []).some((r) => {
    if (!r || typeof r !== "object") return false;
    if (r.outcomeStatus === "blocked") return false;
    return r.lane === "execution-proof" || r.lane === "governed-proposal";
  });
}

function item(id, label, status, { guidance = "", evidenceRefs = [], nextAction = null } = {}) {
  return { id, label, status, guidance, evidenceRefs, nextAction };
}

// Choose the workflow the checklist follows end-to-end: prefer one that
// completed, else one that ran, else one that is ready, else the first.
function pickFocus(reports) {
  return (
    reports.find((r) => r.state === "completed") ||
    reports.find((r) => r.lastRun) ||
    reports.find((r) => r.readiness?.ready) ||
    reports[0] ||
    null
  );
}

function openArtifactAction(report, label) {
  if (!report?.nextAction?.artifact) return null;
  return { kind: "open", label, artifact: report.nextAction.artifact };
}

/**
 * Derive the CEO bootstrap state from workspace config (+ optional receipts).
 * Pure. See module header for the return shape.
 */
export function deriveCeoBootstrapState({ workspaceConfig, receipts = [] } = {}) {
  const completionRef = readCompletion(workspaceConfig);
  const cockpit = deriveCeoCockpit({ workspaceConfig, receipts });
  const reports = cockpit.reports;
  const helperState = deriveHelperWidgetCausationState(workspaceConfig);
  const helperReady = helperState.ready === true;
  const focus = pickFocus(reports);
  const ran = Boolean(focus?.lastRun);
  const completedRun = focus?.lastRun?.status === "completed";
  const failedRun = focus?.lastRun?.status === "failed";
  const governanceEvidence = hasGovernanceEvidence(receipts) || ran;

  const checklist = [];

  // 1 — Mental model (informational primer; satisfied by reading the loop).
  checklist.push(item("mental-model", "Understand the CEO loop", "complete", {
    guidance: "You're the CEO: orchestrate a swarm, validate it, launch it, observe truthful telemetry, then review the outcome.",
  }));

  // 2 — Governed swarm workflow exists (helper must be live to create one).
  if (reports.length > 0) {
    checklist.push(item("swarm-workflow", "Create your first agent swarm", "complete", {
      guidance: "A governed swarm workflow is present in the fleet.",
      evidenceRefs: focus?.name ? [focus.name] : [],
    }));
  } else if (helperReady) {
    checklist.push(item("swarm-workflow", "Create your first agent swarm", "ready", {
      guidance: "Propose your first agent swarm with /swarm — review and apply it to create the governed workflow.",
      nextAction: { kind: "seed-swarm", label: "Propose a swarm" },
    }));
  } else {
    checklist.push(item("swarm-workflow", "Create your first agent swarm", "blocked", {
      guidance: `Bring the workspace helper online first. ${helperState.guidance}`,
      nextAction: { kind: "setup", label: "Open Setup" },
    }));
  }

  // 3 — Execution readiness (the existing eligibility gate).
  if (!focus) {
    checklist.push(item("readiness", "Validate execution readiness", "pending", {
      guidance: "Create a swarm workflow first.",
    }));
  } else if (focus.readiness.ready) {
    checklist.push(item("readiness", "Validate execution readiness", "complete", {
      guidance: `Execution target ready (${focus.readiness.adapter}${focus.readiness.agentHost ? ` · ${focus.readiness.agentHost}` : ""}).`,
      evidenceRefs: [focus.readiness.adapter].filter(Boolean),
    }));
  } else {
    checklist.push(item("readiness", "Validate execution readiness", "blocked", {
      guidance: focus.readiness.guidance,
      nextAction: openArtifactAction(focus, "Open to fix"),
    }));
  }

  // 4 — Launch through the existing Background Tasks (sandbox-run).
  if (!focus) {
    checklist.push(item("launch", "Launch through Background Tasks", "pending", {
      guidance: "Create a swarm workflow first.",
    }));
  } else if (ran) {
    checklist.push(item("launch", "Launch through Background Tasks", "complete", {
      guidance: "Launched at least once via the existing sandbox-run executor.",
      evidenceRefs: focus.lastRun.runId ? [focus.lastRun.runId] : [],
    }));
  } else if (focus.readiness.ready) {
    checklist.push(item("launch", "Launch through Background Tasks", "ready", {
      guidance: "Open the workflow and press Run — execution stays in Background Tasks.",
      nextAction: openArtifactAction(focus, "Open to launch"),
    }));
  } else {
    checklist.push(item("launch", "Launch through Background Tasks", "pending", {
      guidance: "Resolve execution readiness first.",
    }));
  }

  // 5 — Observe truthful telemetry (a persisted run record exists).
  if (ran) {
    checklist.push(item("observe", "Observe truthful telemetry", "complete", {
      guidance: "A run record is persisted — tokens/tools show truthfully (— when the adapter reported nothing).",
      evidenceRefs: focus.lastRun.runId ? [focus.lastRun.runId] : [],
    }));
  } else {
    checklist.push(item("observe", "Observe truthful telemetry", "pending", {
      guidance: "Launch the swarm to produce a run record.",
    }));
  }

  // 6 — Review the outcome (completed vs failed — failure is not success).
  if (!ran) {
    checklist.push(item("review", "Review the outcome", "pending", {
      guidance: "Launch the swarm first.",
    }));
  } else if (completedRun) {
    checklist.push(item("review", "Review the outcome", "complete", {
      guidance: "The run completed successfully.",
    }));
  } else if (failedRun) {
    checklist.push(item("review", "Review the outcome", "blocked", {
      guidance: "Last run failed — review the transcript and re-run before completing setup.",
      nextAction: openArtifactAction(focus, "Open to review"),
    }));
  } else {
    checklist.push(item("review", "Review the outcome", "pending", {
      guidance: "The run is still in progress — open it to watch.",
    }));
  }

  // 7 — Confirm governance receipts exist.
  checklist.push(item("governance", "Confirm governance receipts", governanceEvidence ? "complete" : "pending", {
    guidance: governanceEvidence
      ? "Governed activity is recorded in the agent-outcomes receipt stream."
      : "Receipts appear once you launch a run or apply a governed proposal.",
  }));

  // 8 — Mark CEO setup complete (the only mutation; goes through helper/apply).
  const prereqIds = ["swarm-workflow", "readiness", "launch", "review"];
  const prereqsMet = prereqIds.every(
    (id) => checklist.find((c) => c.id === id)?.status === "complete"
  );
  if (completionRef) {
    checklist.push(item("complete", "Mark CEO setup complete", "complete", {
      guidance: "CEO setup is complete for this workspace.",
      evidenceRefs: [completionRef.completedAt],
    }));
  } else if (prereqsMet) {
    checklist.push(item("complete", "Mark CEO setup complete", "ready", {
      guidance: "You've proven the full CEO loop — lock it in. This checklist then disappears for this workspace.",
      nextAction: { kind: "mark-complete", label: "Complete" },
    }));
  } else {
    checklist.push(item("complete", "Mark CEO setup complete", "pending", {
      guidance: "Finish the steps above to unlock completion.",
    }));
  }

  // The single next move — first actionable (ready/blocked) item in order.
  const primaryItem = checklist.find(
    (c) => (c.status === "ready" || c.status === "blocked") && c.nextAction
  );
  const primaryAction = primaryItem
    ? { itemId: primaryItem.id, ...primaryItem.nextAction }
    : null;

  const completedCount = checklist.filter((c) => c.status === "complete").length;

  return {
    title: "CEO Cockpit",
    mode: completionRef ? "operational" : "bootstrap",
    completed: Boolean(completionRef),
    completionRef,
    checklist,
    primaryAction,
    progress: { completed: completedCount, total: checklist.length },
    focus: focus ? { objectId: focus.objectId, name: focus.name } : null,
  };
}

/**
 * Governed completion builder — stamps the CEO bootstrap marker onto the
 * well-known helper row in `dataModel`. Pure (returns a new config; writes
 * nothing). Used by the helper/apply `ceo.bootstrap.complete` lane.
 *
 * Refuses to stamp unless the bootstrap prerequisites are config-provably met
 * (a ready swarm with a completed run) — so the marker is real evidence, not a
 * client assertion.
 *
 * @returns {{ ok: boolean, config: object, error?: string }}
 */
export function buildCeoBootstrapCompletion({
  workspaceConfig,
  completedAt,
  completedBy = "user",
  receiptId = null,
} = {}) {
  const existing = readCompletion(workspaceConfig);
  if (existing) {
    // Idempotent — already complete, nothing to change.
    return { ok: true, config: workspaceConfig };
  }

  const state = deriveCeoBootstrapState({ workspaceConfig });
  const completeItem = state.checklist.find((c) => c.id === "complete");
  if (!completeItem || completeItem.status !== "ready") {
    const blocking = state.checklist
      .filter((c) => ["swarm-workflow", "readiness", "launch", "review"].includes(c.id))
      .filter((c) => c.status !== "complete")
      .map((c) => c.label);
    return {
      ok: false,
      config: workspaceConfig,
      error: `CEO bootstrap prerequisites not met: ${blocking.join("; ") || "incomplete"}`,
    };
  }

  const { objectIndex, rowIndex } = findHelperRowLocation(workspaceConfig);
  if (objectIndex < 0 || rowIndex < 0) {
    return { ok: false, config: workspaceConfig, error: "workspace helper sandbox row not found" };
  }

  const stampedAt = clean(completedAt) || new Date().toISOString();
  const objects = workspaceConfig.dataModel.objects.map((object, oi) => {
    if (oi !== objectIndex) return object;
    const rows = object.rows.map((row, ri) => {
      if (ri !== rowIndex) return row;
      return {
        ...row,
        [CEO_BOOTSTRAP_MARKER_FIELD]: stampedAt,
        [CEO_BOOTSTRAP_BY_FIELD]: clean(completedBy) || "user",
        ...(clean(receiptId) ? { [CEO_BOOTSTRAP_RECEIPT_FIELD]: clean(receiptId) } : {}),
      };
    });
    return { ...object, rows };
  });

  return {
    ok: true,
    config: { ...workspaceConfig, dataModel: { ...workspaceConfig.dataModel, objects } },
  };
}

export default deriveCeoBootstrapState;
