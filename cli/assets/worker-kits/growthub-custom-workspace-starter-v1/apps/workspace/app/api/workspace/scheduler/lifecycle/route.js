/**
 * POST /api/workspace/scheduler/lifecycle
 *
 * Governed lifecycle transitions for a provisioned schedule. HONEST about
 * whether the action touched the real provider or only local workspace state
 * (finding 2). Re-confirmation (re-create + fresh evidence) stays owned by
 * POST /api/workspace/scheduler/provision (idempotent).
 *
 *   - "pause"  → for providers we can control (QStash: no native pause), delete
 *                the remote schedule so it truly stops and stamp paused; resume
 *                then requires re-provision. For external providers, local-only
 *                flag + honest "toggle it in the provider" guidance.
 *   - "resume" → external/local providers clear the paused flag; delete-recreate
 *                providers are set needs-reconfirm (re-provision recreates).
 *   - "cancel" → delete the remote schedule when we have a providerScheduleId +
 *                auth; otherwise honest local-only cancellation.
 *   - "check"  → re-derive drift; stamp needs-reconfirm | scheduled.
 *
 * Provider I/O + secret resolution are shared (lib/scheduler-provider-ops.js);
 * provider capabilities come from lib/scheduler-providers.js. Every transition
 * stamps from evidence and emits an Agent Outcome receipt that states local-only
 * vs provider-confirmed. Request body: { objectId, name, action, currentBaseUrl? }
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
import { providerCaps, normalizeProvider } from "@/lib/scheduler-providers";
import { readServerSecret, qstashDeleteSchedule } from "@/lib/scheduler-provider-ops";

const ACTIONS = new Set(["pause", "resume", "cancel", "check"]);
const SCHEDULE_BEARING = new Set(["scaffolded", "endpoint-confirmed", "schedule-created", "scheduled", "paused", "needs-reconfirm"]);

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

/** Best-effort provider delete for the providers we can control. Honest evidence. */
async function providerDelete(provider, row) {
  const caps = providerCaps(provider);
  const scheduleId = clean(row.scheduleProviderScheduleId);
  if (provider === "qstash-schedule" && scheduleId) {
    const token = readServerSecret("QSTASH")?.value;
    if (!token) return { attempted: false, op: "delete", reason: "no-auth", detail: "QSTASH token does not resolve; remove the schedule in QStash manually." };
    const del = await qstashDeleteSchedule(token, scheduleId);
    return { attempted: true, op: "delete", ok: del.ok, status: del.status, providerScheduleId: scheduleId, detail: del.ok ? "provider schedule deleted" : `provider delete failed (HTTP ${del.status})` };
  }
  if (!caps.createsProviderSchedule) {
    return { attempted: false, op: "not-supported", detail: "Scheduling is external (Supabase pg_cron / dashboard) — disable it there." };
  }
  return { attempted: false, op: "local-only", detail: "No provider schedule id on record — local-only change." };
}

async function POST(request) {
  // App-scope gate BEFORE any row-existence detail (finding 11).
  let body = null;
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped && scope.violation) return NextResponse.json(scope.violation, { status: 422 });
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
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: `action must be one of ${[...ACTIONS].join(", ")}` }, { status: 400 });

  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) return NextResponse.json({ ok: false, error: `no sandbox-environment object with id ${objectId}` }, { status: 404 });
  if (!row) return NextResponse.json({ ok: false, error: `no sandbox row named ${name} in object ${objectId}` }, { status: 404 });

  const scheduleStatus = clean(row.scheduleStatus).toLowerCase();
  const hasSchedule = SCHEDULE_BEARING.has(scheduleStatus);
  if (!hasSchedule && action !== "check") {
    return NextResponse.json({ ok: false, error: `workflow "${name}" has no schedule to ${action}` }, { status: 409 });
  }

  const provider = normalizeProvider(row.scheduleProvider);
  const caps = providerCaps(provider);
  const now = new Date().toISOString();
  let patch = {};
  let drift = null;
  let providerAction = { attempted: false, op: "none" };

  if (action === "pause") {
    if (caps.createsProviderSchedule) {
      // QStash has no native pause → delete the remote schedule so it truly stops.
      providerAction = await providerDelete(provider, row);
      patch = {
        schedulePaused: "true",
        scheduleStatus: "paused",
        scheduleTrustedLive: "false",
        // schedule was removed remotely; resume must recreate via re-provision.
        scheduleProviderScheduleId: providerAction.ok ? "" : clean(row.scheduleProviderScheduleId),
      };
    } else {
      providerAction = { attempted: false, op: "not-supported", detail: "External schedule — pause it in Supabase (pg_cron / dashboard); this only flags it locally." };
      patch = { schedulePaused: "true", scheduleStatus: "paused", scheduleTrustedLive: "false" };
    }
  } else if (action === "resume") {
    if (caps.createsProviderSchedule) {
      // The remote schedule was removed on pause → resume requires recreation.
      providerAction = { attempted: false, op: "requires-reprovision", detail: "QStash has no pause; the schedule was removed on pause. Re-provision to recreate it." };
      patch = { schedulePaused: "false", scheduleStatus: "needs-reconfirm", scheduleTrustedLive: "false" };
    } else {
      providerAction = { attempted: false, op: "not-supported", detail: "External schedule — re-enable it in Supabase; this clears the local flag." };
      patch = { schedulePaused: "false", scheduleStatus: "scheduled", scheduleTrustedLive: "true" };
    }
  } else if (action === "cancel") {
    providerAction = await providerDelete(provider, row);
    patch = {
      schedulePaused: "false",
      scheduleStatus: "canceled",
      scheduleTrustedLive: "false",
      scheduleProviderScheduleId: "",
    };
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
    patch = drift.drifted
      ? { scheduleStatus: "needs-reconfirm", scheduleTrustedLive: "false" }
      : { scheduleStatus: "scheduled", scheduleTrustedLive: "true", scheduleLastConfirmedAt: now };
  }

  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const nextObjects = objects.map((entry) => {
    if (entry.id !== object.id) return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    return { ...entry, rows: rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)) };
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

  const providerConfirmed = providerAction.attempted === true && providerAction.ok === true;
  await appendOutcomeReceipt({
    kind: "scheduler-lifecycle",
    lane: "governed-proposal",
    outcomeStatus: persistError ? "failed" : "published",
    actor: clean(body?.actor) || "operator",
    objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }],
    summary: `scheduler ${action}: "${name}" → ${patch.scheduleStatus || scheduleStatus} (${providerConfirmed ? "provider-confirmed" : `local-only: ${providerAction.op}`})${action === "check" && drift?.drifted ? ` — drift: ${drift.reasons.length} reason(s)` : ""}`,
    nextActions: action === "check" && drift?.drifted
      ? ["Re-confirm the schedule (POST /api/workspace/scheduler/provision) — it must earn fresh evidence before it is trusted live."]
      : providerAction.detail ? [providerAction.detail] : undefined,
  });

  return NextResponse.json({
    ok: !persistError,
    action,
    scheduleStatus: patch.scheduleStatus || scheduleStatus,
    trustedLive: (patch.scheduleTrustedLive ?? clean(row.scheduleTrustedLive)) === "true",
    providerAction,
    providerConfirmed,
    localStateChanged: persisted,
    drift,
    persisted,
    persistError,
  });
}

export { POST };
