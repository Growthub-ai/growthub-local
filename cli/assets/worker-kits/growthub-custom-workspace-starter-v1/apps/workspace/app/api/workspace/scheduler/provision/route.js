/**
 * POST /api/workspace/scheduler/provision
 *
 * The governed "set it up for me" lane for no-code workflow scheduling. It is
 * HONEST about what actually happened (findings 1, 9, 10, 13):
 *
 *   1. Scaffold the deployable provider endpoint (server artifact, confined +
 *      gated) via the scheduler.create proposal lane.
 *   2. Register/update the api-registry "scheduler" row (authRef name only).
 *   3. Create the schedule / verify the endpoint, capturing real evidence:
 *        - qstash-schedule + QSTASH token + cron → create the Upstash schedule,
 *          capture providerScheduleId → status "scheduled" (trusted).
 *          (Idempotent: deletes a prior providerScheduleId first — no dupes.)
 *        - qstash-schedule WITHOUT token → verify the endpoint only →
 *          "endpoint-confirmed" (NOT scheduled; says why).
 *        - supabase-edge → verify the endpoint → "endpoint-confirmed"; only
 *          "scheduled" when externalScheduleConfirmed:true (operator attests the
 *          Supabase pg_cron/dashboard schedule) → confirmationMode external-manual.
 *        - no destination → "scaffolded".  endpoint non-200/error → "failed".
 *   4. Stamp the workflow row from that evidence — never optimism. Binds the row
 *      serverless ONLY when trusted live AND persisted.
 *   5. Persistence-failure safety: if a provider schedule was created but the
 *      workspace write fails, roll the provider schedule back (best-effort) and
 *      return a DEGRADED result with an orphan warning — never a normal success.
 *   6. Emit the canonical Agent Outcome receipt describing exactly what happened.
 *
 * Provider truth (caps, auth candidates, URL normalization) is single-sourced
 * from lib/scheduler-providers.js. Secret-safe: body/receipt carry slugs/ids/cron.
 *
 * Request body:
 *   { objectId, name, provider, cadence?, cron?, timezone?, destinationUrl?,
 *     integrationId?, authRef?, externalScheduleConfirmed? }
 */

import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "@/lib/workspace-config";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireAppScope, checkScopedWorkflowAccess } from "@/lib/workspace-app-registry";
import { cadenceToCron, normalizeCadence } from "@/lib/scheduler-cadence";
import {
  buildSchedulerProposal,
  validateSchedulerProposal,
  SCHEDULER_CONNECTOR_KIND,
} from "@/lib/workspace-scheduler-proposal";
import { normalizeProvider, providerCaps, normalizeEndpointUrl } from "@/lib/scheduler-providers";
import { writeSchedulerProposalFile } from "@/lib/server-scheduler-write";
import { readServerSecret, qstashDeleteSchedule, qstashCreateSchedule } from "@/lib/scheduler-provider-ops";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function slugify(value, fallback = "scheduler") {
  const slug = clean(value).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return slug || fallback;
}

function coerceBool(value) {
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase());
}

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment");
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((r) => clean(r?.Name) === clean(name));
  return { object, row: rowIndex === -1 ? null : rows[rowIndex], rowIndex };
}

function upsertSchedulerRegistryRow(workspaceConfig, binding, stamp) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const row = {
    Name: binding.integrationId,
    integrationId: binding.integrationId,
    connectorKind: SCHEDULER_CONNECTOR_KIND,
    schedulerProvider: binding.schedulerProvider,
    method: binding.method || "POST",
    authRef: binding.authRef || "",
    baseUrl: binding.baseUrl || "",
    endpoint: binding.endpoint || "",
    cronExpression: binding.cronExpression || "",
    ...stamp,
  };
  const targetIndex = objects.findIndex((o) => o?.objectType === "api-registry");
  let nextObjects;
  if (targetIndex === -1) {
    nextObjects = [
      ...objects,
      {
        id: "api-registry", label: "API Registry", source: "API Registry", objectType: "api-registry",
        columns: ["Name", "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse", "connectorKind", "schedulerProvider", "cronExpression"],
        rows: [row], binding: { mode: "manual", source: "Data Model" },
      },
    ];
  } else {
    nextObjects = objects.map((object, index) => {
      if (index !== targetIndex) return object;
      const rows = Array.isArray(object.rows) ? object.rows : [];
      const existingIndex = rows.findIndex((r) => clean(r?.integrationId) === binding.integrationId);
      const nextRows = existingIndex === -1 ? [...rows, row] : rows.map((r, i) => (i === existingIndex ? { ...r, ...row } : r));
      return { ...object, rows: nextRows };
    });
  }
  return { ...workspaceConfig, dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects } };
}

