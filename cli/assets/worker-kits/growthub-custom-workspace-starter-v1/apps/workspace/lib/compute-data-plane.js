/**
 * Signed, content-addressed dataset plane for remote governed compute.
 *
 * The server reconstructs the exact export-tagged JSONL bytes, hashes and
 * stages them under a governed root, then issues a short-lived read-only URL
 * bound to trainingRunId + workSpecHash + corpusSha256. The download route
 * records a signed delivery receipt only after every byte is streamed. A
 * returned artifact cannot be accepted until that receipt proves the exact
 * governed corpus was fetched.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { resolveComputeDataStore } from "./compute-data-store.js";
import { buildTrainingDatasetJsonl } from "./training-dataset.js";
import { TRACES_OBJECT_ID } from "./training-ledger.js";

export const COMPUTE_DATA_MANIFEST_SCHEMA = "growthub-compute-dataset-manifest-v1";
export const COMPUTE_DATA_ACCESS_SCHEMA = "growthub-compute-dataset-access-v1";
export const COMPUTE_DATA_DELIVERY_SCHEMA = "growthub-compute-dataset-delivery-v1";
export const COMPUTE_DATA_ROOT_ENV = "GROWTHUB_COMPUTE_DATA_ROOT";
export const COMPUTE_PUBLIC_BASE_URL_ENV = "GROWTHUB_COMPUTE_PUBLIC_BASE_URL";
export const COMPUTE_DATA_SIGNING_KEY_ENV = "GROWTHUB_COMPUTE_DATA_SIGNING_KEY";
export const COMPUTE_DATA_TOKEN_TTL_SECONDS_ENV = "GROWTHUB_COMPUTE_DATA_TOKEN_TTL_SECONDS";
export const DEFAULT_COMPUTE_DATA_TOKEN_TTL_SECONDS = 900;

function str(value) {
  return String(value ?? "").trim();
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonColumn(value) {
  if (plainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return plainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, function replacer(_key, item) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const sorted = {};
      for (const key of Object.keys(item).sort()) sorted[key] = item[key];
      return sorted;
    }
    return item;
  });
}

function failure(reasonCode, reason) {
  return { ok: false, reasonCode, reason };
}

function resolveDataStore({ env = process.env, fetchImpl = globalThis.fetch, dataStore = null } = {}) {
  return dataStore || resolveComputeDataStore({ env, fetchImpl });
}

function exactlyOne(rows, predicate) {
  const matches = (Array.isArray(rows) ? rows : []).filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function workspaceObjects(workspaceConfig) {
  return Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
}

function runRow(workspaceConfig, trainingRunId) {
  const rows = workspaceObjects(workspaceConfig)
    .filter((object) => object?.objectType === "model-training-run")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : []);
  return exactlyOne(rows, (row) => str(row?.trainingRunId) === str(trainingRunId));
}

function versionRow(workspaceConfig, datasetExportId) {
  const rows = workspaceObjects(workspaceConfig)
    .filter((object) => object?.objectType === "model-training")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : []);
  return exactlyOne(rows, (row) => str(row?.lastExportId) === str(datasetExportId));
}

function traceRows(workspaceConfig) {
  const object = workspaceObjects(workspaceConfig)
    .find((entry) => entry?.id === TRACES_OBJECT_ID || entry?.objectType === TRACES_OBJECT_ID);
  return Array.isArray(object?.rows) ? object.rows : [];
}

function exportedRowsFor(workspaceConfig, datasetExportId) {
  const wanted = str(datasetExportId);
  return traceRows(workspaceConfig)
    .filter((row) => {
      const historical = Array.isArray(row?.trainingExportIds) ? row.trainingExportIds.map(str) : [];
      return str(row?.lastExportId || row?.datasetExportId) === wanted || historical.includes(wanted);
    })
    .filter((row) => str(row?.redactionStatus).toLowerCase() !== "blocked")
    .filter((row) => str(row?.inputPrompt) && str(row?.agentOutput))
    .sort((left, right) => {
      const leftOrder = Number(left?.exportOrdinal);
      const rightOrder = Number(right?.exportOrdinal);
      if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) return leftOrder - rightOrder;
      return sha256(str(left?.inputPrompt)).localeCompare(sha256(str(right?.inputPrompt)));
    });
}

function expectedRecordCount(row) {
  const summary = parseJsonColumn(row?.lastExportSummary);
  const count = Number(summary?.recordCount);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

/** Materialize the exact export-tagged corpus bytes and immutable manifest. */
export async function materializeComputeDataset({
  workspaceConfig = null,
  trainingRunId = "",
  request = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {
  const run = runRow(workspaceConfig, trainingRunId);
  if (!run) return failure("dataset-run-ambiguous", `exactly one model-training-run row is required for ${str(trainingRunId)}`);
  const datasetExportId = str(request?.datasetExportId || run.datasetExportId);
  if (!datasetExportId) return failure("dataset-export-missing", "remote compute requires a dataset export identity");
  if (str(run.datasetExportId) && str(run.datasetExportId) !== datasetExportId) {
    return failure("dataset-export-conflict", "request dataset export contradicts the governed run receipt");
  }
  const version = versionRow(workspaceConfig, datasetExportId);
  if (!version) return failure("dataset-version-ambiguous", `exactly one model-training row must bind export ${datasetExportId}`);
  const rows = exportedRowsFor(workspaceConfig, datasetExportId);
  if (rows.length === 0) {
    return failure(
      "dataset-bytes-unavailable",
      `no traces are tagged lastExportId=${datasetExportId}; re-prepare the run so the server can reconstruct the exact remote corpus`,
    );
  }
  const expected = expectedRecordCount(version);
  if (expected !== null && expected !== rows.length) {
    return failure("dataset-record-count-drift", `model-training row expects ${expected} records but ${rows.length} export-tagged traces were found`);
  }
  const jsonl = buildTrainingDatasetJsonl(rows);
  const bytes = Buffer.from(jsonl, "utf8");
  if (bytes.byteLength === 0) return failure("dataset-empty", "canonical dataset serialization produced no bytes");
  const corpusSha256 = sha256(bytes);
  let store;
  try {
    store = resolveDataStore({ env, fetchImpl, dataStore });
    await store.putDataset({ corpusSha256, bytes });
  } catch (error) {
    return failure(
      str(error?.code) || "dataset-stage-failed",
      `failed to stage governed dataset bytes: ${str(error?.message || error)}`,
    );
  }
  const manifestBody = {
    schema: COMPUTE_DATA_MANIFEST_SCHEMA,
    exportId: datasetExportId,
    corpusSha256,
    sizeBytes: bytes.byteLength,
    recordCount: rows.length,
    serialization: "growthub-training-jsonl-v1",
    binding: "materialized-bytes",
    storageKind: str(store?.kind),
    durableStorage: store?.durable === true,
  };
  return {
    ok: true,
    manifest: { ...manifestBody, manifestHash: sha256(stableStringify(manifestBody)) },
    storage: { kind: str(store?.kind), durable: store?.durable === true },
  };
}

function resolveRootSigningKey(env = process.env) {
  const configured = str(env?.[COMPUTE_DATA_SIGNING_KEY_ENV])
    || str(env?.GROWTHUB_COMPUTE_AUTHORITY_KEY)
    || str(env?.GROWTHUB_WORKSPACE_SIGNING_KEY);
  if (!configured) return null;
  return createHmac("sha256", configured).update("growthub-compute-data-plane-subkey-v1").digest();
}

function tokenSignature(payloadText, key) {
  return createHmac("sha256", key).update(`growthub-compute-data-token-v1:${payloadText}`).digest("base64url");
}

function tokenIdForPayload(payload) {
  return sha256(stableStringify({
    trainingRunId: payload.trainingRunId,
    workSpecHash: payload.workSpecHash,
    corpusSha256: payload.corpusSha256,
    expiresAt: payload.expiresAt,
  })).slice(0, 32);
}

function publicBaseUrl(env = process.env) {
  const raw = str(env?.[COMPUTE_PUBLIC_BASE_URL_ENV]);
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  // Production grants are bearer capabilities crossing a remote provider
  // boundary. HTTPS is mandatory even for a loopback-looking hostname; local
  // HTTP is reserved for explicit development/certification environments.
  if (str(env?.NODE_ENV).toLowerCase() === "production" && url.protocol !== "https:") return null;
  return url;
}

/** Issue a short-lived bearer URL after authority compilation binds workSpec. */
export function issueComputeDatasetAccess({
  manifest = null,
  trainingRunId = "",
  workSpecHash = "",
  env = process.env,
  now = () => Date.now(),
} = {}) {
  if (!plainObject(manifest) || !/^[a-f0-9]{64}$/.test(str(manifest.corpusSha256))) {
    return failure("dataset-manifest-invalid", "a materialized dataset manifest is required before issuing access");
  }
  const key = resolveRootSigningKey(env);
  if (!key) return failure("dataset-signing-key-missing", `set ${COMPUTE_DATA_SIGNING_KEY_ENV}, GROWTHUB_COMPUTE_AUTHORITY_KEY, or GROWTHUB_WORKSPACE_SIGNING_KEY`);
  const base = publicBaseUrl(env);
  if (!base) return failure("dataset-public-base-url-missing", `set ${COMPUTE_PUBLIC_BASE_URL_ENV} to a reachable HTTP(S) workspace origin`);
  const ttl = Math.max(60, Math.min(3600, Math.floor(Number(env?.[COMPUTE_DATA_TOKEN_TTL_SECONDS_ENV]) || DEFAULT_COMPUTE_DATA_TOKEN_TTL_SECONDS)));
  const issuedAtMs = Number(now());
  const payload = {
    version: 1,
    trainingRunId: str(trainingRunId),
    workSpecHash: str(workSpecHash),
    exportId: str(manifest.exportId),
    manifestHash: str(manifest.manifestHash),
    corpusSha256: str(manifest.corpusSha256),
    sizeBytes: Math.max(0, Math.floor(Number(manifest.sizeBytes) || 0)),
    recordCount: Math.max(0, Math.floor(Number(manifest.recordCount) || 0)),
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + ttl * 1000).toISOString(),
  };
  payload.tokenId = tokenIdForPayload(payload);
  const payloadText = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = tokenSignature(payloadText, key);
  const token = `${payloadText}.${signature}`;
  const url = new URL(`/api/workspace/compute-data/${encodeURIComponent(token)}`, base);
  return {
    ok: true,
    access: {
      schema: COMPUTE_DATA_ACCESS_SCHEMA,
      tokenId: payload.tokenId,
      uri: url.toString(),
      expiresAt: payload.expiresAt,
      corpusSha256: payload.corpusSha256,
      sizeBytes: payload.sizeBytes,
      recordCount: payload.recordCount,
      trainingRunId: payload.trainingRunId,
      workSpecHash: payload.workSpecHash,
    },
    evidence: {
      schema: COMPUTE_DATA_ACCESS_SCHEMA,
      tokenId: payload.tokenId,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      trainingRunId: payload.trainingRunId,
      workSpecHash: payload.workSpecHash,
      exportId: payload.exportId,
      manifestHash: payload.manifestHash,
      corpusSha256: payload.corpusSha256,
      sizeBytes: payload.sizeBytes,
      recordCount: payload.recordCount,
      deliveryStatus: "issued",
    },
  };
}

export function verifyComputeDatasetToken(token, { env = process.env, now = () => Date.now() } = {}) {
  const [payloadText, suppliedSignature, extra] = str(token).split(".");
  if (!payloadText || !suppliedSignature || extra) return failure("dataset-token-malformed", "dataset access token is malformed");
  const key = resolveRootSigningKey(env);
  if (!key) return failure("dataset-signing-key-missing", "dataset signing key is unavailable");
  const expected = tokenSignature(payloadText, key);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(suppliedSignature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return failure("dataset-token-invalid", "dataset access token signature does not verify");
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8")); } catch {
    return failure("dataset-token-invalid", "dataset access token payload is invalid");
  }
  if (!plainObject(payload) || payload.version !== 1 || !/^[a-f0-9]{64}$/.test(str(payload.corpusSha256))) {
    return failure("dataset-token-invalid", "dataset access token payload is incomplete");
  }
  if (Date.parse(str(payload.expiresAt)) <= Number(now())) return failure("dataset-token-expired", "dataset access token has expired");
  if (str(payload.tokenId) !== tokenIdForPayload(payload)) return failure("dataset-token-invalid", "dataset access token identity does not match its payload");
  return { ok: true, payload };
}

function deliverySignature(body, key) {
  return createHmac("sha256", key).update(`growthub-compute-data-delivery-v1:${stableStringify(body)}`).digest("hex");
}

async function writeDeliveryReceipt(payload, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {
  const key = resolveRootSigningKey(env);
  if (!key) throw new Error("dataset signing key is unavailable");
  const immutable = {
    schema: COMPUTE_DATA_DELIVERY_SCHEMA,
    tokenId: str(payload.tokenId),
    trainingRunId: str(payload.trainingRunId),
    workSpecHash: str(payload.workSpecHash),
    exportId: str(payload.exportId),
    manifestHash: str(payload.manifestHash),
    corpusSha256: str(payload.corpusSha256),
    sizeBytes: Number(payload.sizeBytes) || 0,
    recordCount: Number(payload.recordCount) || 0,
  };
  const sameIdentity = (existing) => existing
    && stableStringify(Object.fromEntries(Object.keys(immutable).map((field) => [field, existing[field]]))) === stableStringify(immutable);
  const store = resolveDataStore({ env, fetchImpl, dataStore });
  try {
    const existingBytes = await store.getDeliveryReceipt({ tokenId: immutable.tokenId });
    const existing = JSON.parse(existingBytes.toString("utf8"));
    if (sameIdentity(existing)) return existing;
    throw new Error("dataset delivery receipt identity collision");
  } catch (error) {
    if (error?.code !== "dataset-delivery-missing") {
      if (/dataset delivery receipt identity collision/.test(str(error?.message))) throw error;
      if (!/Unexpected token|JSON/.test(str(error?.message))) throw error;
    }
  }
  const body = { ...immutable, deliveredAt: new Date().toISOString() };
  const record = { ...body, signature: deliverySignature(body, key) };
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  try {
    await store.putDeliveryReceipt({ tokenId: immutable.tokenId, bytes });
    return record;
  } catch (error) {
    if (error?.code !== "compute-data-storage-collision") throw error;
    const existing = JSON.parse((await store.getDeliveryReceipt({ tokenId: immutable.tokenId })).toString("utf8"));
    if (!sameIdentity(existing)) throw new Error("dataset delivery receipt identity collision");
    return existing;
  }
}

/** Resolve a token to a bounded file and stream that records full delivery. */
export async function openComputeDatasetDelivery(token, {
  env = process.env,
  now = () => Date.now(),
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {
  const verified = verifyComputeDatasetToken(token, { env, now });
  if (!verified.ok) return verified;
  const payload = verified.payload;
  let store;
  let opened;
  try {
    store = resolveDataStore({ env, fetchImpl, dataStore });
    opened = await store.openDataset({
      corpusSha256: payload.corpusSha256,
      sizeBytes: payload.sizeBytes,
    });
  } catch (error) {
    return failure(str(error?.code) || "dataset-file-missing", str(error?.message || "content-addressed dataset object is unavailable"));
  }
  const source = opened.stream;
  let completed = false;
  const stream = Readable.from((async function* deliver() {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      hash.update(buffer);
      yield buffer;
    }
    const observed = hash.digest("hex");
    if (bytes !== Number(payload.sizeBytes) || observed !== payload.corpusSha256) {
      throw new Error("dataset bytes changed during delivery");
    }
    completed = true;
    await writeDeliveryReceipt(payload, { env, fetchImpl, dataStore: store });
  })());
  stream.once("close", () => { if (!completed) source.destroy(); });
  return {
    ok: true,
    payload,
    stream,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-length": String(payload.sizeBytes),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-growthub-corpus-sha256": payload.corpusSha256,
    },
  };
}

/** Prove this exact run/work-spec corpus was fully served before import. */
export async function verifyComputeDatasetDelivery({
  evidence = null,
  workSpec = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {
  const tokenId = str(evidence?.tokenId);
  if (!tokenId) return failure("dataset-delivery-missing", "compute journal carries no dataset access identity");
  let receipt;
  try {
    const store = resolveDataStore({ env, fetchImpl, dataStore });
    receipt = JSON.parse((await store.getDeliveryReceipt({ tokenId })).toString("utf8"));
  } catch (error) {
    return failure(str(error?.code) || "dataset-delivery-missing", str(error?.message || "no completed dataset delivery receipt exists for this run"));
  }
  const { signature, ...body } = receipt || {};
  const key = resolveRootSigningKey(env);
  const expectedSignature = key ? deliverySignature(body, key) : "";
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  const suppliedBytes = Buffer.from(str(signature), "utf8");
  if (!key || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return failure("dataset-delivery-invalid", "dataset delivery receipt signature does not verify");
  }
  const expectedSha = str(workSpec?.dataset?.corpusSha256);
  if (str(body.trainingRunId) !== str(workSpec?.trainingRunId)
    || str(body.workSpecHash) !== str(workSpec?.workSpecHash)
    || str(body.exportId) !== str(workSpec?.dataset?.exportId)
    || str(body.manifestHash) !== str(evidence?.manifestHash)
    || str(body.corpusSha256) !== expectedSha
    || str(evidence?.corpusSha256) !== expectedSha) {
    return failure("dataset-delivery-mismatch", "dataset delivery receipt does not bind this training run, work spec, and corpus identity");
  }
  return { ok: true, receipt: body };
}
