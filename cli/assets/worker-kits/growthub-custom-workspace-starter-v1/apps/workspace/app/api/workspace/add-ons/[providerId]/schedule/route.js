/**
 * POST   /api/workspace/add-ons/[providerId]/schedule
 * DELETE /api/workspace/add-ons/[providerId]/schedule
 *
 * Install (upsert) or remove a serverless scheduler capability for an installed
 * marketplace product. Provider-agnostic: the provider's scheduler product
 * (executionLane = serverless-scheduler) supplies a SchedulerAdapter that builds
 * the provider-specific request; this route only orchestrates the governed flow.
 *
 * Closes the gap "QStash install must be a schedule capability, not just a read
 * probe": on success it stamps `scheduleId` + scheduler metadata onto the
 * product's API Registry row, which is what the canvas requires before it will
 * bind a workflow to serverless.
 *
 * Secrets stay server-side: the token is resolved through the canonical env
 * entry and used only to sign the outbound request — never written to config,
 * receipts, or the response.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  findRegistryRowByIntegrationId,
  findEligibleSandboxRow,
  findSandboxRowByScheduleId,
  withWorkflowServerlessBind,
  liveGraphField,
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
import { readEnvVar, resolveRequiredEnv } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

const SCHEDULE_TIMEOUT_MS = 10000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function resolveSchedulerProduct(provider, productId) {
  if (productId) return getMarketplaceProduct(provider.providerId, productId);
  return (provider.products || []).find((product) => isSchedulerProduct(product)) || null;
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const product = resolveSchedulerProduct(provider, clean(body.productId));
  if (!product || !isSchedulerProduct(product)) {
    return jsonError("provider has no serverless scheduler product", 400, { providerId: provider.providerId });
  }
  const adapter = getSchedulerAdapter(product);

  // The product must already be installed + verified (read-probe) before it can
  // be promoted to a schedule capability.
  const config = await readWorkspaceConfig();
  const installedRow = findRegistryRowByIntegrationId(config, product.integrationId);
  if (!installedRow || clean(installedRow.syncStatus) !== "verified") {
    return jsonError(`${product.label} must be installed and verified before scheduling`, 409, {
      providerId: provider.providerId,
      productId: product.productId,
      nextActions: [`Sync ${product.label} from Workspace Add-ons, then create the schedule.`],
    });
  }

  // Concrete-key resolution — same env-key contract as product readiness
  // (readiness and schedule runtime must not disagree). The token is the
  // product's declared probe token env (e.g. QSTASH_TOKEN).
  const requiredEnv = resolveRequiredEnv(product.requiredEnv, process.env);
  const tokenEnv = product.probe?.tokenEnv || (product.requiredEnv || [])[0];
  const token = readEnvVar(tokenEnv, process.env)?.value || "";
  if (!requiredEnv.ok || !token) {
    return jsonError(`${product.label} runtime credentials are not connected`, 422, {
      providerId: provider.providerId,
      productId: product.productId,
      missingEnv: requiredEnv.missing,
    });
  }

  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return jsonError("objectId and rowId (workflow row) are required", 400);

  // Validate the target workflow row BEFORE any remote provider call — never
  // create remote infrastructure for a row the workspace cannot bind.
  const eligible = findEligibleSandboxRow(config, objectId, rowId);
  if (!eligible.ok) {
    return jsonError(eligible.error, eligible.status, { providerId: provider.providerId, productId: product.productId });
  }
  const targetRow = eligible.row;

  const region = clean(body.region || installedRow.region || "us-east-1");
  const cron = clean(body.cron || "0 * * * *");
  const version = clean(body.version || targetRow.version || "v1");
  const workspaceId = clean(body.workspaceId || config?.id || "workspace");

  const baseUrl = resolveWorkspacePublicUrl(process.env, requestOrigin(request));
  if (!baseUrl) {
    return jsonError("could not resolve a public workspace URL for callbacks", 422, {
      nextActions: ["Set GROWTHUB_WORKSPACE_PUBLIC_URL to the deployed workspace origin, then retry."],
    });
  }
  const { destinationUrl, callbackUrl, failureCallbackUrl } = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const scheduleId = deriveScheduleId({ providerId: provider.providerId, workspaceId, objectId, rowId, version });
  const forward = { workspaceId, objectId, rowId, version, scheduleId };

  // Replace semantics: if this row already owns a DIFFERENT remote schedule
  // (e.g. version/name changed), delete the old one before creating the new one
  // so we never leave an orphaned schedule firing. Same id is an idempotent upsert.
  const priorScheduleId = clean(targetRow.scheduleId);
  if (priorScheduleId && priorScheduleId !== scheduleId) {
    let oldDeleted = false;
    let detail = "";
    try {
      const del = adapter.buildDeleteRequest({ product, region, token, scheduleId: priorScheduleId, env: process.env });
      const delResp = await fetchWithTimeout(del.url, { method: del.method, headers: del.headers });
      oldDeleted = delResp.ok || delResp.status === 404;
      detail = `HTTP ${delResp.status}`;
    } catch (err) {
      detail = err?.message || "network error";
    }
    if (!oldDeleted) {
      await appendOutcomeReceipt({
        kind: "workspace-add-on-schedule",
        lane: "server-authoritative",
        outcomeStatus: "failed",
        actor: "workspace-marketplace",
        objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
        policyVerdict: { ok: false, violationCodes: ["scheduler_replace_old_delete_failed"] },
        summary: `Could not delete prior ${product.label} schedule ${priorScheduleId} (${detail}); refusing to create ${scheduleId} to avoid an orphaned schedule.`,
        nextActions: [`Delete schedule ${priorScheduleId} in the ${product.label} console, then retry.`],
      });
      return jsonError(`could not replace prior schedule ${priorScheduleId} (${detail})`, 409, {
        providerId: provider.providerId, productId: product.productId, priorScheduleId,
      });
    }
  }

  let scheduleRequest;
  try {
    scheduleRequest = adapter.buildScheduleRequest({
      product,
      region,
      token,
      scheduleId,
      cron,
      destinationUrl,
      callbackUrl,
      failureCallbackUrl,
      forward,
      env: process.env,
    });
  } catch (err) {
    return jsonError(err?.message || "could not build schedule request", 400, { providerId: provider.providerId });
  }

  let syncResult;
  try {
    const response = await fetchWithTimeout(scheduleRequest.url, {
      method: scheduleRequest.method,
      headers: scheduleRequest.headers,
      body: scheduleRequest.body,
    });
    const text = await response.text();
    syncResult = adapter.parseScheduleResponse({ status: response.status, body: text, scheduleId });
  } catch (err) {
    syncResult = { ok: false, scheduleId, proof: `schedule request failed: ${err?.message || "network error"}` };
  }

  if (!syncResult.ok) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
      summary: syncResult.proof || `${product.label} schedule create failed`,
      policyVerdict: { ok: false, violationCodes: ["scheduler_create_failed"] },
      nextActions: [`Open the ${product.label} console and confirm the schedule/token, then retry.`],
    });
    return jsonError(syncResult.proof || "schedule create failed", 502, {
      providerId: provider.providerId,
      productId: product.productId,
    });
  }

  const nowIso = new Date().toISOString();
  // ONE server-authoritative write. Schedule state is OWNED BY THE WORKFLOW ROW
  // (not the global provider row): runLocality flip + row-level schedule proof +
  // the orchestration TRIGGER NODE synced to match — so the graph tells the same
  // story as the row. The provider API Registry row stays a pure capability row
  // (verified token/probe), set by product sync — we do not write per-schedule
  // state there, so multiple workflows never fight over one scheduleId.
  const { config: nextConfig, bound, liveField, triggerNodeId, changedFields } = withWorkflowServerlessBind(config, {
    objectId,
    rowId,
    schedulerRegistryId: product.integrationId,
    schedulerProviderId: provider.providerId,
    schedulerProductId: product.productId,
    region,
    scheduleId: syncResult.scheduleId,
    cron,
    destinationUrl,
    callbackUrl,
    failureCallbackUrl,
    installedAt: nowIso,
  });

  // We validated the row exists/eligible before the remote call, so a failed
  // bind here means an unexpected state change between read and write — treat it
  // like a persist failure and roll back the remote schedule.
  if (!bound) {
    try {
      const del = adapter.buildDeleteRequest({ product, region, token, scheduleId: syncResult.scheduleId, env: process.env });
      await fetchWithTimeout(del.url, { method: del.method, headers: del.headers });
    } catch { /* best effort */ }
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: "failed",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: ["scheduler_bind_failed"] },
      summary: `${product.label} schedule ${syncResult.scheduleId} created remotely but workflow row ${rowId} could not be bound; remote schedule rolled back.`,
    });
    return jsonError(`could not bind workflow row ${rowId}; remote schedule rolled back`, 409, {
      providerId: provider.providerId, productId: product.productId,
    });
  }

  // Persist exactly once. If the local write fails AFTER the remote schedule was
  // created, the workspace and the provider have diverged — clean up the remote
  // schedule and FAIL (do not return ok:true and do not let the canvas bind).
  let persisted;
  try {
    persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch (writeErr) {
    let cleanedUp = false;
    try {
      const del = adapter.buildDeleteRequest({ product, region, token, scheduleId: syncResult.scheduleId, env: process.env });
      const delResp = await fetchWithTimeout(del.url, { method: del.method, headers: del.headers });
      cleanedUp = delResp.ok;
    } catch {
      cleanedUp = false;
    }
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: cleanedUp ? "failed" : "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: [cleanedUp ? "schedule_rolled_back_persist_failed" : "schedule_orphaned"] },
      summary: cleanedUp
        ? `${product.label} schedule create rolled back: workspace persistence failed (${clean(writeErr?.code) || "write error"}).`
        : `${product.label} schedule ${syncResult.scheduleId} is ORPHANED: created remotely but workspace persistence AND cleanup failed.`,
      nextActions: cleanedUp
        ? ["Persistence is read-only here. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use a writable runtime, then retry."]
        : [`Manually delete schedule ${syncResult.scheduleId} in the ${product.label} console, then retry.`],
    });
    return jsonError(
      cleanedUp ? "schedule rolled back: workspace could not persist the install" : `schedule ${syncResult.scheduleId} orphaned (persist + cleanup failed)`,
      424,
      { providerId: provider.providerId, productId: product.productId, persisted: false, scheduleId: syncResult.scheduleId, orphaned: !cleanedUp },
    );
  }

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-schedule",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
    // The bind mutates the LIVE executable graph trigger node (not the draft).
    // Record the ACTUAL live field + trigger node id that changed.
    changedFields: (changedFields || []).map((f) => `dataModel.${f}`),
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `${product.label} schedule ${syncResult.scheduleId} bound to ${rowId}: row serverless + ${liveField} trigger node "${triggerNodeId}" synced (bound to the published graph).`,
    nextActions: [],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    productId: product.productId,
    scheduleId: syncResult.scheduleId,
    bound,
    destinationUrl,
    cron,
    region,
    persisted: true,
    workspaceConfig: persisted,
    receiptId: receipt.receiptId,
  });
}

