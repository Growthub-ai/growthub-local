/**
 * Scheduler route ORCHESTRATION cores — dependency-injected so the full state
 * machine (create schedule → persist row/trigger → rollback → callback sync →
 * persist-failure) is testable offline with stubs, without the Next runtime.
 *
 * The route files are thin wrappers that inject real deps (fetch, workspace
 * config read/write, outcome receipts) and translate `{ status, body }` into a
 * NextResponse. Everything provider-specific is delegated to the scheduler
 * adapter; everything graph/row-specific to the pure workspace-add-ons helpers.
 *
 * `deps`:
 *   { fetchImpl, readConfig, writeConfig, appendReceipt, env, now }
 * — all injected so no module here imports `next/server`, `process.env`, the
 *   filesystem persistence layer, or anything `@/`-aliased. That is what makes
 *   `node --test` able to import and exercise these cores directly.
 */

import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  findEligibleSandboxRow,
  findSandboxRowByScheduleId,
  withWorkflowServerlessBind,
  withSandboxScheduledRunProof,
  readTriggerScheduleBinding,
  liveGraphField,
} from "./workspace-add-ons.js";
import {
  getSchedulerAdapter,
  isSchedulerProduct,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
} from "./workspace-add-on-scheduler.js";
import { readEnvVar, resolveRequiredEnv } from "./server-secrets.js";

const SCHEDULE_TIMEOUT_MS = 10000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function err(status, error, extra = {}) {
  return { status, body: { ok: false, error, ...extra } };
}

function resolveSchedulerProduct(provider, productId) {
  if (productId) return getMarketplaceProduct(provider.providerId, productId);
  return (provider.products || []).find((p) => isSchedulerProduct(p)) || null;
}

function isApiRegistryObject(object) {
  const objectType = String(object?.objectType || "").trim();
  const id = String(object?.id || object?.objectId || "").trim();
  return objectType === "api-registry" || id === "api-registry";
}

