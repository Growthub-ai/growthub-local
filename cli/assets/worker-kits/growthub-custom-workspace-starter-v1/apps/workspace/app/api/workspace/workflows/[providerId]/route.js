/**
 * POST /api/workspace/workflows/[providerId]
 *
 * Serverless workflow destination — the ONE inbound door for every input
 * method. It is a THIN ADAPTER over the existing governed orchestration loop —
 * NOT a second workflow engine. Three input methods share it:
 *
 *   - serverless-scheduler: the provider's scheduler (e.g. QStash) calls it
 *     signed on the cron (the validated PR #258 path — unchanged),
 *   - inbound-webhook: an external system calls it with a v1 HMAC signature
 *     bound to this destination URL (workspace-inbound-invocation.js),
 *   - api-request: an authenticated API request (bearer invoke token) carries
 *     the run-input values.
 *
 * Every method follows the same spine:
 *
 *   1. verify the method's proof over the RAW body (never re-stringified),
 *   2. parse the governed, non-secret run pointer { objectId, rowId, scheduleId },
 *   3. resolve the SAME sandbox/workflow row the local sandbox-run path uses,
 *   4. validate the TRIPLE binding (payload id ↔ owning row ↔ published trigger
 *      node, including the method's triggerKind),
 *   5. execute `runOrchestrationGraphIfPresent` (the existing runner),
 *   6. append an outcome receipt and return a compact result.
 *
 * Scheduler runs get their last-run proof via the provider's signed callback;
 * inbound runs are synchronous, so this route writes the same proof fields
 * inline (one proof family per row — no second proof system).
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  readTriggerScheduleBinding,
  liveGraphField,
  withSandboxScheduledRunProof,
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
import {
  evaluateBindingMatch,
  getInboundAdapter,
  isInboundInvocationProduct,
  registerInboundDelivery,
  registerInboundRateSample,
  resolveInboundProductForRequest,
  triggerKindForLane,
  INVOKED_RUN_KIND,
} from "@/lib/workspace-inbound-invocation";
import { discoverRunInputSchema, validateRunInputsEnvelope } from "@/lib/orchestration-run-inputs";
import { runOrchestrationGraphIfPresent } from "@/lib/orchestration-graph-runner";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function truthy(value) {
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase()) || value === true;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeInboundRunInputs(payload, request, source) {
  const direct = payload?.runInputs;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    if (direct.values && typeof direct.values === "object" && !Array.isArray(direct.values)) return direct;
    return { kind: "growthub-workflow-run-inputs-v1", source, values: direct };
  }
  // api-request convenience: a bare `values` object on the invocation body is
  // the run-input envelope's values (the request IS the input method).
  if (payload?.values && typeof payload.values === "object" && !Array.isArray(payload.values)) {
    return { kind: "growthub-workflow-run-inputs-v1", source, values: payload.values };
  }
  const raw = clean(payload?.triggerInput) || clean(request.headers.get("x-growthub-trigger-input"));
  const parsed = raw ? safeJsonParse(raw) : null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
      return {
        kind: "growthub-workflow-run-inputs-v1",
        ...parsed,
        source: clean(parsed.source) || source
      };
    }
    return { kind: "growthub-workflow-run-inputs-v1", source, values: parsed };
  }
  return { kind: "growthub-workflow-run-inputs-v1", source, values: {} };
}

function requestOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
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

  const schedulerProduct = (provider.products || []).find((p) => isSchedulerProduct(p));
  const inboundProduct = resolveInboundProductForRequest(provider, request.headers);
  const hasInboundProducts = (provider.products || []).some((p) => isInboundInvocationProduct(p));
  if (!schedulerProduct && !hasInboundProducts) {
    return NextResponse.json({ ok: false, error: "provider has no invocable workflow product" }, { status: 400 });
  }

  const rawBody = await request.text();
  // Signature must be minted for THIS destination route (anti-replay).
  const baseUrl = resolveWorkspacePublicUrl(process.env, requestOrigin(request));
  const expectedUrl = buildSchedulerCallbackUrls(baseUrl, provider.providerId).destinationUrl;

  // Method dispatch: a QStash-signed delivery takes the validated scheduler
  // path; otherwise the request's own proof material selects the inbound
  // product. No proof material at all → 401, mirroring missing-signature.
  const qstashSignature = request.headers.get("upstash-signature") || request.headers.get("Upstash-Signature") || "";
  let product;
  let expectedTriggerKind;
  let runReceiptKind;
  let runSource;
  if (schedulerProduct && (qstashSignature || !inboundProduct)) {
    product = schedulerProduct;
    expectedTriggerKind = "serverless-scheduler";
    runReceiptKind = "workspace-scheduled-run";
    runSource = "serverless-scheduler";
    const adapter = getSchedulerAdapter(product);
    const verdict = adapter.verifyCallback({ signature: qstashSignature, rawBody, expectedUrl, env: process.env });
    if (!verdict.ok) {
      return NextResponse.json({ ok: false, error: "invalid signature", reason: verdict.reason }, { status: 401 });
    }
  } else if (inboundProduct) {
    product = inboundProduct;
    expectedTriggerKind = triggerKindForLane(product.executionLane);
    runReceiptKind = INVOKED_RUN_KIND;
    runSource = expectedTriggerKind === "inbound-webhook" ? "webhook" : "api-request";
    const adapter = getInboundAdapter(product);
    const verdict = adapter.verifyInbound({ headers: request.headers, rawBody, expectedUrl, env: process.env });
    if (!verdict.ok) {
      return NextResponse.json({ ok: false, error: "invalid signature", reason: verdict.reason }, { status: 401 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "invalid signature", reason: "missing-credentials" }, { status: 401 });
  }

  // Run pointer: prefer the JSON body, fall back to the canonical forwarded
  // headers. QStash strips the `Upstash-Forward-` prefix, so these arrive as
  // `x-growthub-*` (NOT `upstash-forward-*`). Inbound callers send the same
  // header names or body fields directly.
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

  // A valid proof shows WHO sent this; it does NOT prove the row is STILL
  // bound to this input method. The inbound binding id is REQUIRED (missing
  // identity blocks, never runs), and we validate BOTH the row-level fields AND
  // the live graph trigger node so a stale/rebound delivery cannot execute.
  const scheduleId = clean(payload.scheduleId || payload.bindingId || request.headers.get("x-growthub-schedule-id"));
  const triggerBinding = readTriggerScheduleBinding(row[liveGraphField(row)]);
  const bindingMatch = evaluateBindingMatch({ row, triggerBinding, provider, product, expectedTriggerKind, scheduleId });
  const bindingOk = bindingMatch.ok;
  if (!bindingOk) {
    await appendOutcomeReceipt({
      kind: runReceiptKind,
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: provider.providerId,
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: [scheduleId ? "scheduled_run_row_unbound" : "scheduled_run_missing_schedule_id", `binding_${bindingMatch.code}`] },
      summary: `Rejected ${expectedTriggerKind} run of ${rowId}: ${scheduleId ? `row/trigger not bound to ${product.integrationId} binding ${scheduleId} (${bindingMatch.code})` : "missing inbound binding id"} (locality=${clean(row.runLocality)}, row.scheduleId=${clean(row.scheduleId) || "none"}, trigger.scheduleId=${triggerBinding?.scheduleId || "none"}).`,
    });
    return NextResponse.json({ ok: false, error: scheduleId ? "row/trigger is not currently bound to this input method" : "missing inbound binding id", scheduleId }, { status: scheduleId ? 409 : 400 });
  }

  // Inbound methods enforce pause AT THE DOOR (the scheduler pauses remotely
  // at the provider; an inbound binding has no remote to pause).
  if (expectedTriggerKind !== "serverless-scheduler" && truthy(row.schedulerPaused)) {
    await appendOutcomeReceipt({
      kind: runReceiptKind,
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: provider.providerId,
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: ["invoked_run_binding_paused"] },
      summary: `Rejected ${expectedTriggerKind} run of ${rowId}: binding ${scheduleId} is paused.`,
    });
    return NextResponse.json({ ok: false, error: "binding is paused", scheduleId }, { status: 409 });
  }

  const runInputs = normalizeInboundRunInputs(payload, request, runSource);

  if (expectedTriggerKind !== "serverless-scheduler") {
    // CONTRACT GATE: inbound request inputs must satisfy the workflow's own
    // run-input schema (field/byte/count limits, required fields, secretRef
    // rule) BEFORE any graph execution. The request is the input method; an
    // invalid payload never reaches the runner.
    const inputSchema = discoverRunInputSchema(row[liveGraphField(row)]);
    const inputVerdict = validateRunInputsEnvelope(runInputs, inputSchema);
    if (!inputVerdict.ok) {
      await appendOutcomeReceipt({
        kind: runReceiptKind,
        lane: "server-authoritative",
        outcomeStatus: "blocked",
        actor: provider.providerId,
        objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
        policyVerdict: { ok: false, violationCodes: ["invoked_run_invalid_inputs"] },
        summary: `Rejected ${expectedTriggerKind} run of ${rowId}: run inputs failed the workflow input contract (${clean(inputVerdict.error) || "invalid envelope"}).`,
      });
      return NextResponse.json({ ok: false, error: inputVerdict.error || "run inputs failed the workflow input contract", scheduleId }, { status: 422 });
    }

    // DUPLICATE GUARD: external senders retry on slow/non-2xx responses. A
    // retry re-sends the same signed bytes (or the same caller idempotency
    // key), so acknowledge duplicates without re-executing the graph.
    const delivery = registerInboundDelivery({
      bindingId: scheduleId,
      rawBody,
      timestamp: request.headers.get("x-growthub-timestamp") || "",
      idempotencyKey: request.headers.get("x-growthub-idempotency-key") || "",
    });
    if (delivery.duplicate) {
      await appendOutcomeReceipt({
        kind: runReceiptKind,
        lane: "server-authoritative",
        outcomeStatus: "blocked",
        actor: provider.providerId,
        objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
        policyVerdict: { ok: false, violationCodes: ["invoked_run_duplicate_delivery"] },
        summary: `Acknowledged duplicate ${expectedTriggerKind} delivery for ${rowId} (binding ${scheduleId}); graph not re-executed.`,
      });
      return NextResponse.json({ ok: true, duplicate: true, scheduleId, objectId, rowId }, { status: 200 });
    }

    // RATE GUARD: bounded per-binding invocation rate. Inbound runs are
    // synchronous graph executions, so a flood of validly authenticated calls
    // is a compute lever. Duplicates above never touch this budget; the
    // scheduler callback lane is not rated (the provider owns its pacing).
    const rate = registerInboundRateSample({ bindingId: scheduleId, env: process.env });
    if (rate.limited) {
      await appendOutcomeReceipt({
        kind: runReceiptKind,
        lane: "server-authoritative",
        outcomeStatus: "blocked",
        actor: provider.providerId,
        objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
        policyVerdict: { ok: false, violationCodes: ["invoked_run_rate_limited"] },
        summary: `Rate-limited ${expectedTriggerKind} invocation for ${rowId} (binding ${scheduleId}): over ${rate.limit}/min; graph not executed.`,
      });
      return NextResponse.json(
        { ok: false, error: `rate limit exceeded for this binding (${rate.limit}/min)`, scheduleId, retryAfterS: rate.retryAfterS },
        { status: 429, headers: { "retry-after": String(rate.retryAfterS) } },
      );
    }
  }

  const runId = scheduleId ? `sched_${scheduleId}_${Date.now().toString(36)}` : `sched_${Date.now().toString(36)}`;
  let result;
  try {
    result = await runOrchestrationGraphIfPresent({
      workspaceConfig,
      row,
      timeoutMs: 60000,
      runInputs,
      executionContext: { runId, ranAt: new Date().toISOString(), sandboxName: row.Name },
    });
  } catch (err) {
    result = { ok: false, exitCode: 1, error: err?.message || "orchestration threw", stdout: "", stderr: "" };
  }

  const ok = Boolean(result && result.ok !== false);
  await appendOutcomeReceipt({
    kind: runReceiptKind,
    lane: "server-authoritative",
    outcomeStatus: ok ? "published" : "failed",
    actor: provider.providerId,
    objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
    policyVerdict: { ok },
    runId,
    summary: ok
      ? (expectedTriggerKind === "serverless-scheduler"
        ? `Scheduled serverless run of ${rowId} completed via ${provider.label}.`
        : `${expectedTriggerKind === "inbound-webhook" ? "Webhook" : "API request"} serverless run of ${rowId} completed via ${product.label}.`)
      : `${expectedTriggerKind === "serverless-scheduler" ? "Scheduled" : "Invoked"} serverless run of ${rowId} failed: ${clean(result?.error) || "unknown"}.`,
  });

  // Inbound runs are synchronous — write the last-run proof inline onto the
  // owning row (the scheduler path receives this via the signed provider
  // callback instead). Same proof family, no second proof system. Success
  // proof requires the WHOLE downstream chain: the runner's per-node trace
  // (completed|failed|skipped) is objectified onto the row so the publish
  // gate can require every downstream node completed, not just an HTTP 200
  // at the door.
  let proofPersisted;
  if (expectedTriggerKind !== "serverless-scheduler") {
    const nodeTrace = Array.isArray(result?.nodeTrace) ? result.nodeTrace : [];
    const allNodesCompleted = nodeTrace.length > 0 ? nodeTrace.every((n) => n?.status === "completed") : ok;
    const proofOk = ok && allNodesCompleted;
    const now = new Date().toISOString();
    const statusText = ok ? "200" : "502";
    const patch = {
      status: proofOk ? "connected" : "failed",
      lastTested: now,
      lastResponse: proofOk
        ? `Invoked run ok (HTTP ${statusText}).`
        : `Invoked run failed: ${clean(result?.error) || (ok ? "downstream nodes incomplete" : "unknown")}.`,
      lastScheduledRunStatus: statusText,
      lastScheduledRunId: runId,
      lastScheduledRunAt: now,
      lastScheduledRunAttemptedAt: now,
      lastScheduledRunResponse: clean(result?.response || result?.stdout).slice(0, 240),
      lastScheduledRunBodyPreview: clean(result?.stdout).slice(0, 240),
      lastScheduledRunFailureReason: proofOk ? "" : clean(result?.error) || (ok ? "downstream nodes incomplete" : "run failed"),
      lastScheduledRunTriggerKind: expectedTriggerKind,
      lastScheduledRunNodesCompleted: allNodesCompleted ? "true" : "false",
      lastScheduledRunNodeTrace: JSON.stringify(nodeTrace).slice(0, 2000),
    };
    patch[proofOk ? "lastScheduledRunSucceededAt" : "lastScheduledRunFailedAt"] = now;
    const { config: nextConfig, found } = withSandboxScheduledRunProof(workspaceConfig, { objectId, rowId, patch });
    proofPersisted = found;
    if (found) {
      try {
        await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
      } catch {
        proofPersisted = false;
      }
    }
  }

  // Compact result — the scheduler provider forwards this (base64) to the
  // callback URL; inbound callers receive it directly. scheduleId is echoed so
  // callback/caller can recover binding identity.
  return NextResponse.json(
    {
      ok,
      runId,
      scheduleId,
      objectId,
      rowId,
      exitCode: result?.exitCode ?? (ok ? 0 : 1),
      durationMs: result?.durationMs ?? 0,
      response: result?.response || null,
      stdout: clean(result?.stdout).slice(0, 2000),
      error: ok ? undefined : clean(result?.error) || "run failed",
      ...(proofPersisted === undefined ? {} : { proofPersisted }),
    },
    { status: ok ? 200 : 502 },
  );
}

function HEAD() {
  return new Response(null, { status: 200 });
}

function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "HEAD, OPTIONS, POST",
    },
  });
}

export { HEAD, OPTIONS, POST };