async function DELETE(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const product = resolveSchedulerProduct(provider, clean(body.productId));
  if (!product || !isSchedulerProduct(product)) {
    return jsonError("provider has no serverless scheduler product", 400, { providerId: provider.providerId });
  }
  const adapter = getSchedulerAdapter(product);

  // Uninstall targets the OWNING workflow row — by (objectId,rowId) or by
  // scheduleId. Schedule state lives on the row, not the provider capability row.
  const config = await readWorkspaceConfig();
  let owner = null;
  if (clean(body.objectId) && clean(body.rowId || body.name)) {
    const eligible = findEligibleSandboxRow(config, clean(body.objectId), clean(body.rowId || body.name));
    if (eligible.ok) owner = { objectId: eligible.object.id, row: eligible.row };
  } else if (clean(body.scheduleId)) {
    owner = findSandboxRowByScheduleId(config, clean(body.scheduleId));
  }
  if (!owner) return jsonError("no installed workflow schedule to remove", 404, { providerId: provider.providerId });
  const scheduleId = clean(body.scheduleId || owner.row?.scheduleId);
  if (!scheduleId) return jsonError("owning row has no installed schedule", 404, { providerId: provider.providerId });

  // Never clear local schedule proof unless the remote schedule is actually
  // gone — otherwise a real schedule keeps firing while the workspace claims
  // it is removed (cost/noise, and callbacks rejected with no live row).
  const token = readEnvVar(product.probe?.tokenEnv || (product.requiredEnv || [])[0], process.env)?.value || "";
  if (!token) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
      summary: `${product.label} schedule ${scheduleId} NOT removed: no runtime token to delete it remotely.`,
      policyVerdict: { ok: false, violationCodes: ["scheduler_delete_no_token"] },
      nextActions: [`Provide ${product.probe?.tokenEnv || "the runtime token"} so the remote schedule can be deleted, then retry.`],
    });
    return jsonError(`cannot delete ${product.label} schedule without a runtime token`, 422, {
      providerId: provider.providerId, productId: product.productId, scheduleId,
    });
  }

  let deleted = false;
  let deleteDetail = "";
  try {
    const del = adapter.buildDeleteRequest({ product, region: clean(owner.row?.schedulerRegion) || "us-east-1", token, scheduleId, env: process.env });
    const delResp = await fetchWithTimeout(del.url, { method: del.method, headers: del.headers });
    // QStash returns 404 if the schedule is already gone — treat as deleted.
    deleted = delResp.ok || delResp.status === 404;
    deleteDetail = `HTTP ${delResp.status}`;
  } catch (err) {
    deleteDetail = err?.message || "network error";
  }

  if (!deleted) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: "failed",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
      policyVerdict: { ok: false, violationCodes: ["scheduler_delete_failed"] },
      summary: `${product.label} remote schedule ${scheduleId} delete failed (${deleteDetail}); local proof kept to avoid a stale-but-firing schedule.`,
      nextActions: [`Confirm schedule ${scheduleId} in the ${product.label} console, then retry uninstall.`],
    });
    return jsonError(`remote schedule delete failed (${deleteDetail})`, 502, {
      providerId: provider.providerId, productId: product.productId, scheduleId, deleted: false,
    });
  }

  // Revert the row to local + manual trigger (clears row schedule fields AND
  // resets the orchestration trigger node) in one write.
  const { config: nextConfig } = withWorkflowServerlessBind(config, {
    objectId: owner.objectId,
    rowId: owner.row.Name,
    clear: true,
  });
  let persisted = true;
  try {
    await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch {
    persisted = false;
  }
  const liveField = liveGraphField(owner.row);
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-schedule",
    lane: "server-authoritative",
    // Remote schedule is gone. If the local revert did NOT persist, this is a
    // divergence (workspace still shows the row bound) — record it as failed.
    outcomeStatus: persisted ? "published" : "failed",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
    changedFields: [`dataModel.${owner.objectId}.${owner.row.Name}.scheduleId`, `dataModel.${owner.objectId}.${owner.row.Name}.${liveField}.trigger`],
    policyVerdict: { ok: persisted, ...(persisted ? {} : { violationCodes: ["scheduler_delete_persist_failed"] }) },
    summary: persisted
      ? `${product.label} scheduler ${scheduleId} uninstalled from ${owner.row.Name} (${deleteDetail}); row reverted to local + manual trigger.`
      : `${product.label} remote schedule ${scheduleId} deleted (${deleteDetail}) but workspace revert did NOT persist — row still shows bound. Re-run uninstall on a writable runtime.`,
    nextActions: persisted ? [] : ["Persistence is read-only here. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use a writable runtime, then re-run uninstall to clear the row."],
  });

  // Remote delete succeeded but local persistence failed → do NOT report clean
  // success; the workspace row is now stale relative to provider reality.
  if (!persisted) {
    return jsonError(`remote schedule ${scheduleId} deleted but workspace revert did not persist`, 424, {
      providerId: provider.providerId, productId: product.productId, scheduleId, deleted: true, persisted: false, receiptId: receipt.receiptId,
    });
  }

  return NextResponse.json({ ok: true, providerId: provider.providerId, productId: product.productId, scheduleId, deleted: true, persisted, workspaceConfig: nextConfig, receiptId: receipt.receiptId });
}

export { POST, DELETE };
