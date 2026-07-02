/**
 * GET    /api/workspace/add-ons/[providerId]/data
 * POST   /api/workspace/add-ons/[providerId]/data
 * DELETE /api/workspace/add-ons/[providerId]/data
 *
 * Governed database-operations door for marketplace data products
 * (executionLane "workspace-data") — the /data sibling of the /schedule
 * route. V1 executes the PostgREST shape (connectorKind "supabase-data").
 *
 *   GET    → read-only state: product readiness, external table inventory
 *            (PostgREST root OpenAPI), and the governed objects bound to
 *            external tables with their last sync proof.
 *   POST   → one governed action per call, each receipted to
 *            workspace:agent-outcomes (kind workspace-add-on-data-sync):
 *              install-object { table, correlationKey?, label?, limit? }
 *              pull           { objectId, limit? }
 *              push           { objectId }   (push, then pull-merge verify)
 *              bind-object    { objectId, table, correlationKey? }
 *   DELETE → unbind { objectId } (object + rows stay; binding fields clear)
 *
 * Secrets resolve server-side through the product's declared probe env
 * contract (baseUrlEnv/tokenEnv/tokenHeaderName) and never enter rows,
 * receipts, or responses. Config writes use the same server-authoritative
 * lane as every add-on route; there is no new mutation surface.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  listProviderProductReadiness,
} from "@/lib/workspace-add-ons";
import {
  MAX_SYNC_ROWS,
  buildExternalTableObject,
  buildPushRecords,
  buildSyncProof,
  listExternalSyncObjects,
  mergeExternalIntoRows,
  parseOpenApiTables,
  stampObjectSyncResult,
  withExternalSyncObject,
} from "@/lib/workspace-external-sync";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const FETCH_TIMEOUT_MS = 15000;
const SUPPORTED_CONNECTOR_KIND = "supabase-data";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function envValue(key) {
  return clean(readEnvVar(key, process.env)?.value || "");
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Resolve the provider's workspace-data product + runtime env, or an error. */
function resolveDataProduct(providerId) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return { error: "unknown marketplace provider", status: 404 };
  const product = (provider.products || []).find(
    (item) => clean(item.executionLane) === "workspace-data",
  );
  if (!product) return { error: `${provider.label} has no workspace-data product`, status: 404, provider };
  if (clean(product.connectorKind) !== SUPPORTED_CONNECTOR_KIND) {
    return { error: `connectorKind ${product.connectorKind} has no data adapter yet`, status: 400, provider, product };
  }
  const probe = product.probe || {};
  const baseUrl = envValue(probe.baseUrlEnv);
  const secret = envValue(probe.tokenEnv);
  return {
    provider,
    product,
    baseUrl,
    secret,
    tokenHeaderName: clean(probe.tokenHeaderName),
    envReady: Boolean(baseUrl && secret),
    missingEnv: [
      ...(baseUrl ? [] : [probe.baseUrlEnv]),
      ...(secret ? [] : [probe.tokenEnv]),
    ].filter(Boolean),
  };
}

function dataHeaders({ secret, tokenHeaderName, extra = {} }) {
  return {
    accept: "application/json",
    authorization: `Bearer ${secret}`,
    ...(tokenHeaderName ? { [tokenHeaderName]: secret } : {}),
    ...extra,
  };
}

function restUrl(baseUrl, suffix) {
  return `${clean(baseUrl).replace(/\/+$/, "")}/rest/v1/${clean(suffix).replace(/^\/+/, "")}`;
}

async function fetchTableInventory(runtime) {
  const response = await fetchWithTimeout(restUrl(runtime.baseUrl, ""), {
    headers: dataHeaders(runtime),
  });
  if (!response.ok) return { ok: false, status: response.status, tables: [] };
  return { ok: true, status: response.status, tables: parseOpenApiTables(await readJsonSafe(response)) };
}

async function fetchTableRecords(runtime, table, limit) {
  const bounded = Math.min(Math.max(Number(limit) || MAX_SYNC_ROWS, 1), MAX_SYNC_ROWS);
  const response = await fetchWithTimeout(
    `${restUrl(runtime.baseUrl, table)}?select=*&limit=${bounded}`,
    { headers: dataHeaders(runtime) },
  );
  const payload = await readJsonSafe(response);
  return {
    ok: response.ok,
    status: response.status,
    records: Array.isArray(payload) ? payload : [],
  };
}

