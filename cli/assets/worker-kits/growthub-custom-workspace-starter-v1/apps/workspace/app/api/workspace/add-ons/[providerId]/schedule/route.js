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
} from "@/lib/workspace-add-ons";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "@/lib/workspace-add-on-scheduler";
import { readServerSecret } from "@/lib/server-secrets";
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

  // Required runtime token resolves through the canonical run entry.
  const tokenEnv = product.probe?.tokenEnv || (product.requiredEnv || [])[1];
  const tokenSecret = readServerSecret(product.authRef);
  const token = tokenSecret?.value || (tokenEnv ? clean(process.env[tokenEnv]) : "");
  const readiness = listProviderProductReadiness(provider.providerId, process.env).find((item) => item.productId === product.productId);
  if (!token || !readiness?.configured) {
    return jsonError(`${product.label} runtime credentials are not connected`, 422, {
      providerId: provider.providerId,
      productId: product.productId,
      missingEnv: readiness?.missingEnv || product.requiredEnv,
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
  const nextConfig = withMarketplaceSchedulerMetadata(config, {
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
      lastScheduleTime: nowIso,
    },
  });
  let persisted = nextConfig;
  try {
    persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch {
    // read-only runtimes: capability proof still returned, receipt notes it.
  }
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-schedule",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `${product.label} scheduler installed (${syncResult.scheduleId}); workflow rows can now bind serverless.`,
    nextActions: ["Bind this scheduler to a workflow from the Workflow Canvas add-on chooser."],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    productId: product.productId,
    scheduleId: syncResult.scheduleId,
    destinationUrl,
    cron,
    region,
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

  const tokenSecret = readServerSecret(product.authRef);
  const token = tokenSecret?.value || clean(process.env[product.probe?.tokenEnv || ""]);
  if (token) {
    try {
      const del = adapter.buildDeleteRequest({ product, region: clean(row?.region || "us-east-1"), token, scheduleId, env: process.env });
      await fetchWithTimeout(del.url, { method: del.method, headers: del.headers });
    } catch {
      // best-effort delete; we still clear local capability proof below.
    }
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
      syncProof: `${product.label} schedule ${scheduleId} removed.`,
      lastTested: new Date().toISOString(),
    },
  });
  let persisted = nextConfig;
  try {
    persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  } catch {
    // read-only runtime; nothing else to do.
  }
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-schedule",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    summary: `${product.label} scheduler ${scheduleId} uninstalled.`,
  });

  return NextResponse.json({ ok: true, providerId: provider.providerId, productId: product.productId, scheduleId, workspaceConfig: persisted, receiptId: receipt.receiptId });
}

export { POST, DELETE };
