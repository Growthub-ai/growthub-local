/**
 * Per-workflow approval memory — "approve once per workspace".
 *
 * When a human approves a swarm-run proposal with `remember: true`, the
 * workflow name is recorded in the source-records sidecar. Later proposals
 * for the same workflow auto-approve (the receipt records `remembered: true`
 * so the audit trail stays honest). Forgetting is a plain delete.
 */

import {
  describePersistenceMode,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords
} from "./workspace-config.js";
import { SWARM_APPROVAL_MEMORY_SOURCE_KEY } from "./swarm-run-events.js";

async function readApprovalMemory() {
  try {
    const existing = await readWorkspaceSourceRecords(SWARM_APPROVAL_MEMORY_SOURCE_KEY);
    return Array.isArray(existing?.records) ? existing.records : [];
  } catch {
    return [];
  }
}

async function isWorkflowApproved(workflowName) {
  const name = String(workflowName || "").trim();
  if (!name) return false;
  const records = await readApprovalMemory();
  return records.some((record) => record.workflowName === name);
}

async function rememberWorkflowApproval(workflowName, approvedBy) {
  const name = String(workflowName || "").trim();
  if (!name) return { ok: false, error: "workflowName required" };
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { ok: false, error: persistence.reason || "workspace persistence is read-only" };
  }
  const records = await readApprovalMemory();
  if (records.some((record) => record.workflowName === name)) return { ok: true };
  const next = [...records, {
    workflowName: name,
    approvedBy: approvedBy || "cockpit",
    approvedAt: new Date().toISOString()
  }].slice(-100);
  await writeWorkspaceSourceRecords(SWARM_APPROVAL_MEMORY_SOURCE_KEY, next, {
    integrationId: SWARM_APPROVAL_MEMORY_SOURCE_KEY
  });
  return { ok: true };
}

async function forgetWorkflowApproval(workflowName) {
  const name = String(workflowName || "").trim();
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { ok: false, error: persistence.reason || "workspace persistence is read-only" };
  }
  const records = await readApprovalMemory();
  const next = records.filter((record) => record.workflowName !== name);
  await writeWorkspaceSourceRecords(SWARM_APPROVAL_MEMORY_SOURCE_KEY, next, {
    integrationId: SWARM_APPROVAL_MEMORY_SOURCE_KEY
  });
  return { ok: true };
}

export { isWorkflowApproved, rememberWorkflowApproval, forgetWorkflowApproval, readApprovalMemory };
