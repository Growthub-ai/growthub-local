/**
 * Durable storage boundary for governed remote-compute corpus bytes and
 * delivery receipts.
 *
 * Local/writable workspaces use an atomic filesystem store. Production
 * serverless/read-only deployments must use a durable object store; the
 * shipped provider-neutral implementation reuses the existing Supabase
 * Storage account contract (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *
 * Service-role values are resolved only inside this server module and never
 * enter receipts, dataset grants, errors, or adapter context.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const COMPUTE_DATA_BACKEND_ENV = "GROWTHUB_COMPUTE_DATA_BACKEND";
export const COMPUTE_DATA_ROOT_ENV = "GROWTHUB_COMPUTE_DATA_ROOT";
export const COMPUTE_STORAGE_BUCKET_ENV = "GROWTHUB_COMPUTE_STORAGE_BUCKET";
export const ALLOW_EPHEMERAL_COMPUTE_DATA_ENV = "GROWTHUB_ALLOW_EPHEMERAL_COMPUTE_DATA";
export const DEFAULT_COMPUTE_STORAGE_BUCKET = "growthub-compute";

function str(value) {
  return String(value ?? "").trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function deploymentIsEphemeral(env = process.env) {
  const target = str(env?.GROWTHUB_WORKSPACE_DEPLOY_TARGET || env?.AGENCY_PORTAL_DEPLOY_TARGET).toLowerCase();
  return str(env?.VERCEL) === "1"
    || str(env?.NETLIFY) === "true"
    || ["vercel", "netlify", "read-only"].includes(target);
}

function production(env = process.env) {
  return str(env?.NODE_ENV).toLowerCase() === "production";
}

function localDataRoot(env = process.env) {
  return path.resolve(str(env?.[COMPUTE_DATA_ROOT_ENV]) || path.join(process.cwd(), ".growthub", "compute-data"));
}

function safeSegment(value, field) {
  const segment = str(value);
  if (!segment || !/^[A-Za-z0-9._-]+$/.test(segment)) {
    throw codedError("compute-data-key-invalid", `${field} contains unsupported characters`);
  }
  return segment;
}

function datasetObjectKey(corpusSha256) {
  const digest = safeSegment(corpusSha256, "corpusSha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw codedError("compute-data-key-invalid", "corpusSha256 must be a 64-character SHA-256 digest");
  return `datasets/${digest}.jsonl`;
}

function receiptObjectKey(tokenId) {
  return `deliveries/${safeSegment(tokenId, "tokenId")}.json`;
}

async function atomicWrite(targetPath, bytes) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes, { mode: 0o600, flag: "wx" });
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => {});
  }
}

async function readBoundedWebStream(stream, maxBytes) {
  if (!stream) throw codedError("compute-data-read-failed", "object response carried no body");
  const chunks = [];
  let total = 0;
  const source = typeof stream.getReader === "function" && typeof Readable.fromWeb === "function"
    ? Readable.fromWeb(stream)
    : stream;
  for await (const chunk of source) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) throw codedError("compute-data-too-large", `object exceeds the ${maxBytes}-byte verification ceiling`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function filesystemStore(env = process.env) {
  const root = localDataRoot(env);
  const absolute = (objectKey) => path.join(root, ...objectKey.split("/"));

  async function putImmutable(objectKey, bytes, expectedSha256 = "") {
    const target = absolute(objectKey);
    let existing = null;
    try { existing = await fs.readFile(target); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (existing) {
      if (expectedSha256 && sha256(existing) !== expectedSha256) {
        throw codedError("compute-data-storage-collision", "existing content-addressed object does not match its expected digest");
      }
      if (!expectedSha256 && !existing.equals(bytes)) {
        throw codedError("compute-data-storage-collision", "existing immutable object has different bytes");
      }
      return { created: false, objectKey, sizeBytes: existing.byteLength };
    }
    try {
      await atomicWrite(target, bytes);
      return { created: true, objectKey, sizeBytes: bytes.byteLength };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      existing = await fs.readFile(target);
      if ((expectedSha256 && sha256(existing) !== expectedSha256) || (!expectedSha256 && !existing.equals(bytes))) {
        throw codedError("compute-data-storage-collision", "concurrent immutable object write produced different bytes");
      }
      return { created: false, objectKey, sizeBytes: existing.byteLength };
    }
  }

  return {
    kind: "filesystem",
    durable: !deploymentIsEphemeral(env),
    root,
    async putDataset({ corpusSha256, bytes }) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (sha256(buffer) !== str(corpusSha256).toLowerCase()) {
        throw codedError("compute-data-digest-mismatch", "dataset bytes do not match corpusSha256");
      }
      return putImmutable(datasetObjectKey(corpusSha256), buffer, str(corpusSha256).toLowerCase());
    },
    async openDataset({ corpusSha256, sizeBytes }) {
      const objectKey = datasetObjectKey(corpusSha256);
      const target = absolute(objectKey);
      let stat;
      try { stat = await fs.lstat(target); } catch {
        throw codedError("dataset-file-missing", "content-addressed dataset object is unavailable");
      }
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw codedError("dataset-file-invalid", "content-addressed dataset object is not a regular file");
      }
      if (Number(sizeBytes) >= 0 && stat.size !== Number(sizeBytes)) {
        throw codedError("dataset-file-invalid", "content-addressed dataset object size does not match the signed grant");
      }
      return { objectKey, sizeBytes: stat.size, stream: createReadStream(target) };
    },
    async putDeliveryReceipt({ tokenId, bytes }) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      return putImmutable(receiptObjectKey(tokenId), buffer);
    },
    async getDeliveryReceipt({ tokenId, maxBytes = 128 * 1024 }) {
      const target = absolute(receiptObjectKey(tokenId));
      let bytes;
      try { bytes = await fs.readFile(target); } catch {
        throw codedError("dataset-delivery-missing", "no completed dataset delivery receipt exists for this run");
      }
      if (bytes.byteLength > maxBytes) throw codedError("dataset-delivery-invalid", "dataset delivery receipt exceeds its size ceiling");
      return bytes;
    },
  };
}

function normalizeSupabaseUrl(value, env = process.env) {
  let url;
  try { url = new URL(str(value)); } catch {
    throw codedError("compute-data-store-invalid", "SUPABASE_URL is not a valid absolute URL");
  }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    throw codedError("compute-data-store-invalid", "SUPABASE_URL must be credential-free HTTP(S)");
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (production(env) && url.protocol !== "https:" && !loopback) {
    throw codedError("compute-data-store-invalid", "production Supabase Storage requires HTTPS");
  }
  return url.toString().replace(/\/+$/, "");
}

function encodedObjectPath(objectKey) {
  return objectKey.split("/").map((segment) => encodeURIComponent(safeSegment(segment, "object path"))).join("/");
}

function supabaseStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw codedError("compute-data-store-unavailable", "fetch implementation unavailable for Supabase Storage");
  const baseUrl = normalizeSupabaseUrl(env?.SUPABASE_URL, env);
  const serviceRole = str(env?.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRole) throw codedError("compute-data-store-unavailable", "SUPABASE_SERVICE_ROLE_KEY is required for durable compute data storage");
  const bucket = safeSegment(env?.[COMPUTE_STORAGE_BUCKET_ENV] || DEFAULT_COMPUTE_STORAGE_BUCKET, COMPUTE_STORAGE_BUCKET_ENV);
  const authHeaders = (extra = {}) => ({
    authorization: `Bearer ${serviceRole}`,
    apikey: serviceRole,
    "cache-control": "no-store",
    ...extra,
  });
  const objectUrl = (objectKey) => `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(objectKey)}`;
  const authenticatedObjectUrl = (objectKey) => `${baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedObjectPath(objectKey)}`;

  async function responseDetail(response) {
    const text = await response.text().catch(() => "");
    return text.slice(0, 240).replace(serviceRole, "[redacted]");
  }

  async function getBytes(objectKey, maxBytes) {
    const response = await fetchImpl(authenticatedObjectUrl(objectKey), {
      method: "GET",
      headers: authHeaders({ accept: "application/octet-stream" }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = codedError(response.status === 404 ? "compute-data-object-missing" : "compute-data-read-failed", `Supabase Storage read failed (HTTP ${response.status}): ${await responseDetail(response)}`);
      error.status = response.status;
      throw error;
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) throw codedError("compute-data-too-large", `object exceeds the ${maxBytes}-byte verification ceiling`);
    return readBoundedWebStream(response.body, maxBytes);
  }

  async function putImmutable(objectKey, bytes, { contentType, expectedSha256 = "" } = {}) {
    const response = await fetchImpl(objectUrl(objectKey), {
      method: "POST",
      headers: authHeaders({
        "content-type": contentType,
        "x-upsert": "false",
      }),
      body: bytes,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return { created: true, objectKey, sizeBytes: bytes.byteLength };
    if (![400, 409].includes(response.status)) {
      const error = codedError("compute-data-write-failed", `Supabase Storage write failed (HTTP ${response.status}): ${await responseDetail(response)}`);
      error.status = response.status;
      throw error;
    }
    const existing = await getBytes(objectKey, Math.max(bytes.byteLength, 128 * 1024));
    if ((expectedSha256 && sha256(existing) !== expectedSha256) || (!expectedSha256 && !existing.equals(bytes))) {
      throw codedError("compute-data-storage-collision", "existing immutable Supabase object has different bytes");
    }
    return { created: false, objectKey, sizeBytes: existing.byteLength };
  }

  return {
    kind: "supabase-storage",
    durable: true,
    bucket,
    async putDataset({ corpusSha256, bytes }) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const digest = str(corpusSha256).toLowerCase();
      if (sha256(buffer) !== digest) throw codedError("compute-data-digest-mismatch", "dataset bytes do not match corpusSha256");
      return putImmutable(datasetObjectKey(digest), buffer, { contentType: "application/x-ndjson; charset=utf-8", expectedSha256: digest });
    },
    async openDataset({ corpusSha256, sizeBytes }) {
      const objectKey = datasetObjectKey(corpusSha256);
      const response = await fetchImpl(authenticatedObjectUrl(objectKey), {
        method: "GET",
        headers: authHeaders({ accept: "application/x-ndjson" }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = codedError(response.status === 404 ? "dataset-file-missing" : "compute-data-read-failed", `Supabase Storage dataset read failed (HTTP ${response.status}): ${await responseDetail(response)}`);
        error.status = response.status;
        throw error;
      }
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length !== Number(sizeBytes)) {
        throw codedError("dataset-file-invalid", "durable dataset object size does not match the signed grant");
      }
      const stream = response.body && typeof Readable.fromWeb === "function" ? Readable.fromWeb(response.body) : response.body;
      if (!stream) throw codedError("dataset-file-missing", "durable dataset object returned no body");
      return { objectKey, sizeBytes: Number.isFinite(length) ? length : Number(sizeBytes), stream };
    },
    async putDeliveryReceipt({ tokenId, bytes }) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      return putImmutable(receiptObjectKey(tokenId), buffer, { contentType: "application/json; charset=utf-8" });
    },
    async getDeliveryReceipt({ tokenId, maxBytes = 128 * 1024 }) {
      try {
        return await getBytes(receiptObjectKey(tokenId), maxBytes);
      } catch (error) {
        if (error?.code === "compute-data-object-missing") {
          throw codedError("dataset-delivery-missing", "no completed dataset delivery receipt exists for this run");
        }
        throw error;
      }
    },
  };
}

/**
 * Resolve the storage backend once at the server boundary.
 *
 * auto:
 * - Supabase Storage when the existing account env contract is configured.
 * - atomic filesystem for writable/local operation.
 * - hard refusal on ephemeral production hosts without durable storage.
 */
export function resolveComputeDataStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const requested = str(env?.[COMPUTE_DATA_BACKEND_ENV] || "auto").toLowerCase();
  if (!["auto", "filesystem", "supabase-storage"].includes(requested)) {
    throw codedError("compute-data-store-invalid", `${COMPUTE_DATA_BACKEND_ENV} must be auto, filesystem, or supabase-storage`);
  }
  const supabaseConfigured = Boolean(str(env?.SUPABASE_URL) && str(env?.SUPABASE_SERVICE_ROLE_KEY));
  if (requested === "supabase-storage" || (requested === "auto" && supabaseConfigured)) {
    return supabaseStore({ env, fetchImpl });
  }
  const ephemeralProduction = production(env) && deploymentIsEphemeral(env);
  const explicitlyAllowed = str(env?.[ALLOW_EPHEMERAL_COMPUTE_DATA_ENV]).toLowerCase() === "true";
  if (ephemeralProduction && !explicitlyAllowed) {
    throw codedError(
      "durable-compute-data-store-required",
      `remote production compute requires durable object storage; configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or set ${COMPUTE_DATA_BACKEND_ENV}=supabase-storage`,
    );
  }
  return filesystemStore(env);
}
