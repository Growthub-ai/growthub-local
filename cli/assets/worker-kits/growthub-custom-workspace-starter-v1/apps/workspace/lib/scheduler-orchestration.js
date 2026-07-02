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
  withMarketplaceProductRegistry,
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
import {
  isInboundInvocationProduct,
  triggerKindForLane,
  deriveBindingId,
  evaluateBindingMatch,
  getInboundAdapter,
  signInboundWebhook,
  BINDING_RECEIPT_KIND,
} from "./workspace-inbound-invocation.js";
import { readEnvVar, resolveRequiredEnv } from "./server-secrets.js";
import { scanServerlessReadiness, READINESS_KIND } from "./serverless-readiness.js";

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

async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = SCHEDULE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// A test invocation runs the WHOLE downstream graph through the real
// destination door (60s runner budget) — give the door room to answer.
const INVOKE_TIMEOUT_MS = 65000;

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

  // Causality gate: prove the WHOLE downstream graph is serverless-ready BEFORE
  // any remote schedule is created or the row is bound. A scheduler install
  // succeeding only proves the binding; it does not prove every downstream node
  // can run with no human/local agent state and that all API Registry deps
  // resolve through server-side env refs. If not clean, emit a draft readiness
  // delta (blocked receipt) and refuse — the published graph stays unchanged and
  // no remote infrastructure is created. (Caller may pass `force:true` only when
  // an operator has acknowledged warnings; blocking nodes are never forceable.)
  const readiness = scanServerlessReadiness({
    row: targetRow,
    workspaceConfig: config,
    env,
    phase: "pre-bind",
    expected: {
      schedulerRegistryId: product.integrationId,
      providerId: provider.providerId,
      productId: product.productId,
      triggerInput: clean(body.triggerInput),
    },
  });
  if (!readiness.ok) {
    await appendReceipt({
      kind: READINESS_KIND,
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: readiness.deltaTags },
      summary: `${product.label} schedule bind blocked: ${readiness.blockingNodes.length} downstream node(s) are not serverless-ready (${readiness.blockingNodes.map((n) => n.nodeId || n.nodeType).join(", ")}).`,
      nextActions: readiness.blockingNodes.map((n) => n.helperAction).filter(Boolean),
    });
    return err(422, "workflow graph is not serverless-ready", { providerId: provider.providerId, productId: product.productId, readiness });
  }

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
    lastScheduledRunId: parsed.runId || parsed.messageId,
    lastScheduledRunAt: now,
    lastScheduledRunResponse: parsed.responsePreview || parsed.bodyPreview,
    lastScheduledRunAttemptedAt: now,
    lastScheduledRunBodyPreview: parsed.bodyPreview,
    lastScheduledRunFailureReason: parsed.succeeded ? "" : parsed.failureReason,
    lastScheduledRunRetries: retryStates,
    lastScheduledRunTriggerKind: "serverless-scheduler",
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

/* ------------------------------------------------------------------ *
 * Read-only readiness scan for a workflow row (no remote/no mutation).*
 * Wired to the canvas: when the input trigger is switched to Serverless*
 * Schedule, the UI calls this to surface compatibility deltas BEFORE   *
 * the operator attempts a bind.                                        *
 * ------------------------------------------------------------------ */
async function runReadinessScan(deps, { providerId, body = {} } = {}) {
  const { readConfig, env } = deps;
  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = resolveSchedulerProduct(provider, clean(body.productId))
    || (clean(body.productId)
      ? getMarketplaceProduct(provider.providerId, clean(body.productId))
      : (provider.products || []).find((p) => isInboundInvocationProduct(p)))
    || null;
  if (!product || !(isSchedulerProduct(product) || isInboundInvocationProduct(product))) {
    return err(400, "provider has no serverless scheduler or inbound input-method product", { providerId: provider.providerId });
  }

  const config = await readConfig();
  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return err(400, "objectId and rowId (workflow row) are required");
  const eligible = findEligibleSandboxRow(config, objectId, rowId);
  if (!eligible.ok) return err(eligible.status, eligible.error, { providerId: provider.providerId, productId: product.productId });

  const phase = clean(eligible.row.runLocality) === "serverless" && clean(eligible.row.scheduleId) ? "bound" : "pre-bind";
  const readiness = scanServerlessReadiness({
    row: eligible.row,
    workspaceConfig: config,
    env,
    phase,
    expected: {
      schedulerRegistryId: product.integrationId,
      providerId: provider.providerId,
      productId: product.productId,
      scheduleId: clean(eligible.row.scheduleId),
      triggerInput: clean(body.triggerInput || eligible.row.schedulerTriggerInput),
    },
  });
  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, objectId, rowId, phase, readiness } };
}

