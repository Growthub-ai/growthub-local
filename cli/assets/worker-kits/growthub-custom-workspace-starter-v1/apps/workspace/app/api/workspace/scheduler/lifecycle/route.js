/**
 * POST /api/workspace/scheduler/lifecycle
 *
 * Governed lifecycle transitions for a provisioned schedule on a
 * sandbox-environment workflow row. Re-confirmation (re-provision + fresh 200)
 * is owned by POST /api/workspace/scheduler/provision (idempotent); this route
 * owns the cheaper transitions that do not need a provider round-trip to
 * register a new schedule:
 *
 *   - "pause"  → schedulePaused = true   (stops cadence runs; status preserved)
 *   - "resume" → schedulePaused = false
 *   - "cancel" → scheduleStatus = unprovisioned (best-effort provider delete)
 *   - "check"  → evaluate drift; stamp scheduleStatus needs-reconfirm | scheduled
 *
 * "check" is the security-critical transition: it re-derives drift from the
 * live runtime (persistence mode, env resolution, endpoint URL) and stamps
 * needs-reconfirm so the schedule is no longer trusted live until re-confirmed.
 *
 * Every transition stamps from evidence and emits an Agent Outcome receipt.
 * Request body: { objectId, name, action, currentBaseUrl? }
 */

import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "@/lib/workspace-config";
import { computeConfiguredEnvRefs } from "@/lib/env-status";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireAppScope, checkScopedWorkflowAccess } from "@/lib/workspace-app-registry";
import { deriveSchedulerDriftState } from "@/lib/scheduler-drift";

const ACTIONS = new Set(["pause", "resume", "cancel", "check"]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment");
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((r) => clean(r?.Name) === clean(name));
  return { object, row: rowIndex === -1 ? null : rows[rowIndex], rowIndex };
}

function findApiRegistryRow(workspaceConfig, integrationId) {
  const id = clean(integrationId);
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const match = (object.rows || []).find((r) => clean(r?.integrationId) === id);
    if (match) return match;
  }
  return null;
}

async function POST(request) {
  let body = null;
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped && scope.violation) {
      return NextResponse.json(scope.violation, { status: 422 });
    }
    if (scope.scoped) {
      try { body = await request.clone().json(); } catch { body = null; }
      const violation = checkScopedWorkflowAccess(scope.context, body?.objectId, body?.name);
      if (violation) return NextResponse.json(violation, { status: 422 });
    }
  }
  if (!body) {
    try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  }

  const objectId = clean(body?.objectId);
  const name = clean(body?.name);
  const action = clean(body?.action).toLowerCase();
  if (!objectId || !name) return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: `action must be one of ${[...ACTIONS].join(", ")}` }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) return NextResponse.json({ ok: false, error: `no sandbox-environment object with id ${objectId}` }, { status: 404 });
  if (!row) return NextResponse.json({ ok: false, error: `no sandbox row named ${name} in object ${objectId}` }, { status: 404 });

  const scheduleStatus = clean(row.scheduleStatus).toLowerCase();
  const wasProvisioned = scheduleStatus === "scheduled" || scheduleStatus === "needs-reconfirm" || scheduleStatus === "paused";
  if (!wasProvisioned && action !== "check") {
    return NextResponse.json({ ok: false, error: `workflow "${name}" has no provisioned schedule to ${action}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  let patch = {};
  let drift = null;

  if (action === "pause") {
    patch = { schedulePaused: "true", scheduleStatus: "paused" };
  } else if (action === "resume") {
    patch = { schedulePaused: "false", scheduleStatus: "scheduled" };
  } else if (action === "cancel") {
    patch = { schedulePaused: "false", scheduleStatus: "unprovisioned" };
  } else if (action === "check") {
    const schedulerRow = findApiRegistryRow(workspaceConfig, row.schedulerRegistryId);
    drift = deriveSchedulerDriftState({
      sandboxRow: row,
      persistenceMode: describePersistenceMode().mode,
      configuredEnvRefs: computeConfiguredEnvRefs(workspaceConfig),
      schedulerRow,
      currentBaseUrl: clean(body?.currentBaseUrl),
    });
    if (!drift.applicable) {
      return NextResponse.json({ ok: true, action, drift, scheduleStatus: scheduleStatus || "unprovisioned", changed: false });
    }
    patch = { scheduleStatus: drift.drifted ? "needs-reconfirm" : "scheduled" };
  }

  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const nextObjects = objects.map((entry) => {
    if (entry.id !== object.id) return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    return { ...entry, rows: rows.map((r, i) => (i === rowIndex ? { ...r, ...patch, scheduleLastConfirmedAt: action === "check" && !drift.drifted ? now : r.scheduleLastConfirmedAt } : r)) };
  });

  const persistence = describePersistenceMode();
  let persisted = false;
  let persistError = null;
  if (persistence.canSave) {
    try {
      await writeWorkspaceConfig({ dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects } });
      persisted = true;
    } catch (err) {
      if (err?.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
        return NextResponse.json({ ok: false, error: err.message, guidance: err.guidance }, { status: 409 });
      }
      persistError = err?.message || "failed to persist schedule lifecycle change";
    }
  }

  await appendOutcomeReceipt({
    kind: "scheduler-lifecycle",
    lane: "governed-proposal",
    outcomeStatus: "published",
    actor: clean(body?.actor) || "operator",
    objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }],
    summary: `scheduler ${action}: "${name}" → ${patch.scheduleStatus || scheduleStatus}${action === "check" && drift?.drifted ? ` (drift: ${drift.reasons.length} reason(s))` : ""}`,
    nextActions: action === "check" && drift?.drifted
      ? ["Re-confirm the schedule (POST /api/workspace/scheduler/provision) — it must earn a fresh 200 before it is trusted live."]
      : undefined,
  });

  return NextResponse.json({
    ok: true,
    action,
    scheduleStatus: patch.scheduleStatus || scheduleStatus,
    drift,
    persisted,
    persistError,
  });
}

export { POST };