function summarizeSyncObject(object) {
  return {
    objectId: clean(object.id),
    label: clean(object.label || object.name),
    externalTable: clean(object.externalTable),
    correlationKey: clean(object.externalCorrelationKey) || "id",
    registryId: clean(object.externalRegistryId),
    rowCount: Array.isArray(object.rows) ? object.rows.length : 0,
    lastSyncedAt: clean(object.lastSyncedAt),
    lastSyncStatus: clean(object.lastSyncStatus),
    lastSyncSummary: clean(object.lastSyncSummary),
    lastSyncReceiptId: clean(object.lastSyncReceiptId),
  };
}

async function appendSyncReceipt({ outcomeStatus, summary, object, table, nextActions = [], violationCodes = [] }) {
  return appendOutcomeReceipt({
    kind: "workspace-add-on-data-sync",
    lane: "server-authoritative",
    outcomeStatus,
    actor: "workspace-marketplace",
    objectRefs: [
      ...(object ? [{ objectId: clean(object.id), objectType: "data-source", rowName: clean(object.label || object.name) }] : []),
      { objectId: "api-registry", objectType: "api-registry", rowName: clean(table) || "external table" },
    ],
    changedFields: object ? [`dataModel.${clean(object.id)}`] : [],
    policyVerdict: violationCodes.length ? { ok: false, violationCodes } : { ok: true },
    schemaVerdict: { ok: true },
    summary,
    nextActions,
  });
}

async function GET(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveDataProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  const workspaceConfig = await readWorkspaceConfig();
  const objects = listExternalSyncObjects(workspaceConfig)
    .filter((object) => clean(object.externalRegistryId) === resolution.product.integrationId)
    .map(summarizeSyncObject);
  const readiness = listProviderProductReadiness(resolution.provider.providerId, process.env)
    .find((item) => item.productId === resolution.product.productId) || null;

  let inventory = { ok: false, status: 0, tables: [] };
  if (resolution.envReady) {
    try {
      inventory = await fetchTableInventory(resolution);
    } catch (error) {
      inventory = { ok: false, status: 0, tables: [], error: error?.message || "network error" };
    }
  }

  return NextResponse.json({
    ok: true,
    providerId: resolution.provider.providerId,
    productId: resolution.product.productId,
    integrationId: resolution.product.integrationId,
    envReady: resolution.envReady,
    missingEnv: resolution.missingEnv,
    readiness,
    tables: inventory.tables,
    tablesProbe: { ok: inventory.ok, status: inventory.status },
    objects,
  });
}

