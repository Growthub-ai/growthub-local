/**
 * GET    /api/workspace/add-ons/[providerId]/storage
 * POST   /api/workspace/add-ons/[providerId]/storage
 * DELETE /api/workspace/add-ons/[providerId]/storage
 *
 * Governed storage/CDN door for the Supabase Storage product (executionLane
 * "workspace-storage", connectorKind "supabase-storage") — the second
 * Supabase product, a sibling of the /data route. Same provider account, a
 * distinct governed object (the buckets object), gated on a connected
 * provider AND a linked governed data table.
 *
 *   GET    → read-only state: readiness, the gate causation state
 *            (deriveBucketProductState), the linkable tables, the live
 *            bucket inventory, and the governed buckets object.
 *   POST   → one governed action per call, receipted (workspace-add-on-storage):
 *              create-linked-table { label? }              (first-run table)
 *              link-table   { linkedTableObjectId }        (enable creation)
 *              create-bucket{ name, access?, allowedMimeTypes?, fileSizeLimit?, linkedRecordRef? }
 *              sync-buckets {}                              (pull live inventory)
 *   DELETE → delete-bucket { bucketId }  (external delete + drop the row)
 *
 * Secrets resolve server-side through the product's probe env contract and
 * never enter rows, receipts, or responses. Config writes use the same
 * server-authoritative lane as every add-on route; no new mutation surface.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  deriveWorkspaceAddOnsState,
} from "@/lib/workspace-add-ons";
import {
  buildBucketsObject,
  buildBucketProof,
  deriveBucketProductState,
  findBucketsObject,
  listLinkableTables,
  mergeBucketsIntoRows,
  parseBucketInventory,
  validateBucketRequest,
  withBucketsObject,
} from "@/lib/workspace-storage-buckets";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const FETCH_TIMEOUT_MS = 15000;
const SUPPORTED_CONNECTOR_KIND = "supabase-storage";
const STORAGE_LANE = "workspace-storage";

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

/** Resolve the provider's workspace-storage product + runtime env, or error. */
function resolveStorageProduct(providerId) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return { error: "unknown marketplace provider", status: 404 };
  const product = (provider.products || []).find((item) => clean(item.executionLane) === STORAGE_LANE);
  if (!product) return { error: `${provider.label} has no workspace-storage product`, status: 404, provider };
  if (clean(product.connectorKind) !== SUPPORTED_CONNECTOR_KIND) {
    return { error: `connectorKind ${product.connectorKind} has no storage adapter yet`, status: 400, provider, product };
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
    missingEnv: [...(baseUrl ? [] : [probe.baseUrlEnv]), ...(secret ? [] : [probe.tokenEnv])].filter(Boolean),
  };
}

function storageHeaders({ secret, tokenHeaderName, extra = {} }) {
  return {
    accept: "application/json",
    authorization: `Bearer ${secret}`,
    ...(tokenHeaderName ? { [tokenHeaderName]: secret } : {}),
    ...extra,
  };
}

function bucketUrl(baseUrl, suffix = "") {
  return `${clean(baseUrl).replace(/\/+$/, "")}/storage/v1/bucket${suffix ? `/${clean(suffix).replace(/^\/+/, "")}` : ""}`;
}

async function fetchBucketInventory(resolution) {
  const response = await fetchWithTimeout(bucketUrl(resolution.baseUrl), { headers: storageHeaders(resolution) });
  if (!response.ok) return { ok: false, status: response.status, buckets: [] };
  return { ok: true, status: response.status, buckets: parseBucketInventory(await readJsonSafe(response)) };
}

async function appendStorageReceipt({ outcomeStatus, summary, object, bucket, nextActions = [], violationCodes = [] }) {
  return appendOutcomeReceipt({
    kind: "workspace-add-on-storage",
    lane: "server-authoritative",
    outcomeStatus,
    actor: "workspace-marketplace",
    objectRefs: [
      ...(object ? [{ objectId: clean(object.id), objectType: "data-source", rowName: clean(object.label || object.name) }] : []),
      { objectId: "api-registry", objectType: "api-registry", rowName: clean(bucket) || "storage bucket" },
    ],
    changedFields: object ? [`dataModel.${clean(object.id)}`] : [],
    policyVerdict: violationCodes.length ? { ok: false, violationCodes } : { ok: true },
    schemaVerdict: { ok: true },
    summary,
    nextActions,
  });
}

