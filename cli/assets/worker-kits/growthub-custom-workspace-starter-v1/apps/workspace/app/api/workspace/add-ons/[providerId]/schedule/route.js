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
import { runScheduleInstall, runScheduleNow } from "@/lib/scheduler-orchestration";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

const SCHEDULE_TIMEOUT_MS = 10000;

const SCHEDULER_DEPS = {
  fetchImpl: fetch,
  readConfig: readWorkspaceConfig,
  writeConfig: writeWorkspaceConfig,
  appendReceipt: appendOutcomeReceipt,
  env: process.env,
};

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
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  if (clean(body.action) === "run") {
    const { status, body: out } = await runScheduleNow(SCHEDULER_DEPS, {
      providerId: params?.providerId,
      body,
      requestOrigin: requestOrigin(request),
    });
    return NextResponse.json(out, { status });
  }
  // Thin wrapper over the dependency-injected install core (testable offline).
  const { status, body: out } = await runScheduleInstall(SCHEDULER_DEPS, {
    providerId: params?.providerId,
    body,
    requestOrigin: requestOrigin(request),
  });
  return NextResponse.json(out, { status });
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