/**
 * Create the schedule / verify the endpoint — provider-capability aware. Returns
 * rich, honest evidence. Never throws.
 */
async function createScheduleAndConfirm({ provider, caps, destinationUrl, cron, authRef, runId, objectId, name, workspaceId, externalScheduleConfirmed, priorProviderScheduleId }) {
  const evidence = {
    confirmationMode: "no-destination", httpStatus: 0, detail: "", providerScheduleId: null,
    endpointConfirmed: false, scheduleCreated: false, status: "scaffolded",
  };
  if (!destinationUrl) {
    evidence.detail = "No deployed destination URL — endpoint scaffolded + registered. Deploy it, set its URL, then re-provision.";
    return evidence;
  }

  // QStash: create a REAL schedule only when a token resolves AND cron exists.
  const qstash = provider === "qstash-schedule" ? readServerSecret("QSTASH") : null;
  if (provider === "qstash-schedule") {
    if (!qstash) {
      // No token → we can only verify the endpoint; do NOT claim a schedule.
      const verify = await verifyEndpoint({ destinationUrl, authRef, runId, objectId, name, workspaceId, cron });
      evidence.confirmationMode = "endpoint-verify";
      evidence.httpStatus = verify.httpStatus;
      evidence.endpointConfirmed = verify.ok;
      evidence.detail = verify.ok
        ? "Destination verified (200); QStash schedule NOT created because no QSTASH token resolves in this runtime."
        : verify.detail;
      evidence.status = verify.ok ? "endpoint-confirmed" : "failed";
      return evidence;
    }
    // Idempotency: delete any prior provider schedule before creating a new one.
    if (priorProviderScheduleId) {
      await qstashDeleteSchedule(qstash.value, priorProviderScheduleId);
    }
    const created = await qstashCreateSchedule(qstash.value, { destinationUrl, cron, runId, objectId, name });
    evidence.confirmationMode = created.status === 0 ? "error" : "qstash-schedules-api";
    evidence.httpStatus = created.status;
    evidence.providerScheduleId = created.scheduleId;
    evidence.endpointConfirmed = created.ok;
    evidence.scheduleCreated = created.ok && Boolean(created.scheduleId);
    evidence.status = evidence.scheduleCreated ? "scheduled" : (created.ok ? "endpoint-confirmed" : "failed");
    evidence.detail = evidence.scheduleCreated
      ? `QStash schedule created (id ${created.scheduleId}).`
      : created.ok ? "QStash accepted the request but returned no scheduleId." : `QStash schedule create failed (HTTP ${created.status}): ${created.detail}`;
    return evidence;
  }

  // External-scheduling providers (Supabase Edge): verify the endpoint. We never
  // claim a provider schedule — scheduling is external. "scheduled" requires an
  // explicit operator attestation that the external cron is wired.
  const verify = await verifyEndpoint({ destinationUrl, authRef, runId, objectId, name, workspaceId, cron });
  evidence.confirmationMode = externalScheduleConfirmed && verify.ok ? "external-manual" : "endpoint-verify";
  evidence.httpStatus = verify.httpStatus;
  evidence.endpointConfirmed = verify.ok;
  if (!verify.ok) {
    evidence.status = "failed";
    evidence.detail = verify.detail;
  } else if (externalScheduleConfirmed) {
    evidence.scheduleCreated = true; // external schedule, operator-attested
    evidence.status = "scheduled";
    evidence.detail = "Endpoint verified (200); external Supabase schedule confirmed by operator.";
  } else {
    evidence.status = "endpoint-confirmed";
    evidence.detail = "Endpoint verified (200). Wire the recurring schedule in Supabase (pg_cron / dashboard), then re-provision with externalScheduleConfirmed to mark it scheduled.";
  }
  return evidence;
}