async function fetchWithTimeout(fetchImpl, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Install (create/upsert) a per-workflow schedule + bind the row.    *
 * ------------------------------------------------------------------ */
async function runScheduleInstall(deps, { providerId, body = {}, requestOrigin = "" } = {}) {
  const { fetchImpl, readConfig, writeConfig, appendReceipt, env } = deps;
  const now = (deps.now || (() => new Date().toISOString()))();

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = resolveSchedulerProduct(provider, clean(body.productId));
  if (!product || !isSchedulerProduct(product)) return err(400, "provider has no serverless scheduler product", { providerId: provider.providerId });
  const adapter = getSchedulerAdapter(product);

  const config = await readConfig();
  // Capability gate: product must be installed + verified (read-probe) first.
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  const installedRow = objects.flatMap((o) => (isApiRegistryObject(o) ? (o.rows || []) : [])).find((r) => clean(r?.integrationId) === product.integrationId);
  if (!installedRow || clean(installedRow.syncStatus) !== "verified") {
    return err(409, `${product.label} must be installed and verified before scheduling`, { productId: product.productId, nextActions: [`Sync ${product.label} from Workspace Add-ons, then create the schedule.`] });
  }

  const requiredEnv = resolveRequiredEnv(product.requiredEnv, env);
  const tokenEnv = product.probe?.tokenEnv || (product.requiredEnv || [])[0];
  const token = readEnvVar(tokenEnv, env)?.value || "";
  if (!requiredEnv.ok || !token) {
    return err(422, `${product.label} runtime credentials are not connected`, { productId: product.productId, missingEnv: requiredEnv.missing });
  }

  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return err(400, "objectId and rowId (workflow row) are required");

  // Validate the row BEFORE any remote provider call.
  const eligible = findEligibleSandboxRow(config, objectId, rowId);
  if (!eligible.ok) return err(eligible.status, eligible.error, { providerId: provider.providerId, productId: product.productId });
  const targetRow = eligible.row;

  const region = clean(body.region || installedRow.region || "us-east-1");
  const cron = clean(body.cron || "0 * * * *");
  const version = clean(body.version || targetRow.version || "v1");
  const workspaceId = clean(body.workspaceId || config?.id || "workspace");

  const explicitPublicBaseUrl = clean(body.publicBaseUrl).replace(/\/+$/, "");
  const baseUrl = explicitPublicBaseUrl || resolveWorkspacePublicUrl(env, requestOrigin);
  if (!baseUrl) return err(422, "could not resolve a public workspace URL for callbacks", { nextActions: ["Set GROWTHUB_WORKSPACE_PUBLIC_URL to the deployed workspace origin, then retry."] });
  const { destinationUrl, callbackUrl, failureCallbackUrl } = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const scheduleId = deriveScheduleId({ providerId: provider.providerId, workspaceId, objectId, rowId, version });

  // Replace semantics: delete a prior DIFFERENT schedule before creating a new one.
  const priorScheduleId = clean(targetRow.scheduleId);
  if (priorScheduleId && priorScheduleId !== scheduleId) {
    let oldDeleted = false;
    let detail = "";
    try {
      const del = adapter.buildDeleteRequest({ product, region, token, scheduleId: priorScheduleId, env });
      const r = await fetchWithTimeout(fetchImpl, del.url, { method: del.method, headers: del.headers });
      oldDeleted = r.ok || r.status === 404;
      detail = `HTTP ${r.status}`;
    } catch (e) { detail = e?.message || "network error"; }
    if (!oldDeleted) {
      await appendReceipt({ kind: "workspace-add-on-schedule", lane: "server-authoritative", outcomeStatus: "failed", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: ["scheduler_replace_old_delete_failed"] }, summary: `Could not delete prior ${product.label} schedule ${priorScheduleId} (${detail}); refusing to create ${scheduleId}.` });
      return err(409, `could not replace prior schedule ${priorScheduleId} (${detail})`, { priorScheduleId });
    }
  }

  // Create the remote schedule.
  let scheduleRequest;
  try {
    scheduleRequest = adapter.buildScheduleRequest({ product, region, token, scheduleId, cron, destinationUrl, callbackUrl, failureCallbackUrl, forward: { workspaceId, objectId, rowId, version, scheduleId, triggerInput: clean(body.triggerInput) }, env });
  } catch (e) {
    return err(400, e?.message || "could not build schedule request", { providerId: provider.providerId });
  }
  let syncResult;
  try {
    const response = await fetchWithTimeout(fetchImpl, scheduleRequest.url, { method: scheduleRequest.method, headers: scheduleRequest.headers, body: scheduleRequest.body });
    syncResult = adapter.parseScheduleResponse({ status: response.status, body: await response.text(), scheduleId });
  } catch (e) {
    syncResult = { ok: false, scheduleId, proof: `schedule request failed: ${e?.message || "network error"}` };
  }
  if (!syncResult.ok) {
    await appendReceipt({ kind: "workspace-add-on-schedule", lane: "server-authoritative", outcomeStatus: "blocked", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: ["scheduler_create_failed"] }, summary: syncResult.proof || `${product.label} schedule create failed` });
    return err(502, syncResult.proof || "schedule create failed", { providerId: provider.providerId, productId: product.productId });
  }

  // ONE write: bind the owning row + sync its live trigger node.
  const { config: nextConfig, bound, liveField, triggerNodeId, changedFields } = withWorkflowServerlessBind(config, {
    objectId, rowId, schedulerRegistryId: product.integrationId, schedulerProviderId: provider.providerId, schedulerProductId: product.productId,
    region, scheduleId: syncResult.scheduleId, cron, triggerInput: clean(body.triggerInput), destinationUrl, callbackUrl, failureCallbackUrl, installedAt: now,
  });

  const rollbackRemote = async () => {
    try {
      const del = adapter.buildDeleteRequest({ product, region, token, scheduleId: syncResult.scheduleId, env });
      const r = await fetchWithTimeout(fetchImpl, del.url, { method: del.method, headers: del.headers });
      return r.ok || r.status === 404;
    } catch { return false; }
  };

  if (!bound) {
    await rollbackRemote();
    await appendReceipt({ kind: "workspace-add-on-schedule", lane: "server-authoritative", outcomeStatus: "failed", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: ["scheduler_bind_failed"] }, summary: `${product.label} schedule ${syncResult.scheduleId} rolled back: workflow row ${rowId} could not be bound.` });
    return err(409, `could not bind workflow row ${rowId}; remote schedule rolled back`, { providerId: provider.providerId, productId: product.productId });
  }

  let persisted;
  try {
    persisted = await writeConfig({ dataModel: nextConfig.dataModel });
  } catch (writeErr) {
    const cleanedUp = await rollbackRemote();
    await appendReceipt({ kind: "workspace-add-on-schedule", lane: "server-authoritative", outcomeStatus: cleanedUp ? "failed" : "blocked", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: [cleanedUp ? "schedule_rolled_back_persist_failed" : "schedule_orphaned"] }, summary: cleanedUp ? `${product.label} schedule create rolled back: workspace persistence failed (${clean(writeErr?.code) || "write error"}).` : `${product.label} schedule ${syncResult.scheduleId} is ORPHANED: persistence AND cleanup failed.` });
    return err(424, cleanedUp ? "schedule rolled back: workspace could not persist the install" : `schedule ${syncResult.scheduleId} orphaned (persist + cleanup failed)`, { providerId: provider.providerId, productId: product.productId, persisted: false, scheduleId: syncResult.scheduleId, orphaned: !cleanedUp });
  }

  const { receipt } = await appendReceipt({ kind: "workspace-add-on-schedule", lane: "server-authoritative", outcomeStatus: "published", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], changedFields: (changedFields || []).map((f) => `dataModel.${f}`), policyVerdict: { ok: true }, schemaVerdict: { ok: true }, summary: `${product.label} schedule ${syncResult.scheduleId} bound to ${rowId}: row serverless + ${liveField} trigger node "${triggerNodeId}" synced (published graph).` });

  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, scheduleId: syncResult.scheduleId, bound, liveField, triggerNodeId, destinationUrl, cron, region, persisted: true, workspaceConfig: persisted, receiptId: receipt?.receiptId } };
}