/* ------------------------------------------------------------------ *
 * Install an inbound input-method binding (webhook / api-request).    *
 * EXACT mirror of runScheduleInstall minus the remote provider steps: *
 * there is no external schedule to create — the workspace's own       *
 * destination route IS the invocation surface, so the spine is        *
 * verify capability → env gate → row eligibility → readiness gate →   *
 * deterministic binding id → ONE bind write → receipt.                *
 * ------------------------------------------------------------------ */
async function runInputMethodInstall(deps, { providerId, body = {}, requestOrigin = "" } = {}) {
  const { readConfig, writeConfig, appendReceipt, env } = deps;
  const now = (deps.now || (() => new Date().toISOString()))();

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = clean(body.productId)
    ? getMarketplaceProduct(provider.providerId, clean(body.productId))
    : (provider.products || []).find((p) => isInboundInvocationProduct(p)) || null;
  if (!product || !isInboundInvocationProduct(product)) {
    return err(400, "provider has no inbound input-method product", { providerId: provider.providerId });
  }
  const triggerKind = triggerKindForLane(product.executionLane);

  const config = await readConfig();

  // Env gate — the REAL capability gate for workspace-NATIVE inbound methods:
  // there is no external account to install, so the resolvable signing secret /
  // invoke token IS the capability. Without it the destination route could
  // never verify an invocation.
  const requiredEnv = resolveRequiredEnv(product.requiredEnv, env);
  if (!requiredEnv.ok) {
    return err(422, `${product.label} runtime credentials are not connected`, { productId: product.productId, missingEnv: requiredEnv.missing, nextActions: [`Set ${requiredEnv.missing.join(", ")} in the workspace environment, then bind.`] });
  }

  // Native capability row: registry LINEAGE, never a marketplace prerequisite.
  // Provision (or re-verify) it inside the same governed write as the bind,
  // carrying the env probe above as its verification proof.
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  const installedRow = objects.flatMap((o) => (isApiRegistryObject(o) ? (o.rows || []) : [])).find((r) => clean(r?.integrationId) === product.integrationId);
  const workingConfig = installedRow && clean(installedRow.syncStatus) === "verified"
    ? config
    : withMarketplaceProductRegistry(config, {
        providerId: provider.providerId,
        productId: product.productId,
        syncResult: {
          ok: true,
          status: "connected",
          syncStatus: "verified",
          testedAt: now,
          resolvedEnv: product.requiredEnv,
          proof: `${(product.requiredEnv || []).join(", ")} resolved in runtime env.`,
          summary: `${product.label} verified natively: env refs resolve in this runtime.`,
        },
      });

  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return err(400, "objectId and rowId (workflow row) are required");

  const eligible = findEligibleSandboxRow(workingConfig, objectId, rowId);
  if (!eligible.ok) return err(eligible.status, eligible.error, { providerId: provider.providerId, productId: product.productId });
  const targetRow = eligible.row;

  // Causality gate: identical to the scheduler install — the whole downstream
  // graph must be serverless-ready BEFORE the row is bound (inbound runs are
  // serverless executions of the same published graph).
  const readiness = scanServerlessReadiness({
    row: targetRow,
    workspaceConfig: workingConfig,
    env,
    phase: "pre-bind",
    expected: {
      schedulerRegistryId: product.integrationId,
      providerId: provider.providerId,
      productId: product.productId,
      triggerInput: clean(body.triggerInput),
    },
  });
  if (!readiness.ok) {
    await appendReceipt({
      kind: READINESS_KIND,
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
      policyVerdict: { ok: false, violationCodes: readiness.deltaTags },
      summary: `${product.label} binding blocked: ${readiness.blockingNodes.length} downstream node(s) are not serverless-ready (${readiness.blockingNodes.map((n) => n.nodeId || n.nodeType).join(", ")}).`,
      nextActions: readiness.blockingNodes.map((n) => n.helperAction).filter(Boolean),
    });
    return err(422, "workflow graph is not serverless-ready", { providerId: provider.providerId, productId: product.productId, readiness });
  }

  const version = clean(body.version || targetRow.version || "v1");
  const workspaceId = clean(body.workspaceId || config?.id || "workspace");
  const explicitPublicBaseUrl = clean(body.publicBaseUrl).replace(/\/+$/, "");
  const baseUrl = explicitPublicBaseUrl || resolveWorkspacePublicUrl(env, requestOrigin);
  if (!baseUrl) return err(422, "could not resolve a public workspace URL for the invocation destination", { nextActions: ["Set GROWTHUB_WORKSPACE_PUBLIC_URL to the deployed workspace origin, then retry."] });
  const { destinationUrl } = buildSchedulerCallbackUrls(baseUrl, provider.providerId);
  const bindingId = deriveBindingId({ providerId: provider.providerId, workspaceId, objectId, rowId, version });

  // ONE write: bind the owning row + sync its live trigger node (same atomic
  // writer as the scheduler; runLocality flips to serverless, adapter
  // normalizes, trigger node carries the method's triggerKind/inputMode).
  const { config: nextConfig, bound, liveField, triggerNodeId, changedFields } = withWorkflowServerlessBind(workingConfig, {
    objectId, rowId,
    schedulerRegistryId: product.integrationId,
    schedulerProviderId: provider.providerId,
    schedulerProductId: product.productId,
    triggerKind,
    scheduleId: bindingId,
    cron: "",
    triggerInput: clean(body.triggerInput),
    destinationUrl,
    installedAt: now,
  });
  if (!bound) {
    await appendReceipt({ kind: BINDING_RECEIPT_KIND, lane: "server-authoritative", outcomeStatus: "failed", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: ["binding_bind_failed"] }, summary: `${product.label} binding ${bindingId} failed: workflow row ${rowId} could not be bound.` });
    return err(409, `could not bind workflow row ${rowId}`, { providerId: provider.providerId, productId: product.productId });
  }

  let persisted;
  try {
    persisted = await writeConfig({ dataModel: nextConfig.dataModel });
  } catch (writeErr) {
    await appendReceipt({ kind: BINDING_RECEIPT_KIND, lane: "server-authoritative", outcomeStatus: "failed", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], policyVerdict: { ok: false, violationCodes: ["binding_persist_failed"] }, summary: `${product.label} binding ${bindingId} not installed: workspace persistence failed (${clean(writeErr?.code) || "write error"}).` });
    return err(424, "binding not installed: workspace could not persist it", { providerId: provider.providerId, productId: product.productId, persisted: false, bindingId });
  }

  const { receipt } = await appendReceipt({ kind: BINDING_RECEIPT_KIND, lane: "server-authoritative", outcomeStatus: "published", actor: "workspace-marketplace", objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }], changedFields: (changedFields || []).map((f) => `dataModel.${f}`), policyVerdict: { ok: true }, schemaVerdict: { ok: true }, summary: `${product.label} ${triggerKind} binding ${bindingId} bound to ${rowId}: row serverless + ${liveField} trigger node "${triggerNodeId}" synced (published graph).` });

  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, triggerKind, scheduleId: bindingId, bindingId, bound, liveField, triggerNodeId, destinationUrl, persisted: true, workspaceConfig: persisted, receiptId: receipt?.receiptId } };
}