async function verifyEndpoint({ destinationUrl, authRef, runId, objectId, name, workspaceId, cron }) {
  const secret = readServerSecret(authRef)?.value || "";
  try {
    const res = await fetch(destinationUrl, {
      method: "POST",
      headers: { accept: "application/json, text/plain;q=0.9,*/*;q=0.8", "content-type": "application/json", ...(secret ? { authorization: secret } : {}) },
      body: JSON.stringify({
        kind: "growthub-sandbox-run-v1", runId, ranAt: new Date().toISOString(),
        workspaceId: workspaceId || null, runLocality: "serverless", objectId, name, verify: true,
        sandbox: { command: "", instructions: "scheduler provisioning verification probe", cron: cron || null },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const ct = res.headers.get("content-type") || "";
    const raw = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    const ok = res.ok && (typeof raw !== "object" || raw.ok !== false);
    return { ok, httpStatus: res.status, detail: typeof raw === "string" ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200) };
  } catch (err) {
    return { ok: false, httpStatus: 0, detail: err?.name === "TimeoutError" ? "endpoint verify timed out" : (err?.message || "endpoint verify failed") };
  }
}

async function POST(request) {
  // App-scope gate BEFORE any row-existence detail leaks (finding 11).
  let body = null;
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped && scope.violation) {
      await appendOutcomeReceipt({ kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked", appId: scope.violation.appScope, summary: `scheduler/provision rejected (422 app scope): ${scope.violation.violationType}`, nextActions: [scope.violation.suggestedAction] });
      return NextResponse.json(scope.violation, { status: 422 });
    }
    if (scope.scoped) {
      try { body = await request.clone().json(); } catch { body = null; }
      const violation = checkScopedWorkflowAccess(scope.context, body?.objectId, body?.name);
      if (violation) {
        await appendOutcomeReceipt({ kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked", appId: scope.appId, summary: `scheduler/provision rejected (422 app scope): workflow outside app ${scope.appId}`, nextActions: [violation.suggestedAction] });
        return NextResponse.json(violation, { status: 422 });
      }
    }
  }
  if (!body) {
    try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  }

  const objectId = clean(body?.objectId);
  const name = clean(body?.name);
  if (!objectId || !name) return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });

  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) return NextResponse.json({ ok: false, error: `no sandbox-environment object with id ${objectId}` }, { status: 404 });
  if (!row) return NextResponse.json({ ok: false, error: `no sandbox row named ${name} in object ${objectId}` }, { status: 404 });

  const provider = normalizeProvider(body?.provider || row.scheduleProvider);
  const caps = providerCaps(provider);
  const cadence = normalizeCadence(body?.cadence || row.scheduleCadence);
  const cronInput = clean(body?.cron) || clean(row.scheduleCron);
  const timezone = clean(body?.timezone) || clean(row.scheduleTimezone) || "UTC";
  const { cron, error: cronError } = cadenceToCron(cadence, { cron: cronInput, timezone });
  if (cronError) return NextResponse.json({ ok: false, error: cronError }, { status: 400 });

  const integrationId = slugify(body?.integrationId || row.schedulerRegistryId || `${slugify(name)}-scheduler`);
  const existingRegistry = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .flatMap((o) => (o?.objectType === "api-registry" ? (o.rows || []) : []))
    .find((r) => clean(r?.integrationId) === integrationId) || null;
  const authRef = clean(body?.authRef) || clean(existingRegistry?.authRef) || caps.authRefDefault;
  const destinationUrl = clean(body?.destinationUrl) || clean(existingRegistry?.endpoint) || clean(existingRegistry?.baseUrl);
  const externalScheduleConfirmed = coerceBool(body?.externalScheduleConfirmed);
  const priorProviderScheduleId = clean(row.scheduleProviderScheduleId);
  // Idempotency key — same intent → same key (finding 10).
  const idempotencyKey = [workspaceConfig?.id || "", objectId, name, integrationId, provider, cron || "", normalizeEndpointUrl(destinationUrl) || destinationUrl].join("|");

  // 1. Build + validate + write the endpoint artifact (gated), with provenance.
  const now = new Date().toISOString();
  const proposal = buildSchedulerProposal({
    integrationId, provider, cadence, cron: cronInput, authRef, baseUrl: destinationUrl, endpoint: "",
    objectId, rowName: name, generatedAt: now, timezone,
  });
  const validation = validateSchedulerProposal(proposal);
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  let artifact;
  try {
    artifact = await writeSchedulerProposalFile(proposal);
  } catch (err) {
    if (err?.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      await appendOutcomeReceipt({ kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked", objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }], summary: `scheduler/provision blocked (read-only): ${integrationId}`, nextActions: [err.guidance || "Use a writable runtime (WORKSPACE_CONFIG_ALLOW_FS_WRITE=true) or local dev."] });
      return NextResponse.json({ ok: false, scheduleStatus: "unprovisioned", error: err.message, guidance: err.guidance }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: err?.message || "failed to write scheduler artifact" }, { status: 500 });
  }

  const runId = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // 2 + 3. Register row + create/verify with the provider → honest evidence.
  const ev = await createScheduleAndConfirm({
    provider, caps, destinationUrl, cron, authRef, runId, objectId, name,
    workspaceId: workspaceConfig?.id || null, externalScheduleConfirmed, priorProviderScheduleId,
  });
  const scheduleStatus = ev.status;
  const trustedCandidate = scheduleStatus === "scheduled";
  const registryStatus = scheduleStatus === "scheduled" ? "connected"
    : scheduleStatus === "endpoint-confirmed" || scheduleStatus === "scaffolded" ? "registered"
    : "failed";
  const compactResponse = JSON.stringify({ provider, cadence, cron: cron || null, confirmationMode: ev.confirmationMode, httpStatus: ev.httpStatus, providerScheduleId: ev.providerScheduleId, scheduleCreated: ev.scheduleCreated, detail: ev.detail }, null, 2);
  const confirmedEndpointUrl = ev.endpointConfirmed ? (normalizeEndpointUrl(destinationUrl) || destinationUrl) : "";

  // 4. Build the next config (registry row + workflow row stamped from evidence).
  let nextConfig = upsertSchedulerRegistryRow(workspaceConfig, { ...proposal.registryBinding, baseUrl: "", endpoint: destinationUrl, cronExpression: cron || "" }, {
    status: registryStatus, lastTested: now, lastResponse: compactResponse,
  });
  const objects = Array.isArray(nextConfig?.dataModel?.objects) ? nextConfig.dataModel.objects : [];
  const stampedObjects = objects.map((entry) => {
    if (entry.id !== object.id) return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    return {
      ...entry,
      rows: rows.map((existingRow, index) => {
        if (index !== rowIndex) return existingRow;
        return {
          ...existingRow,
          runLocality: trustedCandidate ? "serverless" : existingRow.runLocality,
          schedulerRegistryId: integrationId,
          scheduleProvider: provider,
          scheduleCadence: cadence,
          scheduleCron: cron || "",
          scheduleTimezone: timezone,
          scheduleStatus,
          schedulePaused: "false",
          scheduleProviderScheduleId: ev.providerScheduleId || (ev.scheduleCreated ? existingRow.scheduleProviderScheduleId || "" : ""),
          scheduleConfirmationMode: ev.confirmationMode,
          scheduleConfirmationHttpStatus: String(ev.httpStatus || ""),
          scheduleEndpointUrl: destinationUrl,
          scheduleEndpointConfirmedAt: ev.endpointConfirmed ? now : (existingRow.scheduleEndpointConfirmedAt || ""),
          scheduleLastConfirmedEndpointUrl: confirmedEndpointUrl || existingRow.scheduleLastConfirmedEndpointUrl || "",
          scheduleProviderScheduleCreatedAt: ev.scheduleCreated && caps.createsProviderSchedule ? now : (existingRow.scheduleProviderScheduleCreatedAt || ""),
          scheduleTrustedLive: trustedCandidate ? "true" : "false",
          scheduleLastConfirmedAt: trustedCandidate ? now : (existingRow.scheduleLastConfirmedAt || ""),
          scheduleLastResponse: compactResponse,
        };
      }),
    };
  });
  nextConfig = { ...nextConfig, dataModel: { ...(nextConfig.dataModel || {}), objects: stampedObjects } };

  // 5. Persist — with rollback/orphan safety (finding 9).
  let persisted = false;
  let persistError = null;
  let rollback = null;
  const persistence = describePersistenceMode();
  if (persistence.canSave) {
    try { await writeWorkspaceConfig({ dataModel: nextConfig.dataModel }); persisted = true; }
    catch (err) {
      persistError = err?.message || "failed to persist scheduler config";
      // A provider schedule was created but we couldn't persist the binding —
      // roll the provider schedule back so we don't leave an orphan.
      if (ev.scheduleCreated && ev.providerScheduleId && provider === "qstash-schedule") {
        const token = readServerSecret("QSTASH")?.value;
        const del = await qstashDeleteSchedule(token, ev.providerScheduleId);
        rollback = { attempted: true, ok: del.ok, providerScheduleId: ev.providerScheduleId };
      }
    }
  }

  const trustedLive = trustedCandidate && persisted;

  // 6. Receipt — states exactly what happened.
  await appendOutcomeReceipt({
    kind: "scheduler-provision",
    lane: "governed-proposal",
    outcomeStatus: trustedLive ? "published" : (scheduleStatus === "failed" ? "failed" : "blocked"),
    actor: clean(body?.actor) || "operator",
    objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }, { objectId: "api-registry", rowName: integrationId, objectType: "api-registry" }],
    runId,
    summary: persistError && ev.scheduleCreated
      ? `scheduler provision: provider schedule created (${provider}) but WORKSPACE PERSISTENCE FAILED${rollback ? ` — rollback ${rollback.ok ? "ok" : "FAILED (orphan)"}` : ""}`
      : `scheduler provision → ${scheduleStatus} (${ev.confirmationMode}, http ${ev.httpStatus}${ev.providerScheduleId ? `, schedule ${ev.providerScheduleId}` : ""}): ${provider} ${cadence}${cron ? ` ${cron}` : ""} → ${integrationId}`,
    nextActions: persistError
      ? ["Workspace persistence failed — retry provision, check WORKSPACE_CONFIG_ALLOW_FS_WRITE / write mode."]
      : scheduleStatus === "scheduled" ? [`Serverless runs delegate to ${integrationId} on the ${cadence} schedule.`]
      : scheduleStatus === "endpoint-confirmed" ? [ev.detail]
      : scheduleStatus === "scaffolded" ? [`Deploy lib/adapters/integrations/schedulers/${artifact.filename}, set its URL, then re-provision.`]
      : [`Provider did not confirm (${ev.confirmationMode}, http ${ev.httpStatus}). Fix endpoint/auth and re-provision.`],
  });

  return NextResponse.json({
    // ok ONLY when trusted live AND durably persisted — never on endpoint-only.
    ok: trustedLive,
    trustedLive,
    scheduleStatus,
    confirmationMode: ev.confirmationMode,
    confirmationHttpStatus: ev.httpStatus,
    providerScheduleId: ev.providerScheduleId,
    scheduleCreated: ev.scheduleCreated,
    endpointConfirmed: ev.endpointConfirmed,
    createsProviderSchedule: caps.createsProviderSchedule,
    schedulingMode: caps.schedulingMode,
    provider,
    cadence,
    cron: cron || null,
    integrationId,
    schedulerRegistryId: integrationId,
    artifact: { path: artifact.path, filename: artifact.filename, securityMode: proposal.securityMode },
    detail: ev.detail,
    idempotencyKey,
    persisted,
    persistError,
    degraded: Boolean(persistError),
    rollback,
  });
}

export { POST };