function gateContext(resolution, workspaceConfig) {
  const addOnsState = deriveWorkspaceAddOnsState(workspaceConfig);
  const providerConnected = Boolean(addOnsState?.hasSupabaseProvider);
  const buckets = findBucketsObject(workspaceConfig, resolution.provider.providerId);
  const linkable = listLinkableTables(workspaceConfig, { excludeId: buckets?.id });
  const gate = deriveBucketProductState(workspaceConfig, resolution.provider.providerId, {
    providerConnected,
    linkableCount: linkable.length,
  });
  return { providerConnected, buckets, linkable, gate };
}

async function GET(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveStorageProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  const workspaceConfig = await readWorkspaceConfig();
  const { providerConnected, buckets, linkable, gate } = gateContext(resolution, workspaceConfig);

  let inventory = { ok: false, status: 0, buckets: [] };
  if (resolution.envReady) {
    try {
      inventory = await fetchBucketInventory(resolution);
    } catch (error) {
      inventory = { ok: false, status: 0, buckets: [], error: error?.message || "network error" };
    }
  }

  return NextResponse.json({
    ok: true,
    providerId: resolution.provider.providerId,
    productId: resolution.product.productId,
    integrationId: resolution.product.integrationId,
    envReady: resolution.envReady,
    missingEnv: resolution.missingEnv,
    providerConnected,
    gate,
    linkableTables: linkable,
    linkedTableObjectId: clean(buckets?.linkedTableObjectId),
    linkedTableLabel: clean(buckets?.linkedTableLabel),
    buckets: inventory.buckets,
    bucketsProbe: { ok: inventory.ok, status: inventory.status },
    object: buckets
      ? { objectId: buckets.id, label: clean(buckets.label), rowCount: Array.isArray(buckets.rows) ? buckets.rows.length : 0 }
      : null,
  });
}