/* ------------------------------------------------------------------ *
 * Uninstall an inbound input-method binding. Mirror of the scheduler  *
 * DELETE path minus the remote delete — clearing the row + trigger    *
 * node IS the full teardown (the destination route rejects unbound    *
 * deliveries from that instant).                                      *
 * ------------------------------------------------------------------ */
async function runInputMethodUninstall(deps, { providerId, body = {} } = {}) {
  const { readConfig, writeConfig, appendReceipt } = deps;

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = clean(body.productId)
    ? getMarketplaceProduct(provider.providerId, clean(body.productId))
    : (provider.products || []).find((p) => isInboundInvocationProduct(p)) || null;
  if (!product || !isInboundInvocationProduct(product)) {
    return err(400, "provider has no inbound input-method product", { providerId: provider.providerId });
  }

  const config = await readConfig();
  let owner = null;
  if (clean(body.objectId) && clean(body.rowId || body.name)) {
    const eligible = findEligibleSandboxRow(config, clean(body.objectId), clean(body.rowId || body.name));
    if (eligible.ok) owner = { objectId: eligible.object.id, row: eligible.row };
  } else if (clean(body.scheduleId || body.bindingId)) {
    owner = findSandboxRowByScheduleId(config, clean(body.scheduleId || body.bindingId));
  }
  if (!owner) return err(404, "no installed workflow binding to remove", { providerId: provider.providerId });
  const bindingId = clean(body.scheduleId || body.bindingId || owner.row?.scheduleId);
  if (!bindingId) return err(404, "owning row has no installed binding", { providerId: provider.providerId });

  // OWNERSHIP GATE: the row must be CURRENTLY bound to THIS product and THIS
  // input method (row fields + published trigger node, full triple check). An
  // inbound uninstall must never clear a row bound to another product — a
  // scheduler-bound row cleared locally would keep firing remotely, a local
  // lie over remote reality.
  const triggerBinding = readTriggerScheduleBinding(owner.row[liveGraphField(owner.row)]);
  const ownership = evaluateBindingMatch({
    row: owner.row,
    triggerBinding,
    provider,
    product,
    expectedTriggerKind: triggerKindForLane(product.executionLane),
    scheduleId: bindingId,
  });
  if (!ownership.ok) {
    await appendReceipt({
      kind: BINDING_RECEIPT_KIND,
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
      policyVerdict: { ok: false, violationCodes: [`binding_uninstall_${ownership.code}`] },
      summary: `${product.label} uninstall refused: ${owner.row.Name} is not bound to ${product.integrationId} via ${triggerKindForLane(product.executionLane)} (${ownership.code}; row.schedulerRegistryId=${clean(owner.row.schedulerRegistryId) || "none"}, trigger=${triggerBinding?.triggerKind || "none"}).`,
    });
    return err(409, `row is not bound to this input method (${ownership.code})`, { providerId: provider.providerId, productId: product.productId, bindingId, code: ownership.code });
  }

  const { config: nextConfig } = withWorkflowServerlessBind(config, {
    objectId: owner.objectId,
    rowId: owner.row.Name,
    clear: true,
  });
  let persisted = true;
  try {
    await writeConfig({ dataModel: nextConfig.dataModel });
  } catch {
    persisted = false;
  }
  const liveField = liveGraphField(owner.row);
  const { receipt } = await appendReceipt({
    kind: BINDING_RECEIPT_KIND,
    lane: "server-authoritative",
    outcomeStatus: persisted ? "published" : "failed",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: owner.objectId, objectType: "sandbox-environment", rowName: owner.row.Name }],
    changedFields: [`dataModel.${owner.objectId}.${owner.row.Name}.scheduleId`, `dataModel.${owner.objectId}.${owner.row.Name}.${liveField}.trigger`],
    policyVerdict: { ok: persisted, ...(persisted ? {} : { violationCodes: ["binding_uninstall_persist_failed"] }) },
    summary: persisted
      ? `${product.label} binding ${bindingId} uninstalled from ${owner.row.Name}; row reverted to local + manual trigger.`
      : `${product.label} binding ${bindingId} uninstall did NOT persist — row still shows bound. Re-run uninstall on a writable runtime.`,
    nextActions: persisted ? [] : ["Persistence is read-only here. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use a writable runtime, then re-run uninstall to clear the row."],
  });
  if (!persisted) {
    return err(424, `binding ${bindingId} uninstall did not persist`, { providerId: provider.providerId, productId: product.productId, bindingId, persisted: false, receiptId: receipt?.receiptId });
  }
  return { status: 200, body: { ok: true, providerId: provider.providerId, productId: product.productId, scheduleId: bindingId, bindingId, deleted: true, persisted, workspaceConfig: nextConfig, receiptId: receipt?.receiptId } };
}