/* ------------------------------------------------------------------ *
 * Publish one manual scheduler run through the installed scheduler.  *
 * ------------------------------------------------------------------ */
async function runScheduleNow(deps, { providerId, body = {}, requestOrigin = "" } = {}) {
  const { fetchImpl, readConfig, appendReceipt, env } = deps;

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = resolveSchedulerProduct(provider, clean(body.productId));
  if (!product || !isSchedulerProduct(product)) return err(400, "provider has no serverless scheduler product", { providerId: provider.providerId });
  const adapter = getSchedulerAdapter(product);

  const config = await readConfig();
  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return err(400, "objectId and rowId (workflow row) are required");

  const eligible = findEligibleSandboxRow(config, objectId, rowId);
  if (!eligible.ok) return err(eligible.status, eligible.error, { providerId: provider.providerId, productId: product.productId });
  const targetRow = eligible.row;
  const scheduleId = clean(body.scheduleId || targetRow.scheduleId);
  if (!scheduleId) return err(409, "workflow row has no installed scheduler", { providerId: provider.providerId, productId: product.productId, objectId, rowId });
  if (clean(targetRow.runLocality) !== "serverless" || clean(targetRow.schedulerRegistryId) !== product.integrationId) {
    return err(409, "workflow row is not bound to this scheduler", { providerId: provider.providerId, productId: product.productId, objectId, rowId, scheduleId });
  }

  const tokenEnv = product.probe?.tokenEnv || (product.requiredEnv || [])[0];
  const token = readEnvVar(tokenEnv, env)?.value || "";
  if (!token) return err(422, `${product.label} runtime credentials are not connected`, { productId: product.productId, missingEnv: [tokenEnv].filter(Boolean) });

  const region = clean(body.region || targetRow.schedulerRegion || "us-east-1");
  const workspaceId = clean(body.workspaceId || config?.id || "workspace");
  const version = clean(body.version || targetRow.version || "v1");
  const baseUrl = resolveWorkspacePublicUrl(env, requestOrigin);
  if (!baseUrl) return err(422, "could not resolve a public workspace URL for scheduler run", { nextActions: ["Set GROWTHUB_WORKSPACE_PUBLIC_URL to the deployed workspace origin, then retry."] });
  const urls = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const destinationUrl = clean(targetRow.schedulerDestination) || urls.destinationUrl;
  const callbackUrl = clean(targetRow.schedulerCallbackUrl) || urls.callbackUrl;
  const failureCallbackUrl = clean(targetRow.schedulerFailureCallbackUrl) || urls.failureCallbackUrl;

  let runRequest;
  try {
    runRequest = adapter.buildRunRequest({
      product,
      region,
      token,
      scheduleId,
      destinationUrl,
      callbackUrl,
      failureCallbackUrl,
      forward: {
        workspaceId,
        objectId,
        rowId,
        version,
        scheduleId,
        triggerInput: clean(body.triggerInput || targetRow.schedulerTriggerInput),
        runInputs: body.runInputs && typeof body.runInputs === "object" ? body.runInputs : undefined,
      },
      env,
    });
  } catch (e) {
    return err(400, e?.message || "could not build scheduler run request", { providerId: provider.providerId });
  }

  let runResult;
  try {
    const response = await fetchWithTimeout(fetchImpl, runRequest.url, { method: runRequest.method, headers: runRequest.headers, body: runRequest.body });
    runResult = adapter.parseRunResponse({ status: response.status, body: await response.text() });
  } catch (e) {
    runResult = { ok: false, messageId: "", proof: `scheduler run publish failed: ${e?.message || "network error"}` };
  }
  if (!runResult.ok) {
    await appendReceipt({
      kind: "workspace-add-on-schedule-run",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: ["scheduler_run_publish_failed"] },
      summary: runResult.proof || `${product.label} manual scheduler run failed to publish`,
    });
    return err(502, runResult.proof || "scheduler run publish failed", { providerId: provider.providerId, productId: product.productId, scheduleId });
  }

  const { receipt } = await appendReceipt({
    kind: "workspace-add-on-schedule-run",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
    policyVerdict: { ok: true },
    summary: `${product.label} manual scheduler run published for ${rowId}${runResult.messageId ? ` (msg ${runResult.messageId})` : ""}.`,
    runId: runResult.messageId || undefined,
  });

  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, objectId, rowId, scheduleId, messageId: runResult.messageId, receiptId: receipt?.receiptId } };
}