async function POST(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveDataProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const action = clean(body.action);
  if (!["install-object", "pull", "push", "bind-object"].includes(action)) {
    return jsonError("action must be install-object | pull | push | bind-object", 400);
  }
  if (!resolution.envReady) {
    await appendSyncReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} ${action} blocked: runtime env not resolved.`,
      table: clean(body.table),
      violationCodes: ["provider_product_not_connected"],
      nextActions: [`Verify ${resolution.product.label} in the Add-ons Marketplace, then retry.`],
    });
    return jsonError(`${resolution.product.label} runtime env is not resolved`, 422, { missingEnv: resolution.missingEnv });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const nowIso = new Date().toISOString();
  const integrationId = resolution.product.integrationId;

  if (action === "bind-object") {
    const objectId = clean(body.objectId);
    const table = clean(body.table);
    if (!objectId || !table) return jsonError("bind-object requires objectId and table", 400);
    const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
    const target = objects.find((object) => clean(object?.id) === objectId);
    if (!target) return jsonError(`no object with id ${objectId}`, 404);
    const bound = {
      ...target,
      externalTable: table,
      externalCorrelationKey: clean(body.correlationKey) || "id",
      externalRegistryId: integrationId,
    };
    const { config } = withExternalSyncObject(workspaceConfig, bound);
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    const { receipt } = await appendSyncReceipt({
      outcomeStatus: "published",
      summary: `Bound object ${objectId} to external table ${table} (${integrationId}).`,
      object: bound,
      table,
      nextActions: [`Push ${objectId} to ${table}, or pull to mirror external rows.`],
    });
    return NextResponse.json({ ok: true, action, object: summarizeSyncObject(bound), workspaceConfig: persisted, receiptId: receipt.receiptId });
  }

  if (action === "install-object") {
    const table = clean(body.table);
    if (!table) return jsonError("install-object requires table", 400);
    let inventory = { tables: [] };
    try {
      inventory = await fetchTableInventory(resolution);
    } catch { /* columns fall back to record keys */ }
    const tableMeta = inventory.tables.find((item) => item.name === table) || { name: table, columns: [] };
    const pull = await fetchTableRecords(resolution, table, body.limit);
    if (!pull.ok) {
      await appendSyncReceipt({
        outcomeStatus: "blocked",
        summary: `install-object ${table} blocked: PostgREST returned HTTP ${pull.status}.`,
        table,
        violationCodes: ["external_table_fetch_failed"],
        nextActions: ["Confirm the table exists and the service key has access, then retry."],
      });
      return jsonError(`external table fetch failed (HTTP ${pull.status})`, 502, { table });
    }
    const correlationKey = clean(body.correlationKey) || "id";
    const columns = tableMeta.columns.length
      ? tableMeta.columns
      : Array.from(new Set(pull.records.flatMap((record) => Object.keys(record || {})))).slice(0, 64);
    const shell = buildExternalTableObject({
      providerId: resolution.provider.providerId,
      table,
      columns,
      integrationId,
      correlationKey,
      label: clean(body.label),
    });
    const existing = (workspaceConfig?.dataModel?.objects || []).find((object) => clean(object?.id) === shell.id);
    const merge = mergeExternalIntoRows({
      rows: existing?.rows || [],
      records: pull.records,
      columns,
      correlationKey,
      registryId: integrationId,
      nowIso,
    });
    const summary = buildSyncProof({
      action: existing ? "refresh" : "install",
      table,
      pulled: pull.records.length,
      added: merge.added,
      updated: merge.updated,
      conflicts: merge.conflicts,
      localOnly: merge.localOnly,
      httpStatus: pull.status,
    });
    let nextObject = { ...(existing || {}), ...shell, rows: merge.rows };
    const { receipt } = await appendSyncReceipt({
      outcomeStatus: "published",
      summary,
      object: nextObject,
      table,
      nextActions: [`Open /data-model?object=${shell.id} to manage synced rows.`],
    });
    nextObject = stampObjectSyncResult(nextObject, { status: "pulled", summary, syncedAt: nowIso, receiptId: receipt.receiptId });
    const { config } = withExternalSyncObject(workspaceConfig, nextObject);
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    return NextResponse.json({
      ok: true,
      action,
      object: summarizeSyncObject(nextObject),
      conflicts: merge.conflicts,
      workspaceConfig: persisted,
      receiptId: receipt.receiptId,
    });
  }

  // pull / push operate on an already-bound object.
  const objectId = clean(body.objectId);
  if (!objectId) return jsonError(`${action} requires objectId`, 400);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const target = objects.find((object) => clean(object?.id) === objectId);
  if (!target) return jsonError(`no object with id ${objectId}`, 404);
  const table = clean(target.externalTable);
  if (!table || clean(target.externalRegistryId) !== integrationId) {
    return jsonError(`object ${objectId} is not bound to a ${resolution.product.label} table`, 409);
  }
  const correlationKey = clean(target.externalCorrelationKey) || "id";
  const columns = (Array.isArray(target.columns) ? target.columns : []).filter(Boolean);

  if (action === "pull") {
    const pull = await fetchTableRecords(resolution, table, body.limit);
    if (!pull.ok) {
      await appendSyncReceipt({
        outcomeStatus: "blocked",
        summary: `pull ${table} blocked: PostgREST returned HTTP ${pull.status}.`,
        object: target,
        table,
        violationCodes: ["external_table_fetch_failed"],
      });
      return jsonError(`external table fetch failed (HTTP ${pull.status})`, 502, { table });
    }
    const merge = mergeExternalIntoRows({ rows: target.rows, records: pull.records, columns, correlationKey, registryId: integrationId, nowIso });
    const summary = buildSyncProof({
      action: "pull",
      table,
      pulled: pull.records.length,
      added: merge.added,
      updated: merge.updated,
      conflicts: merge.conflicts,
      localOnly: merge.localOnly,
      httpStatus: pull.status,
    });
    const { receipt } = await appendSyncReceipt({ outcomeStatus: "published", summary, object: target, table });
    const nextObject = stampObjectSyncResult({ ...target, rows: merge.rows }, { status: "pulled", summary, syncedAt: nowIso, receiptId: receipt.receiptId });
    const { config } = withExternalSyncObject(workspaceConfig, nextObject);
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    return NextResponse.json({ ok: true, action, object: summarizeSyncObject(nextObject), conflicts: merge.conflicts, localOnly: merge.localOnly, workspaceConfig: persisted, receiptId: receipt.receiptId });
  }

  // push — local rows win; upsert then pull-merge to verify the round-trip.
  const { records, skipped } = buildPushRecords({ rows: target.rows, columns, correlationKey });
  if (!records.length) return jsonError("object has no pushable rows", 409, { skipped });
  const onConflict = correlationKey && correlationKey !== "id" ? `?on_conflict=${encodeURIComponent(correlationKey)}` : "";
  let pushResponse;
  try {
    pushResponse = await fetchWithTimeout(`${restUrl(resolution.baseUrl, table)}${onConflict}`, {
      method: "POST",
      headers: dataHeaders({
        ...resolution,
        extra: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      }),
      body: JSON.stringify(records),
    });
  } catch (error) {
    await appendSyncReceipt({
      outcomeStatus: "blocked",
      summary: `push ${table} blocked: ${clean(error?.message) || "network error"}.`,
      object: target,
      table,
      violationCodes: ["external_table_push_failed"],
    });
    return jsonError("external table push failed", 502, { table });
  }
  if (!pushResponse.ok) {
    const detail = clean(await pushResponse.text()).slice(0, 240);
    await appendSyncReceipt({
      outcomeStatus: "blocked",
      summary: `push ${table} blocked: PostgREST returned HTTP ${pushResponse.status}.`,
      object: target,
      table,
      violationCodes: ["external_table_push_failed"],
      nextActions: ["Check column names/types against the external table schema, then retry."],
    });
    return jsonError(`external table push failed (HTTP ${pushResponse.status})`, 502, { table, detail });
  }

  const verify = await fetchTableRecords(resolution, table, body.limit);
  const merge = verify.ok
    ? mergeExternalIntoRows({ rows: target.rows, records: verify.records, columns, correlationKey, registryId: integrationId, nowIso })
    : { rows: target.rows, added: 0, updated: 0, conflicts: [], localOnly: [] };
  const summary = buildSyncProof({
    action: "push",
    table,
    pushed: records.length,
    pulled: verify.ok ? verify.records.length : 0,
    updated: merge.updated,
    conflicts: merge.conflicts,
    localOnly: merge.localOnly,
    httpStatus: pushResponse.status,
  });
  const { receipt } = await appendSyncReceipt({
    outcomeStatus: "published",
    summary,
    object: target,
    table,
    nextActions: skipped.length ? [`${skipped.length} empty rows were skipped.`] : [],
  });
  const nextObject = stampObjectSyncResult({ ...target, rows: merge.rows }, { status: "pushed", summary, syncedAt: nowIso, receiptId: receipt.receiptId });
  const { config } = withExternalSyncObject(workspaceConfig, nextObject);
  const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
  return NextResponse.json({ ok: true, action, object: summarizeSyncObject(nextObject), pushed: records.length, skipped, conflicts: merge.conflicts, workspaceConfig: persisted, receiptId: receipt.receiptId });
}

async function DELETE(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveDataProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const objectId = clean(body.objectId);
  if (!objectId) return jsonError("unbind requires objectId", 400);
  const workspaceConfig = await readWorkspaceConfig();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const target = objects.find((object) => clean(object?.id) === objectId);
  if (!target) return jsonError(`no object with id ${objectId}`, 404);
  const table = clean(target.externalTable);
  const unbound = { ...target };
  delete unbound.externalTable;
  delete unbound.externalCorrelationKey;
  delete unbound.externalRegistryId;
  const { config } = withExternalSyncObject(workspaceConfig, unbound);
  const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
  const { receipt } = await appendSyncReceipt({
    outcomeStatus: "published",
    summary: `Unbound object ${objectId} from external table ${table || "(none)"}; rows retained.`,
    object: unbound,
    table,
  });
  return NextResponse.json({ ok: true, action: "unbind", objectId, workspaceConfig: persisted, receiptId: receipt.receiptId });
}

export { GET, POST, DELETE };