async function POST(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveStorageProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const action = clean(body.action);
  if (!["create-linked-table", "link-table", "create-bucket", "sync-buckets"].includes(action)) {
    return jsonError("action must be create-linked-table | link-table | create-bucket | sync-buckets", 400);
  }

  const workspaceConfig = await readWorkspaceConfig();
  const { providerConnected, buckets, linkable, gate } = gateContext(resolution, workspaceConfig);
  const nowIso = new Date().toISOString();

  // Hard gate 1: provider must be connected for any storage action.
  if (!providerConnected) {
    await appendStorageReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} ${action} blocked: Supabase account not connected.`,
      violationCodes: ["provider_not_connected"],
      nextActions: ["Connect the Supabase provider account in the marketplace, then retry."],
    });
    return jsonError("Supabase provider account is not connected", 409, { gate });
  }

  const integrationId = resolution.product.integrationId;

  // ---- create-linked-table: first-run table owned by the storage install ----
  if (action === "create-linked-table") {
    const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
    const baseId = "supabase-storage-files";
    const ids = new Set(objects.map((object) => clean(object?.id)).filter(Boolean));
    let objectId = baseId;
    let suffix = 2;
    while (ids.has(objectId)) {
      objectId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const label = clean(body.label) || "Supabase Storage Files";
    const tableObject = {
      id: objectId,
      label,
      source: label,
      objectType: "data-source",
      icon: "Database",
      columns: ["Name", "bucketId", "objectPath", "mimeType", "size", "publicUrl", "status"],
      rows: [],
      binding: { mode: "manual", source: "Supabase Storage" },
      fieldSettings: {},
    };
    const base = buckets || buildBucketsObject({ providerId: resolution.provider.providerId, integrationId });
    const nextBuckets = {
      ...base,
      ...buildBucketsObject({
        providerId: resolution.provider.providerId,
        integrationId,
        linkedTableObjectId: tableObject.id,
        linkedTableLabel: tableObject.label,
        label: base.label,
      }),
      rows: Array.isArray(base.rows) ? base.rows : [],
    };
    const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
    const { config } = withBucketsObject({
      ...workspaceConfig,
      dataModel: { ...dm, objects: [...objects, tableObject] },
    }, nextBuckets);
    const summary = buildBucketProof({ action: "create linked table", bucket: tableObject.label });
    const { receipt } = await appendStorageReceipt({ outcomeStatus: "published", summary, object: nextBuckets, bucket: tableObject.label });
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    return NextResponse.json({
      ok: true,
      action,
      linkedTableObjectId: tableObject.id,
      linkedTableLabel: tableObject.label,
      workspaceConfig: persisted,
      receiptId: receipt.receiptId,
    });
  }

  // ---- link-table: bind the buckets object to an existing governed table ----
  if (action === "link-table") {
    const linkedTableObjectId = clean(body.linkedTableObjectId);
    const match = linkable.find((table) => table.objectId === linkedTableObjectId);
    if (!linkedTableObjectId || !match) {
      return jsonError("link-table requires a valid linkedTableObjectId from linkableTables", 400, { linkableTables: linkable });
    }
    const base = buckets || buildBucketsObject({ providerId: resolution.provider.providerId, integrationId });
    const nextObject = {
      ...base,
      ...buildBucketsObject({
        providerId: resolution.provider.providerId,
        integrationId,
        linkedTableObjectId,
        linkedTableLabel: match.label,
        label: base.label,
      }),
      rows: Array.isArray(base.rows) ? base.rows : [],
    };
    const summary = buildBucketProof({ action: "link", bucket: match.label });
    const { receipt } = await appendStorageReceipt({ outcomeStatus: "published", summary, object: nextObject, bucket: match.label });
    const { config } = withBucketsObject(workspaceConfig, nextObject);
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    return NextResponse.json({ ok: true, action, linkedTableObjectId, workspaceConfig: persisted, receiptId: receipt.receiptId });
  }

  // Hard gate 2: creation/sync require env + a linked table.
  if (!resolution.envReady) {
    await appendStorageReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} ${action} blocked: runtime env not resolved.`,
      violationCodes: ["storage_env_not_ready"],
      nextActions: [`Resolve ${resolution.missingEnv.join(", ")} in the runtime.`],
    });
    return jsonError("storage runtime env is not resolved", 422, { missingEnv: resolution.missingEnv, gate });
  }
  if (!buckets || !clean(buckets.linkedTableObjectId)) {
    await appendStorageReceipt({
      outcomeStatus: "blocked",
      summary: `${resolution.product.label} ${action} blocked: no governed data table linked.`,
      violationCodes: ["storage_table_not_linked"],
      nextActions: ["Link a governed data table (link-table) before creating buckets."],
    });
    return jsonError("no governed data table is linked to the storage product", 409, { gate });
  }

  // ---- create-bucket: real Supabase Storage create + governed row ----
  if (action === "create-bucket") {
    const validation = validateBucketRequest(body);
    if (!validation.ok) {
      await appendStorageReceipt({
        outcomeStatus: "blocked",
        summary: `create-bucket blocked: ${validation.error}`,
        object: buckets,
        violationCodes: ["invalid_bucket_request"],
      });
      return jsonError(validation.error, 400);
    }
    let createResponse;
    try {
      createResponse = await fetchWithTimeout(bucketUrl(resolution.baseUrl), {
        method: "POST",
        headers: storageHeaders({ ...resolution, extra: { "content-type": "application/json" } }),
        body: JSON.stringify(validation.request),
      });
    } catch (error) {
      await appendStorageReceipt({ outcomeStatus: "blocked", summary: `create-bucket ${validation.request.id} failed: ${error?.message || "network error"}`, object: buckets, bucket: validation.request.id, violationCodes: ["bucket_create_failed"] });
      return jsonError("bucket create failed", 502, { bucket: validation.request.id });
    }
    if (!createResponse.ok) {
      const detail = clean(await createResponse.text()).slice(0, 240);
      await appendStorageReceipt({
        outcomeStatus: "blocked",
        summary: `create-bucket ${validation.request.id} blocked: Storage API returned HTTP ${createResponse.status}.`,
        object: buckets,
        bucket: validation.request.id,
        violationCodes: ["bucket_create_failed"],
        nextActions: ["A bucket with this name may already exist, or the service key lacks storage admin scope."],
      });
      return jsonError(`bucket create failed (HTTP ${createResponse.status})`, 502, { bucket: validation.request.id, detail });
    }
    // Re-read the live inventory so the governed row reflects the authoritative
    // external state (closed loop: create → read-back → govern).
    const inventory = await fetchBucketInventory(resolution);
    const merge = mergeBucketsIntoRows({
      rows: buckets.rows,
      buckets: inventory.ok ? inventory.buckets : [{ id: validation.request.id, name: validation.request.name, public: validation.request.public, allowedMimeTypes: validation.request.allowed_mime_types || [], fileSizeLimit: validation.request.file_size_limit, createdAt: nowIso }],
      baseUrl: resolution.baseUrl,
      registryId: integrationId,
      linkedTableObjectId: clean(buckets.linkedTableObjectId),
      nowIso,
    });
    // Carry the per-record correlation the user set for this bucket.
    const linkedRecordRef = clean(body.linkedRecordRef);
    const rows = merge.rows.map((row) => (row.bucketId === validation.request.id && linkedRecordRef ? { ...row, linkedRecordRef } : row));
    const summary = buildBucketProof({ action: "create", bucket: validation.request.id, httpStatus: createResponse.status, access: validation.access, count: rows.length });
    const nextObject = { ...buckets, rows };
    const { receipt } = await appendStorageReceipt({ outcomeStatus: "published", summary, object: nextObject, bucket: validation.request.id });
    const { config } = withBucketsObject(workspaceConfig, nextObject);
    const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
    return NextResponse.json({ ok: true, action, bucketId: validation.request.id, access: validation.access, workspaceConfig: persisted, receiptId: receipt.receiptId, summary });
  }

  // ---- sync-buckets: pull the live inventory into the governed object ----
  const inventory = await fetchBucketInventory(resolution);
  if (!inventory.ok) {
    await appendStorageReceipt({ outcomeStatus: "blocked", summary: `sync-buckets blocked: Storage API returned HTTP ${inventory.status}.`, object: buckets, violationCodes: ["bucket_list_failed"] });
    return jsonError(`bucket list failed (HTTP ${inventory.status})`, 502);
  }
  const merge = mergeBucketsIntoRows({ rows: buckets.rows, buckets: inventory.buckets, baseUrl: resolution.baseUrl, registryId: integrationId, linkedTableObjectId: clean(buckets.linkedTableObjectId), nowIso });
  const summary = buildBucketProof({ action: "sync", httpStatus: inventory.status, count: merge.rows.length });
  const nextObject = { ...buckets, rows: merge.rows };
  const { receipt } = await appendStorageReceipt({ outcomeStatus: "published", summary, object: nextObject });
  const { config } = withBucketsObject(workspaceConfig, nextObject);
  const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
  return NextResponse.json({ ok: true, action, added: merge.added, updated: merge.updated, removed: merge.removed, workspaceConfig: persisted, receiptId: receipt.receiptId, summary });
}