/* ------------------------------------------------------------------ *
 * Synchronize a signed scheduled-run callback to the OWNING row.     *
 * ------------------------------------------------------------------ */
async function runSchedulerCallback(deps, { providerId, kind = "callback", rawBody = "", signature = "", requestOrigin = "", requestUrl = "", scheduleId = "" } = {}) {
  const { readConfig, writeConfig, appendReceipt, env } = deps;
  const now = (deps.now || (() => new Date().toISOString()))();

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = (provider.products || []).find((p) => isSchedulerProduct(p));
  if (!product) return err(400, "provider has no serverless scheduler product");
  const adapter = getSchedulerAdapter(product);

  const block = async (summary, code, objectRefs = []) => {
    await appendReceipt({ kind: "workspace-add-on-callback", lane: "server-authoritative", outcomeStatus: "blocked", actor: provider.providerId, objectRefs, summary, policyVerdict: { ok: false, violationCodes: [code] } });
  };

  const baseUrl = resolveWorkspacePublicUrl(env, requestOrigin);
  const urls = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const expectedUrl = clean(requestUrl) || (kind === "failure" ? urls.failureCallbackUrl : urls.callbackUrl);
  const verdict = adapter.verifyCallback({ signature, rawBody, expectedUrl, env });
  if (!verdict.ok) {
    await block(`Rejected ${kind} callback for ${product.label}: ${verdict.reason}.`, `callback_signature_${verdict.reason}`);
    return err(401, "invalid signature", { reason: verdict.reason });
  }

  const parsed = adapter.parseCallback({ rawBody, kind });
  if (!clean(parsed.scheduleId) && clean(scheduleId)) parsed.scheduleId = clean(scheduleId);
  if (!clean(parsed.scheduleId)) {
    await block(`${product.label} ${kind} callback ignored: no scheduleId.`, "callback_missing_schedule_id");
    return err(400, "callback is missing a scheduleId");
  }
  const config = await readConfig();
  const owner = findSandboxRowByScheduleId(config, parsed.scheduleId);
  if (!owner) {
    await block(`${product.label} ${kind} callback ignored: no workflow row owns schedule ${parsed.scheduleId}.`, "callback_no_installed_schedule");
    return err(409, "no workflow row owns this schedule");
  }
  const rowRef = [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }];

  // Mirror destination validation: the owning row must still be serverless and
  // bound to THIS provider/product, and its LIVE trigger node must still carry
  // the same schedule. Signature proves QStash sent it; binding is checked here.
  const triggerBinding = readTriggerScheduleBinding(owner.row[liveGraphField(owner.row)]);
  const stillBound =
    clean(owner.row.runLocality) === "serverless" &&
    clean(owner.row.schedulerRegistryId) === product.integrationId &&
    triggerBinding?.triggerKind === "serverless-scheduler" &&
    triggerBinding?.enabled === true &&
    triggerBinding?.scheduleId === clean(parsed.scheduleId) &&
    triggerBinding?.schedulerRegistryId === product.integrationId &&
    (!triggerBinding?.providerId || triggerBinding.providerId === provider.providerId) &&
    (!triggerBinding?.productId || triggerBinding.productId === product.productId);
  if (!stillBound) {
    await block(`${product.label} ${kind} callback ignored: ${owner.row.Name} is no longer bound to ${product.integrationId} schedule ${parsed.scheduleId} (locality=${clean(owner.row.runLocality)}, trigger.scheduleId=${triggerBinding?.scheduleId || "none"}).`, "callback_row_unbound", rowRef);
    return err(409, "owning row/trigger is no longer bound to this schedule");
  }

  const retryStates = [parsed.retried != null ? `retried=${parsed.retried}` : "", parsed.maxRetries != null ? `maxRetries=${parsed.maxRetries}` : ""].filter(Boolean).join(",");
  const patch = {
    status: parsed.succeeded ? "connected" : "failed",
    lastTested: now,
    lastResponse: parsed.succeeded ? `Scheduled run ok (HTTP ${parsed.status}).` : `Scheduled run failed: ${parsed.failureReason}.`,
    lastScheduledRunStatus: parsed.status == null ? "" : String(parsed.status),
    lastScheduledRunMessageId: parsed.messageId,
    lastScheduledRunAttemptedAt: now,
    lastScheduledRunBodyPreview: parsed.bodyPreview,
    lastScheduledRunFailureReason: parsed.succeeded ? "" : parsed.failureReason,
    lastScheduledRunRetries: retryStates,
  };
  patch[parsed.succeeded ? "lastScheduledRunSucceededAt" : "lastScheduledRunFailedAt"] = now;

  const { config: nextConfig, found } = withSandboxScheduledRunProof(config, { objectId: owner.objectId, rowId: owner.row.Name, patch });
  let persisted = found;
  if (found) {
    try { await writeConfig({ dataModel: nextConfig.dataModel }); } catch { persisted = false; }
  }

  const { receipt } = await appendReceipt({ kind: "workspace-scheduled-run-callback", lane: "server-authoritative", outcomeStatus: persisted && parsed.succeeded ? "published" : "failed", actor: provider.providerId, objectRefs: rowRef, changedFields: [`dataModel.${owner.objectId}.${owner.row.Name}.lastScheduledRunStatus`], policyVerdict: { ok: persisted && parsed.succeeded }, summary: persisted ? (parsed.succeeded ? `${owner.row.Name} scheduled run synced (HTTP ${parsed.status}, msg ${parsed.messageId || "?"}).` : `${owner.row.Name} scheduled run failed: ${parsed.failureReason}.`) : `${owner.row.Name} scheduled run proof could NOT be persisted (workspace read-only); run result not durably recorded.`, runId: parsed.messageId || undefined });

  // If the workspace cannot persist the run proof, the result is lost from
  // workspace state — do NOT report clean success.
  if (!persisted) {
    return err(424, "scheduled run proof could not be persisted to workspace state", { providerId: provider.providerId, productId: product.productId, objectId: owner.objectId, rowId: owner.row.Name, synced: false, persisted: false, receiptId: receipt?.receiptId });
  }

  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, objectId: owner.objectId, rowId: owner.row.Name, synced: parsed.succeeded, persisted: true, receiptId: receipt?.receiptId } };
}

export { runScheduleInstall, runScheduleNow, runSchedulerCallback };
