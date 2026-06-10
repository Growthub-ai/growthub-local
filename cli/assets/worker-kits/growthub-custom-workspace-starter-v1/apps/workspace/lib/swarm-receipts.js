/**
 * Swarm run receipts — thin wrapper over the workspace source-records
 * sidecar, the exact store the workspace-helper apply receipts use.
 *
 * Receipt kinds (additive):
 *   swarm.run.proposed   — governed proposal envelope accepted for review
 *   swarm.run.approved   — human (or remembered) approval that started it
 *   swarm.run.completed  — terminal receipt with totals + result hash
 *
 * Persistence is best-effort: when the workspace is read-only the run still
 * executes and streams, and the receipt failure is reported as a warning —
 * never thrown into the run path.
 */

import { createHash } from "node:crypto";
import {
  describePersistenceMode,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords
} from "./workspace-config.js";
import { SWARM_RUN_RECEIPTS_SOURCE_KEY } from "./swarm-run-events.js";

const MAX_RECEIPTS = 200;

function resultHash(value) {
  try {
    return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

async function appendSwarmReceipt(receipt) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { persisted: false, warning: persistence.reason || "workspace persistence is read-only" };
  }
  try {
    const existing = await readWorkspaceSourceRecords(SWARM_RUN_RECEIPTS_SOURCE_KEY);
    const prior = Array.isArray(existing?.records) ? existing.records : [];
    const next = [...prior, { ...receipt, at: receipt.at || new Date().toISOString() }].slice(-MAX_RECEIPTS);
    await writeWorkspaceSourceRecords(SWARM_RUN_RECEIPTS_SOURCE_KEY, next, {
      integrationId: SWARM_RUN_RECEIPTS_SOURCE_KEY
    });
    return { persisted: true, warning: null };
  } catch (error) {
    return { persisted: false, warning: error?.message || "failed to persist swarm receipt" };
  }
}

async function recordProposalReceipt(run, reviewedBy) {
  return appendSwarmReceipt({
    type: "swarm.run.proposed",
    runId: run.runId,
    name: run.name,
    runKind: run.runKind,
    description: run.description,
    reviewedBy: reviewedBy || null
  });
}

async function recordApprovalReceipt(run, { approvedBy, remembered }) {
  return appendSwarmReceipt({
    type: "swarm.run.approved",
    runId: run.runId,
    name: run.name,
    approvedBy: approvedBy || "cockpit",
    remembered: remembered === true
  });
}

async function recordCompletionReceipt(run, output) {
  return appendSwarmReceipt({
    type: "swarm.run.completed",
    runId: run.runId,
    name: run.name,
    status: run.status,
    durationMs: run.durationMs,
    totals: { ...run.totals },
    resultHash: resultHash(output),
    error: run.error || null
  });
}

async function listSwarmReceipts(limit = 50) {
  try {
    const existing = await readWorkspaceSourceRecords(SWARM_RUN_RECEIPTS_SOURCE_KEY);
    const records = Array.isArray(existing?.records) ? existing.records : [];
    return records.slice(-Math.min(Math.max(limit, 1), MAX_RECEIPTS)).reverse();
  } catch {
    return [];
  }
}

export {
  appendSwarmReceipt,
  recordProposalReceipt,
  recordApprovalReceipt,
  recordCompletionReceipt,
  listSwarmReceipts,
  resultHash
};
