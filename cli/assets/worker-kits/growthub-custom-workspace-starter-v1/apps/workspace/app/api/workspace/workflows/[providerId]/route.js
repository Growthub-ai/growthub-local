/**
 * POST /api/workspace/workflows/[providerId]
 *
 * Serverless workflow destination. The provider's scheduler (e.g. QStash) calls
 * this signed endpoint on the cron; it is a THIN ADAPTER over the existing
 * governed orchestration loop — NOT a second workflow engine. It:
 *
 *   1. verifies the provider signature (raw body, never re-stringified),
 *   2. parses the governed, non-secret run pointer { workspaceId, objectId, rowId },
 *   3. resolves the SAME sandbox/workflow row the local sandbox-run path uses,
 *   4. executes `runOrchestrationGraphIfPresent` (the existing runner),
 *   5. appends an outcome receipt and returns a compact result.
 *
 * The provider forwards this response to the workspace callback URL, where it is
 * synchronized into workspace config. Durability/retry/scheduling come from the
 * provider; step semantics come from the existing orchestration graph.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { getMarketplaceProvider, readTriggerScheduleBinding, liveGraphField } from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
import { runOrchestrationGraphIfPresent } from "@/lib/orchestration-graph-runner";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function findSandboxRow(workspaceConfig, objectId, rowId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment");
  if (!object) return null;
  const rows = Array.isArray(object.rows) ? object.rows : [];
  return rows.find((row) => clean(row?.Name) === clean(rowId)) || null;
}

async function POST(request, context) {
  const params = await context?.params;
  const provider = getMarketplaceProvider(clean(params?.providerId));
  if (!provider) return NextResponse.json({ ok: false, error: "unknown marketplace provider" }, { status: 404 });

  const product = (provider.products || []).find((p) => isSchedulerProduct(p));
  if (!product) return NextResponse.json({ ok: false, error: "provider has no scheduler product" }, { status: 400 });
  const adapter = getSchedulerAdapter(product);

  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") || request.headers.get("Upstash-Signature") || "";
  // Signature must be minted for THIS destination route (anti-replay).
  const baseUrl = resolveWorkspacePublicUrl(process.env, requestOrigin(request));
  const expectedUrl = buildSchedulerCallbackUrls(baseUrl, provider.providerId).destinationUrl;
  const verdict = adapter.verifyCallback({ signature, rawBody, expectedUrl, env: process.env });
  if (!verdict.ok) {
    return NextResponse.json({ ok: false, error: "invalid signature", reason: verdict.reason }, { status: 401 });
  }

  // Run pointer: prefer the JSON body, fall back to the canonical forwarded
  // headers. QStash strips the `Upstash-Forward-` prefix, so these arrive as
  // `x-growthub-*` (NOT `upstash-forward-*`).
  const payload = safeJsonParse(rawBody) || {};
  const objectId = clean(payload.objectId || request.headers.get("x-growthub-object-id"));
  const rowId = clean(payload.rowId || request.headers.get("x-growthub-row-id"));
  if (!objectId || !rowId) {
    return NextResponse.json({ ok: false, error: "missing objectId/rowId run pointer" }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const row = findSandboxRow(workspaceConfig, objectId, rowId);
  if (!row) {
    return NextResponse.json({ ok: false, error: `no sandbox row ${rowId} in object ${objectId}` }, { status: 404 });
  }

  // A valid signature proves QStash sent this; it does NOT prove the row is
  // STILL bound to this schedule. The inbound scheduleId is REQUIRED (missing
  // identity blocks, never runs), and we validate BOTH the row-level fields AND
  // the live graph trigger node so a stale/rebound delivery cannot execute.
  const scheduleId = clean(payload.scheduleId || request.headers.get("x-growthub-schedule-id"));
  const triggerBinding = readTriggerScheduleBinding(row[liveGraphField(row)]);
  const bindingOk =
    Boolean(scheduleId) &&
    clean(row.runLocality) === "serverless" &&
    clean(row.schedulerRegistryId) === product.integrationId &&
    clean(row.scheduleId) === scheduleId &&
    triggerBinding?.triggerKind === "serverless-scheduler" &&
    triggerBinding?.enabled === true &&
    triggerBinding?.scheduleId === scheduleId &&
    triggerBinding?.schedulerRegistryId === product.integrationId;
  if (!bindingOk) {
    await appendOutcomeReceipt({
      kind: "workspace-scheduled-run",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: provider.providerId,
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: [scheduleId ? "scheduled_run_row_unbound" : "scheduled_run_missing_schedule_id"] },
      summary: `Rejected scheduled run of ${rowId}: ${scheduleId ? `row/trigger not bound to ${product.integrationId} schedule ${scheduleId}` : "missing inbound scheduleId"} (locality=${clean(row.runLocality)}, row.scheduleId=${clean(row.scheduleId) || "none"}, trigger.scheduleId=${triggerBinding?.scheduleId || "none"}).`,
    });
    return NextResponse.json({ ok: false, error: scheduleId ? "row/trigger is not currently bound to this schedule" : "missing inbound scheduleId", scheduleId }, { status: scheduleId ? 409 : 400 });
  }

  const runId = scheduleId ? `sched_${scheduleId}_${Date.now().toString(36)}` : `sched_${Date.now().toString(36)}`;
  let result;
  try {
    result = await runOrchestrationGraphIfPresent({
      workspaceConfig,
      row,
      timeoutMs: 60000,
      runInputs: payload.runInputs || null,
      executionContext: { runId, ranAt: new Date().toISOString(), sandboxName: row.Name },
    });
  } catch (err) {
    result = { ok: false, exitCode: 1, error: err?.message || "orchestration threw", stdout: "", stderr: "" };
  }

  const ok = Boolean(result && result.ok !== false);
  await appendOutcomeReceipt({
    kind: "workspace-scheduled-run",
    lane: "server-authoritative",
    outcomeStatus: ok ? "published" : "failed",
    actor: provider.providerId,
    objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
    policyVerdict: { ok },
    runId,
    summary: ok
      ? `Scheduled serverless run of ${rowId} completed via ${provider.label}.`
      : `Scheduled serverless run of ${rowId} failed: ${clean(result?.error) || "unknown"}.`,
  });

  // Compact result — the provider forwards this (base64) to the callback URL.
  // scheduleId is echoed so the callback can recover schedule identity even when
  // QStash omits a top-level scheduleId on the callback envelope.
  return NextResponse.json(
    {
      ok,
      runId,
      scheduleId,
      objectId,
      rowId,
      exitCode: result?.exitCode ?? (ok ? 0 : 1),
      durationMs: result?.durationMs ?? 0,
      stdout: clean(result?.stdout).slice(0, 2000),
      error: ok ? undefined : clean(result?.error) || "run failed",
    },
    { status: ok ? 200 : 502 },
  );
}

export { POST };
