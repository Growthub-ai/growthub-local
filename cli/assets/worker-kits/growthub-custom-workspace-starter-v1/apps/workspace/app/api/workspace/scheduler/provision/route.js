/**
 * POST /api/workspace/scheduler/provision
 *
 * The governed "set it up for me" lane for no-code workflow scheduling. Given a
 * sandbox-environment workflow row and a provider, it does, in one call:
 *
 *   1. Scaffold the deployable provider endpoint (server artifact, confined to
 *      lib/adapters/integrations/schedulers/, gated by persistence mode) via the
 *      scheduler.create proposal lane — the resolver-registry pattern.
 *   2. Register/update the api-registry "scheduler" row the serverless
 *      delegation targets (schedulerRegistryId FK). Credentials stay as an
 *      authRef env-ref name only.
 *   3. Create the schedule with the provider and CONFIRM A 200:
 *        - qstash-schedule + QSTASH_TOKEN → POST the Upstash schedules API.
 *        - otherwise → POST a growthub-sandbox-run-v1 verification envelope to
 *          the deployed destination URL and require a 200.
 *   4. Stamp the workflow row from that evidence (scheduleStatus "scheduled" on
 *      a confirmed 200, "failed" otherwise) — never optimism. Binds the row
 *      serverless so the existing sandbox-run delegation runs it on cadence.
 *   5. Emit the canonical Agent Outcome receipt.
 *
 * Secret-safe: the JSON body and the receipt carry slugs/ids/cron only; the
 * provider secret resolves server-side from the authRef env candidates.
 *
 * Request body:
 *   { objectId, name, provider, cadence?, cron?, destinationUrl?, integrationId?, authRef? }
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
  normalizeProvider,
  SCHEDULER_CONNECTOR_KIND,
} from "@/lib/workspace-scheduler-proposal";
import { writeSchedulerProposalFile } from "@/lib/server-scheduler-write";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function slugify(value, fallback = "scheduler") {
  const slug = clean(value).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return slug || fallback;
}

function envKeyCandidates(ref) {
  const token = clean(ref).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return token ? Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`])) : [];
}

function readServerSecret(authRef) {
  for (const key of envKeyCandidates(authRef)) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return null;
}

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment");
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((r) => clean(r?.Name) === clean(name));
  return { object, row: rowIndex === -1 ? null : rows[rowIndex], rowIndex };
}

/** Upsert the api-registry "scheduler" row, creating an api-registry object if none exists. */
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
  let targetIndex = objects.findIndex((o) => o?.objectType === "api-registry");
  let nextObjects;
  if (targetIndex === -1) {
    nextObjects = [
      ...objects,
      {
        id: "api-registry",
        label: "API Registry",
        source: "API Registry",
        objectType: "api-registry",
        columns: ["Name", "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse", "connectorKind", "schedulerProvider", "cronExpression"],
        rows: [row],
        binding: { mode: "manual", source: "Data Model" },
      },
    ];
  } else {
    nextObjects = objects.map((object, index) => {
      if (index !== targetIndex) return object;
      const rows = Array.isArray(object.rows) ? object.rows : [];
      const existingIndex = rows.findIndex((r) => clean(r?.integrationId) === binding.integrationId);
      const nextRows = existingIndex === -1
        ? [...rows, row]
        : rows.map((r, i) => (i === existingIndex ? { ...r, ...row } : r));
      return { ...object, rows: nextRows };
    });
  }
  return { ...workspaceConfig, dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects } };
}

