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
  listProviderProductReadiness,
  withMarketplaceSchedulerMetadata,
  withWorkflowServerlessBind,
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
import { readEnvVar, resolveRequiredEnv } from "@/lib/server-secrets";
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
  const region = clean(body.region || installedRow.region || "us-east-1");
  const cron = clean(body.cron || "0 * * * *");
  const version = clean(body.version || installedRow.version || "v1");
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
  // ONE server-authoritative write: scheduler metadata on the registry row AND
  // the workflow row flipped to serverless. The client adopts the returned
  // config verbatim — no second PATCH over stale state that could drop scheduleId.
  const withSchedule = withMarketplaceSchedulerMetadata(config, {
    integrationId: product.integrationId,
    patch: {
      scheduleId: syncResult.scheduleId,
      scheduleDestination: destinationUrl,
      callbackUrl,
      failureCallbackUrl,
      cron,
      region,
      status: "connected",
      syncStatus: "verified",
      syncCheckedAt: nowIso,
      syncProof: syncResult.proof,
      lastTested: nowIso,
      lastScheduleInstalledAt: nowIso,
      lastScheduleTime: nowIso,
    },
  });
  const { config: nextConfig, bound } = withWorkflowServerlessBind(withSchedule, {
    objectId,
    rowId,
    schedulerRegistryId: product.integrationId,
  });

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
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
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
    objectRefs: [
      { objectId: "api-registry", objectType: "api-registry", rowName: product.label },
      ...(bound ? [{ objectId, objectType: "sandbox-environment", rowName: rowId }] : []),
    ],
    changedFields: bound ? ["dataModel.api-registry", `dataModel.${objectId}`] : ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: bound
      ? `${product.label} scheduler installed (${syncResult.scheduleId}) and bound to ${rowId} (serverless).`
      : `${product.label} scheduler installed (${syncResult.scheduleId}).`,
    nextActions: bound ? [] : ["Bind this scheduler to a workflow from the Workflow Canvas add-on chooser."],
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

  const config = await readWorkspaceConfig();
  const row = findRegistryRowByIntegrationId(config, product.integrationId);
  const scheduleId = clean(body.scheduleId || row?.scheduleId);
  if (!scheduleId) return jsonError("no installed schedule to remove", 404, { providerId: provider.providerId });

  // Never clear local capability proof unless the remote schedule is actually
  // gone — otherwise a real schedule keeps firing while the workspace claims
  // it is removed (cost/noise, and callbacks rejected with no live row).
  const token = readEnvVar(product.probe?.tokenEnv || (product.requiredEnv || [])[0], process.env)?.value || "";
  if (!token) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-schedule",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
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
    const del = adapter.buildDeleteRequest({ product, region: clean(row?.region || "us-east-1"), token, scheduleId, env: process.env });
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
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
      policyVerdict: { ok: false, violationCodes: ["scheduler_delete_failed"] },
      summary: `${product.label} remote schedule ${scheduleId} delete failed (${deleteDetail}); local proof kept to avoid a stale-but-firing schedule.`,
      nextActions: [`Confirm schedule ${scheduleId} in the ${product.label} console, then retry uninstall.`],
    });
    return jsonError(`remote schedule delete failed (${deleteDetail})`, 502, {
      providerId: provider.providerId, productId: product.productId, scheduleId, deleted: false,
    });
  }

  const nextConfig = withMarketplaceSchedulerMetadata(config, {
    integrationId: product.integrationId,
    patch: {
      scheduleId: "",
      scheduleDestination: "",
      callbackUrl: "",
      failureCallbackUrl: "",
      cron: "",
      status: "draft",
      syncStatus: "missing-env",
      syncProof: `${product.label} schedule ${scheduleId} removed (${deleteDetail}).`,
      lastTested: new Date().toISOString(),
    },
  });
  let persisted = true;
  try {
    await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch {
    persisted = false;
  }
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-schedule",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    summary: `${product.label} scheduler ${scheduleId} uninstalled (${deleteDetail}).`,
  });

  return NextResponse.json({ ok: true, providerId: provider.providerId, productId: product.productId, scheduleId, deleted: true, persisted, workspaceConfig: nextConfig, receiptId: receipt.receiptId });
}

export { POST, DELETE };