/* ------------------------------------------------------------------ *
 * First-class TEST INVOCATION for an inbound binding — the mirror of  *
 * runScheduleNow. Sends a REAL signed webhook / bearer API request    *
 * with user-supplied test run-input values to the row's bound         *
 * destination URL, so the invocation exercises the actual endpoint,   *
 * the actual verifier, and EVERY downstream node. The destination     *
 * door writes the durable last-run proof (status, succeededAt, node   *
 * trace) only after the whole graph ran — this core only publishes    *
 * the attempt and reports the outcome.                                *
 * ------------------------------------------------------------------ */
async function runInputMethodInvoke(deps, { providerId, body = {}, requestOrigin = "" } = {}) {
  const { fetchImpl, readConfig, appendReceipt, env } = deps;

  const provider = getMarketplaceProvider(clean(providerId));
  if (!provider) return err(404, "unknown marketplace provider", { providerId });
  const product = clean(body.productId)
    ? getMarketplaceProduct(provider.providerId, clean(body.productId))
    : (provider.products || []).find((p) => isInboundInvocationProduct(p)) || null;
  if (!product || !isInboundInvocationProduct(product)) {
    return err(400, "provider has no inbound input-method product", { providerId: provider.providerId });
  }
  const adapter = getInboundAdapter(product);
  const triggerKind = triggerKindForLane(product.executionLane);

  const config = await readConfig();
  const objectId = clean(body.objectId);
  const rowId = clean(body.rowId || body.name);
  if (!objectId || !rowId) return err(400, "objectId and rowId (workflow row) are required");
  const eligible = findEligibleSandboxRow(config, objectId, rowId);
  if (!eligible.ok) return err(eligible.status, eligible.error, { providerId: provider.providerId, productId: product.productId });
  const targetRow = eligible.row;
  const bindingId = clean(body.scheduleId || body.bindingId || targetRow.scheduleId);
  if (!bindingId) return err(409, "workflow row has no installed binding", { providerId: provider.providerId, productId: product.productId, objectId, rowId });

  // Ownership: the row must be CURRENTLY bound to this product and method.
  const triggerBinding = readTriggerScheduleBinding(targetRow[liveGraphField(targetRow)]);
  const ownership = evaluateBindingMatch({ row: targetRow, triggerBinding, provider, product, expectedTriggerKind: triggerKind, scheduleId: bindingId });
  if (!ownership.ok) {
    return err(409, `row is not bound to this input method (${ownership.code})`, { providerId: provider.providerId, productId: product.productId, bindingId, code: ownership.code });
  }

  // The credential the door will verify must resolve here so the test request
  // is signed/authenticated exactly like a real external invocation.
  const secret = adapter.resolveSecret(env);
  if (!secret) {
    return err(422, `${product.label} runtime credentials are not connected`, { productId: product.productId, missingEnv: [adapter.secretEnv] });
  }

  const workspaceId = clean(body.workspaceId || config?.id || "workspace");
  const version = clean(body.version || targetRow.version || "v1");
  const baseUrl = resolveWorkspacePublicUrl(env, requestOrigin);
  const destinationUrl = clean(targetRow.schedulerDestination)
    || (baseUrl ? buildSchedulerCallbackUrls(baseUrl, provider.providerId).destinationUrl : "");
  if (!destinationUrl) return err(422, "could not resolve the binding's destination URL", { nextActions: ["Set GROWTHUB_WORKSPACE_PUBLIC_URL to the deployed workspace origin, then retry."] });

  // User-supplied test values ride the canonical run-input envelope; the door
  // validates them against the workflow's own input schema before any node runs.
  const runInputs = body.runInputs && typeof body.runInputs === "object" && !Array.isArray(body.runInputs)
    ? body.runInputs
    : undefined;
  const rawBody = JSON.stringify({
    kind: "growthub-invoked-run-v1",
    scheduleId: bindingId,
    workspaceId,
    objectId,
    rowId,
    version,
    ...(runInputs ? { runInputs } : {}),
  });

  const headers = { "content-type": "application/json" };
  if (triggerKind === "inbound-webhook") {
    const signed = signInboundWebhook({ secret, rawBody, destinationUrl });
    headers["x-growthub-signature"] = signed.signature;
    headers["x-growthub-timestamp"] = signed.timestamp;
  } else {
    headers.authorization = `Bearer ${secret}`;
  }

  let httpStatus = 0;
  let parsed = null;
  let failure = "";
  try {
    const response = await fetchWithTimeout(fetchImpl, destinationUrl, { method: "POST", headers, body: rawBody }, INVOKE_TIMEOUT_MS);
    httpStatus = response.status;
    const text = await response.text();
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!(httpStatus >= 200 && httpStatus < 300) || parsed?.ok !== true) {
      failure = clean(parsed?.error) || `HTTP ${httpStatus}`;
    }
  } catch (e) {
    failure = e?.message || "invocation request failed";
  }
  const ok = !failure;

  const { receipt } = await appendReceipt({
    kind: "workspace-add-on-binding-run",
    lane: "server-authoritative",
    outcomeStatus: ok ? "published" : "blocked",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId, objectType: "sandbox-environment", rowName: rowId }],
    policyVerdict: { ok, ...(ok ? {} : { violationCodes: ["binding_test_invocation_failed"] }) },
    runId: clean(parsed?.runId) || undefined,
    summary: ok
      ? `${product.label} test invocation of ${rowId} succeeded (HTTP ${httpStatus}); durable proof written by the destination door.`
      : `${product.label} test invocation of ${rowId} failed: ${failure}.`,
  });

  if (!ok) {
    return err(502, `test invocation failed: ${failure}`, { providerId: provider.providerId, productId: product.productId, bindingId, httpStatus, receiptId: receipt?.receiptId });
  }
  return {
    status: 200,
    body: {
      ok: true,
      providerId: provider.providerId,
      productId: product.productId,
      triggerKind,
      objectId,
      rowId,
      scheduleId: bindingId,
      bindingId,
      httpStatus,
      runId: clean(parsed?.runId),
      duplicate: parsed?.duplicate === true,
      proofPersisted: parsed?.proofPersisted !== false,
      receiptId: receipt?.receiptId,
    },
  };
}

export { runScheduleInstall, runScheduleNow, runSchedulerCallback, runReadinessScan, runInputMethodInstall, runInputMethodUninstall, runInputMethodInvoke };