async function DELETE(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const params = await context?.params;
  const resolution = resolveStorageProduct(clean(params?.providerId));
  if (resolution.error) return jsonError(resolution.error, resolution.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const bucketId = clean(body.bucketId);
  if (!bucketId) return jsonError("delete requires bucketId", 400);
  if (!resolution.envReady) return jsonError("storage runtime env is not resolved", 422, { missingEnv: resolution.missingEnv });

  const workspaceConfig = await readWorkspaceConfig();
  const buckets = findBucketsObject(workspaceConfig, resolution.provider.providerId);
  if (!buckets) return jsonError("no governed buckets object", 404);

  let deleteResponse;
  try {
    deleteResponse = await fetchWithTimeout(bucketUrl(resolution.baseUrl, bucketId), {
      method: "DELETE",
      headers: storageHeaders({ ...resolution, extra: { "content-type": "application/json" } }),
    });
  } catch (error) {
    await appendStorageReceipt({ outcomeStatus: "blocked", summary: `delete-bucket ${bucketId} failed: ${error?.message || "network error"}`, object: buckets, bucket: bucketId, violationCodes: ["bucket_delete_failed"] });
    return jsonError("bucket delete failed", 502, { bucket: bucketId });
  }
  if (!deleteResponse.ok) {
    const detail = clean(await deleteResponse.text()).slice(0, 240);
    await appendStorageReceipt({ outcomeStatus: "blocked", summary: `delete-bucket ${bucketId} blocked: Storage API returned HTTP ${deleteResponse.status}.`, object: buckets, bucket: bucketId, violationCodes: ["bucket_delete_failed"], nextActions: ["Empty the bucket first if it still holds objects."] });
    return jsonError(`bucket delete failed (HTTP ${deleteResponse.status})`, 502, { bucket: bucketId, detail });
  }
  const rows = (Array.isArray(buckets.rows) ? buckets.rows : []).filter((row) => clean(row?.bucketId) !== bucketId);
  const summary = buildBucketProof({ action: "delete", bucket: bucketId, httpStatus: deleteResponse.status, count: rows.length });
  const nextObject = { ...buckets, rows };
  const { receipt } = await appendStorageReceipt({ outcomeStatus: "published", summary, object: nextObject, bucket: bucketId });
  const { config } = withBucketsObject(workspaceConfig, nextObject);
  const persisted = await writeWorkspaceConfig({ dataModel: config.dataModel });
  return NextResponse.json({ ok: true, action: "delete-bucket", bucketId, workspaceConfig: persisted, receiptId: receipt.receiptId, summary });
}

export { GET, POST, DELETE };