/** Create the schedule with the provider and confirm a 200. Pure I/O, no throw. */
async function createScheduleAndConfirm({ provider, destinationUrl, cron, authRef, runId, objectId, name, workspaceId }) {
  if (!destinationUrl) {
    return { confirmed: false, httpStatus: 0, mode: "no-destination", detail: "No deployed destination URL — scaffolded + registered; deploy the endpoint then re-provision to confirm." };
  }
  const secretEntry = readServerSecret(authRef);
  const secret = secretEntry?.value || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // QStash schedules API — only when a real QStash token resolves.
    const qstash = provider === "qstash-schedule" ? readServerSecret("QSTASH") || readServerSecret("QSTASH_TOKEN") : null;
    if (provider === "qstash-schedule" && qstash && cron) {
      const url = `https://qstash.upstash.io/v2/schedules/${encodeURIComponent(destinationUrl)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${qstash.value}`, "Upstash-Cron": cron, "content-type": "application/json" },
        body: JSON.stringify({ kind: "growthub-sandbox-run-v1", runId, objectId, name }),
        signal: controller.signal,
      });
      const text = await res.text().catch(() => "");
      return { confirmed: res.ok, httpStatus: res.status, mode: "qstash-schedules-api", detail: text.slice(0, 240) };
    }

    // Fallback: verify the deployed destination accepts the run envelope (200).
    const payload = {
      kind: "growthub-sandbox-run-v1",
      runId,
      ranAt: new Date().toISOString(),
      workspaceId: workspaceId || null,
      runLocality: "serverless",
      objectId,
      name,
      verify: true,
      sandbox: { command: "", instructions: "scheduler provisioning verification probe", cron: cron || null },
    };
    const res = await fetch(destinationUrl, {
      method: "POST",
      headers: { accept: "application/json, text/plain;q=0.9,*/*;q=0.8", "content-type": "application/json", ...(secret ? { authorization: secret } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    const raw = contentType.includes("application/json") ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    const innerOk = res.ok && (typeof raw !== "object" || raw.ok !== false);
    return { confirmed: innerOk, httpStatus: res.status, mode: "endpoint-verify", detail: typeof raw === "string" ? raw.slice(0, 240) : JSON.stringify(raw).slice(0, 240) };
  } catch (error) {
    return { confirmed: false, httpStatus: 0, mode: "error", detail: error?.name === "AbortError" ? "schedule confirm timed out" : (error?.message || "schedule confirm failed") };
  } finally {
    clearTimeout(timer);
  }
}

async function POST(request) {
  // App-scope gate — identical contract to sandbox-run.
  let body = null;
  {
    const cfgForScope = await readWorkspaceConfig().catch(() => ({}));
    const scope = requireAppScope(request, cfgForScope);
    if (scope.scoped && scope.violation) {
      await appendOutcomeReceipt({
        kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked",
        appId: scope.violation.appScope,
        summary: `scheduler/provision rejected (422 app scope): ${scope.violation.violationType}`,
        nextActions: [scope.violation.suggestedAction],
      });
      return NextResponse.json(scope.violation, { status: 422 });
    }
    if (scope.scoped) {
      try { body = await request.clone().json(); } catch { body = null; }
      const violation = checkScopedWorkflowAccess(scope.context, body?.objectId, body?.name);
      if (violation) {
        await appendOutcomeReceipt({
          kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked",
          appId: scope.appId,
          summary: `scheduler/provision rejected (422 app scope): workflow ${body?.objectId}:${body?.name} outside app ${scope.appId}`,
          nextActions: [violation.suggestedAction],
        });
        return NextResponse.json(violation, { status: 422 });
      }
    }
  }

  if (!body) {
    try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  }

  const objectId = clean(body?.objectId);
  const name = clean(body?.name);
  if (!objectId || !name) {
    return NextResponse.json({ ok: false, error: "objectId and name are required" }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) return NextResponse.json({ ok: false, error: `no sandbox-environment object with id ${objectId}` }, { status: 404 });
  if (!row) return NextResponse.json({ ok: false, error: `no sandbox row named ${name} in object ${objectId}` }, { status: 404 });

  const provider = normalizeProvider(body?.provider || row.scheduleProvider);
  const cadence = normalizeCadence(body?.cadence || row.scheduleCadence);
  const cronInput = clean(body?.cron) || clean(row.scheduleCron);
  const { cron, error: cronError } = cadenceToCron(cadence, { cron: cronInput });
  if (cronError) {
    return NextResponse.json({ ok: false, error: cronError }, { status: 400 });
  }

  const integrationId = slugify(body?.integrationId || row.schedulerRegistryId || `${slugify(name)}-scheduler`);
  const existingRegistry = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .flatMap((o) => (o?.objectType === "api-registry" ? (o.rows || []) : []))
    .find((r) => clean(r?.integrationId) === integrationId) || null;
  const authRef = clean(body?.authRef) || clean(existingRegistry?.authRef) || (provider === "qstash-schedule" ? "QSTASH" : "SUPABASE_EDGE");
  const destinationUrl = clean(body?.destinationUrl) || clean(existingRegistry?.endpoint) || clean(existingRegistry?.baseUrl);

  // 1. Build + validate + write the endpoint artifact (gated).
  const proposal = buildSchedulerProposal({
    integrationId, provider, cadence, cron: cronInput, authRef, baseUrl: destinationUrl, endpoint: "",
  });
  const validation = validateSchedulerProposal(proposal);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }
  let artifact;
  try {
    artifact = await writeSchedulerProposalFile(proposal);
  } catch (err) {
    if (err?.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      await appendOutcomeReceipt({
        kind: "scheduler-provision", lane: "governed-proposal", outcomeStatus: "blocked",
        objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }],
        summary: `scheduler/provision blocked (read-only): ${integrationId}`,
        nextActions: [err.guidance || "Use a writable runtime (WORKSPACE_CONFIG_ALLOW_FS_WRITE=true) or local dev."],
      });
      return NextResponse.json({ ok: false, error: err.message, guidance: err.guidance }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: err?.message || "failed to write scheduler artifact" }, { status: 500 });
  }

  const runId = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  // 2 + 3. Register the scheduler row, create the schedule, confirm a 200.
  const confirm = await createScheduleAndConfirm({
    provider, destinationUrl, cron, authRef, runId, objectId, name, workspaceId: workspaceConfig?.id || null,
  });
  const confirmed = confirm.confirmed === true;
  const scheduleStatus = confirmed ? "scheduled" : (confirm.mode === "no-destination" ? "provisioning" : "failed");
  const registryStatus = confirmed ? "connected" : (confirm.mode === "no-destination" ? "registered" : "failed");
  const compactResponse = JSON.stringify({ provider, cadence, cron: cron || null, mode: confirm.mode, httpStatus: confirm.httpStatus, detail: confirm.detail }, null, 2);

  // 4. Persist: upsert registry row + stamp the workflow row from evidence.
  let nextConfig = upsertSchedulerRegistryRow(workspaceConfig, proposal.registryBinding, {
    status: registryStatus, lastTested: now, lastResponse: compactResponse,
  });
  const objects = Array.isArray(nextConfig?.dataModel?.objects) ? nextConfig.dataModel.objects : [];
  const stampedObjects = objects.map((entry) => {
    if (entry.id !== object.id) return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    const nextRows = rows.map((existingRow, index) => {
      if (index !== rowIndex) return existingRow;
      return {
        ...existingRow,
        runLocality: confirmed ? "serverless" : existingRow.runLocality,
        schedulerRegistryId: integrationId,
        scheduleProvider: provider,
        scheduleCadence: cadence,
        scheduleCron: cron || "",
        scheduleStatus,
        schedulePaused: "false",
        scheduleLastConfirmedAt: confirmed ? now : (existingRow.scheduleLastConfirmedAt || ""),
        scheduleLastResponse: compactResponse,
      };
    });
    return { ...entry, rows: nextRows };
  });
  nextConfig = { ...nextConfig, dataModel: { ...(nextConfig.dataModel || {}), objects: stampedObjects } };

  let persisted = false;
  let persistError = null;
  const persistence = describePersistenceMode();
  if (persistence.canSave) {
    try { await writeWorkspaceConfig({ dataModel: nextConfig.dataModel }); persisted = true; }
    catch (err) { persistError = err?.message || "failed to persist scheduler config"; }
  }

  // 5. Receipt.
  await appendOutcomeReceipt({
    kind: "scheduler-provision",
    lane: "governed-proposal",
    outcomeStatus: confirmed ? "published" : "failed",
    actor: clean(body?.actor) || "operator",
    objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }, { objectId: "api-registry", rowName: integrationId, objectType: "api-registry" }],
    runId,
    summary: `scheduler provision ${confirmed ? "confirmed (200)" : `unconfirmed (${confirm.mode})`}: ${provider} ${cadence}${cron ? ` ${cron}` : ""} → ${integrationId}`,
    nextActions: confirmed
      ? [`Serverless runs delegate to ${integrationId} on the ${cadence} schedule.`]
      : confirm.mode === "no-destination"
        ? [`Deploy the endpoint (lib/adapters/integrations/schedulers/${artifact.filename}), set its URL, then re-provision to confirm.`]
        : [`Provider did not return 200 (${confirm.mode}, status ${confirm.httpStatus}). Fix the endpoint/auth and re-provision.`],
  });

  return NextResponse.json({
    ok: confirmed,
    confirmed,
    scheduleStatus,
    provider,
    cadence,
    cron: cron || null,
    integrationId,
    schedulerRegistryId: integrationId,
    artifact: { path: artifact.path, filename: artifact.filename },
    confirm,
    persisted,
    persistError,
  });
}

export { POST };
