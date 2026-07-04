/**
 * Governed Supabase Storage bucket helpers (Global CDN product) — PURE.
 *
 * No fetch, no fs, no React, no config writes, never throws. The
 * provider-scoped storage route
 * (app/api/workspace/add-ons/[providerId]/storage) executes the Supabase
 * Storage HTTP legs and the config write; THIS module owns everything
 * deterministic: bucket-inventory parsing, the governed buckets object +
 * per-bucket row construction, the create-bucket request validation
 * (deterministic clean setup), the CDN URL derivation, and the compact
 * non-secret proof written to receipts.
 *
 * Second product on the Supabase provider (mirror of the Upstash provider's
 * multi-product shape): the same account credentials + the same governed
 * api-registry row pattern, a distinct execution lane ("workspace-storage"),
 * and a distinct governed object. Buckets are stored on the SAME data-source
 * object grammar the PostgREST product uses, so the Data Model renders them
 * with no new object type:
 *   - object-level `storageProduct`, `storageRegistryId`, and
 *     `linkedTableObjectId` / `linkedTableLabel` declare the binding and the
 *     1:1 correlation to the existing governed data table
 *   - each row is one bucket: name, id, public/private access, MIME allowlist,
 *     size limit, CDN base URL, and the linked-table reference column
 * No secret ever enters a row; rows carry the linked object id + env-ref
 * names only.
 */

const MAX_BUCKETS = 200;
const MAX_MIME_TYPES = 40;
const DEFAULT_FILE_SIZE_LIMIT = "50MB";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic id for the governed buckets object of a provider. */
function bucketsObjectId(providerId) {
  return `${slugify(providerId) || "provider"}-buckets`;
}

/**
 * Supabase bucket names: lowercase letters, digits, and single separators
 * (`-`, `_`, `.`), 3–63 chars, no leading/trailing separator. Deterministic
 * normalization so the user's 1:1 mental model ("My Uploads" → "my-uploads")
 * is stable and collision-free. Returns "" when it cannot produce a valid id.
 */
function normalizeBucketName(name) {
  const base = clean(name).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[._-]+|[._-]+$/g, "");
  if (base.length < 3 || base.length > 63) return base.length ? base.slice(0, 63).replace(/[._-]+$/g, "") : "";
  return base;
}

const ACCESS_MODES = new Set(["public", "private"]);

/**
 * Validate and canonicalize a create-bucket request. Deterministic clean
 * setup: a valid name, an explicit access mode (default private — least
 * privilege), a bounded MIME allowlist, and a parseable size limit. Returns
 * { ok, request?, error? } — the route sends `request` verbatim to Supabase.
 */
function validateBucketRequest(input = {}) {
  const name = normalizeBucketName(input.name);
  if (!name || name.length < 3 || name.length > 63) {
    return { ok: false, error: "bucket name must be 3–63 chars of lowercase letters, digits, or - _ ." };
  }
  const accessRaw = clean(input.access || (input.public ? "public" : "private")).toLowerCase();
  const access = ACCESS_MODES.has(accessRaw) ? accessRaw : "private";
  const allowedMimeTypes = Array.isArray(input.allowedMimeTypes)
    ? input.allowedMimeTypes.map(clean).filter(Boolean).slice(0, MAX_MIME_TYPES)
    : clean(input.allowedMimeTypes)
      ? clean(input.allowedMimeTypes).split(",").map(clean).filter(Boolean).slice(0, MAX_MIME_TYPES)
      : [];
  for (const mime of allowedMimeTypes) {
    // Accept concrete types (image/png) and wildcards (image/*).
    if (!/^[a-z0-9.+-]+\/(\*|[a-z0-9.+-]+)$/i.test(mime)) {
      return { ok: false, error: `invalid MIME type "${mime}" — expected e.g. image/png or image/*` };
    }
  }
  const fileSizeLimit = clean(input.fileSizeLimit) || DEFAULT_FILE_SIZE_LIMIT;
  if (!/^\d+\s*(b|kb|mb|gb)?$/i.test(fileSizeLimit) && !/^\d+$/.test(fileSizeLimit)) {
    return { ok: false, error: `invalid file size limit "${fileSizeLimit}" — expected e.g. 50MB or 5242880` };
  }
  return {
    ok: true,
    request: {
      // Supabase Storage create-bucket payload (POST /storage/v1/bucket).
      id: name,
      name,
      public: access === "public",
      ...(allowedMimeTypes.length ? { allowed_mime_types: allowedMimeTypes } : {}),
      file_size_limit: fileSizeLimit,
    },
    access,
  };
}

/**
 * Public CDN base URL for a bucket object. Supabase serves public objects at
 * {SUPABASE_URL}/storage/v1/object/public/{bucket}. Private buckets have no
 * anonymous CDN URL — access is via signed URLs — so we return "".
 */
function bucketCdnBaseUrl(baseUrl, bucketId, isPublic) {
  const host = clean(baseUrl).replace(/\/+$/, "");
  if (!host || !clean(bucketId) || !isPublic) return "";
  return `${host}/storage/v1/object/public/${clean(bucketId)}`;
}

/** Parse Supabase Storage GET /storage/v1/bucket → [{ id, name, public, ... }]. */
function parseBucketInventory(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((bucket) => {
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return null;
      const id = clean(bucket.id || bucket.name);
      if (!id) return null;
      return {
        id,
        name: clean(bucket.name) || id,
        public: Boolean(bucket.public),
        allowedMimeTypes: Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types.map(clean).filter(Boolean) : [],
        fileSizeLimit: clean(bucket.file_size_limit),
        createdAt: clean(bucket.created_at),
        updatedAt: clean(bucket.updated_at),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_BUCKETS);
}

const BUCKET_COLUMNS = [
  "Name",
  "bucketId",
  "access",
  "allowedMimeTypes",
  "fileSizeLimit",
  "cdnUrl",
  "linkedRecordRef",
  "linkedTable",
  "registryId",
  "status",
  "createdAt",
  "lastResponse",
];

/** One governed row per bucket — refs and metadata only, never a secret. */
function buildBucketRow(bucket, { baseUrl = "", registryId = "", linkedTableObjectId = "", linkedRecordRef = "", nowIso = "" } = {}) {
  const id = clean(bucket?.id || bucket?.name);
  if (!id) return null;
  const isPublic = Boolean(bucket?.public);
  return {
    Name: clean(bucket?.name) || id,
    bucketId: id,
    access: isPublic ? "public" : "private",
    allowedMimeTypes: Array.isArray(bucket?.allowedMimeTypes) ? bucket.allowedMimeTypes.join(",") : clean(bucket?.allowedMimeTypes),
    fileSizeLimit: clean(bucket?.fileSizeLimit) || DEFAULT_FILE_SIZE_LIMIT,
    cdnUrl: bucketCdnBaseUrl(baseUrl, id, isPublic),
    // 1:1 correlation to the existing governed data table (object id + the
    // per-record reference the user maps files to).
    linkedRecordRef: clean(linkedRecordRef),
    linkedTable: clean(linkedTableObjectId),
    registryId: clean(registryId),
    status: "live",
    createdAt: clean(bucket?.createdAt) || clean(nowIso),
    lastResponse: `Bucket ${id} (${isPublic ? "public CDN" : "private"}) ready.`,
  };
}

/**
 * Build (or rebuild) the governed buckets object shell. The caller merges
 * rows; this constructs the canonical data-source object with the built-in
 * resolver-binding relation to api-registry PLUS a bucket-source relation to
 * the linked data table (the 1:1 correlation the user reasons about).
 */
function buildBucketsObject({ providerId, integrationId, linkedTableObjectId = "", linkedTableLabel = "", label = "" }) {
  const id = bucketsObjectId(providerId);
  return {
    id,
    label: clean(label) || "Supabase Storage Buckets",
    name: clean(label) || "Supabase Storage Buckets",
    source: "Supabase Storage",
    objectType: "data-source",
    icon: "Database",
    columns: BUCKET_COLUMNS.slice(),
    rows: [],
    // Dynamic governed integration binding — the buckets object is resolved
    // through its api-registry product row (integrationId), on the data-source
    // routing lane. This is the gating primitive: the storage product row must
    // exist + verify for this binding to resolve, exactly like the PostgREST
    // data-source objects. NOT a manual binding.
    binding: {
      mode: "integration",
      lane: "data-source",
      integrationId: clean(integrationId),
      source: "Supabase Storage",
      entityType: "bucket",
      provider: "supabase",
    },
    // Product + lane binding (mirrors externalRegistryId on the sync object).
    storageProduct: clean(integrationId),
    storageRegistryId: clean(integrationId),
    linkedTableObjectId: clean(linkedTableObjectId),
    linkedTableLabel: clean(linkedTableLabel),
    relations: [
      {
        id: "resolver-binding",
        name: "Resolver",
        field: "registryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        valueField: "integrationId",
        labelField: "Name",
        searchable: true,
        pageSize: 25,
      },
      {
        id: "bucket-linked-table",
        name: "Linked table",
        field: "linkedTable",
        targetObjectType: "data-source",
        targetObjectId: clean(linkedTableObjectId),
        type: "belongs-to",
        valueField: "id",
        labelField: "Name",
        description: "The governed data table each bucket's files correlate to (1:1 mental model).",
        searchable: true,
        pageSize: 25,
      },
    ],
  };
}

/** Merge live bucket inventory into the governed object's rows (by bucketId). */
function mergeBucketsIntoRows({ rows = [], buckets = [], baseUrl = "", registryId = "", linkedTableObjectId = "", nowIso = "" }) {
  const existing = new Map((Array.isArray(rows) ? rows : []).map((row) => [clean(row?.bucketId || row?.Name), row]));
  const merged = [];
  let added = 0;
  let updated = 0;
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    const built = buildBucketRow(bucket, { baseUrl, registryId, linkedTableObjectId, nowIso });
    if (!built) continue;
    const prior = existing.get(built.bucketId);
    if (prior) {
      updated += 1;
      // Preserve the per-record linked reference the user set locally.
      merged.push({ ...prior, ...built, linkedRecordRef: clean(prior.linkedRecordRef) || built.linkedRecordRef });
      existing.delete(built.bucketId);
    } else {
      added += 1;
      merged.push(built);
    }
  }
  // Rows for buckets that no longer exist externally are dropped (the live
  // inventory is authoritative for existence); their governance history lives
  // in receipts.
  const removed = existing.size;
  return { rows: merged.slice(0, MAX_BUCKETS), added, updated, removed };
}

/** Compact, secret-free proof string for the receipt ledger. */
function buildBucketProof({ action, bucket = "", count = null, httpStatus = 0, access = "" }) {
  const parts = [`${clean(action)}${bucket ? ` ${clean(bucket)}` : ""}`];
  if (httpStatus) parts.push(`HTTP ${httpStatus}`);
  if (access) parts.push(access);
  if (count != null) parts.push(`${count} bucket${count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Replace (or insert) the buckets object in the config — pure merge. */
function withBucketsObject(workspaceConfig, nextObject) {
  const targetId = clean(nextObject?.id);
  if (!targetId) return { config: workspaceConfig, replaced: false };
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let replaced = false;
  const nextObjects = objects.map((object) => {
    if (clean(object?.id) !== targetId) return object;
    replaced = true;
    return nextObject;
  });
  if (!replaced) nextObjects.push(nextObject);
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, replaced };
}

/** The governed buckets object for a provider, or null. */
function findBucketsObject(workspaceConfig, providerId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const id = bucketsObjectId(providerId);
  return objects.find((object) => clean(object?.id) === id) || null;
}

/** Governed data-source tables eligible to link a bucket product to. */
function listLinkableTables(workspaceConfig, { excludeId = "" } = {}) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects
    .filter((object) => clean(object?.objectType) === "data-source" && clean(object?.id) !== clean(excludeId) && !clean(object?.storageProduct))
    .map((object) => ({ objectId: clean(object.id), label: clean(object.label || object.name), externalTable: clean(object.externalTable) }));
}

/**
 * Causation-state for the storage product, evidence-ordered like the sync
 * freshness deriver. The install/creation gate reads straight off governed
 * state — provider connect and a linkable table are hard prerequisites:
 *
 *   provider-required → the Supabase provider row is not connected/verified
 *   link-required     → connected, but no data table is linked yet
 *   ready             → connected + linked; buckets can be created
 *   active            → ready + at least one governed bucket exists
 *
 * Garbage-safe. `providerConnected` and `linkableCount` come from the caller
 * (add-ons state + listLinkableTables) so this stays pure.
 */
function deriveBucketProductState(workspaceConfig, providerId, { providerConnected = false, linkableCount = 0 } = {}) {
  const causeChain = [];
  if (!providerConnected) {
    causeChain.push("Supabase provider account is not connected/verified");
    return { state: "provider-required", causeChain, bucketCount: 0, linked: false };
  }
  causeChain.push("Supabase provider account connected + verified");
  const object = findBucketsObject(workspaceConfig, providerId);
  const linkedTableObjectId = clean(object?.linkedTableObjectId);
  if (!linkedTableObjectId) {
    if (!linkableCount) {
      causeChain.push("no governed data table exists to link — install the Postgres product and mirror a table first");
    } else {
      causeChain.push(`${linkableCount} governed table(s) available to link — pick one to enable bucket creation`);
    }
    return { state: "link-required", causeChain, bucketCount: 0, linked: false, linkableCount };
  }
  causeChain.push(`linked to governed table ${linkedTableObjectId} (${clean(object?.linkedTableLabel) || "table"})`);
  const bucketCount = Array.isArray(object?.rows) ? object.rows.length : 0;
  if (!bucketCount) {
    causeChain.push("linked and ready — no buckets created yet");
    return { state: "ready", causeChain, bucketCount: 0, linked: true, linkedTableObjectId };
  }
  causeChain.push(`${bucketCount} governed bucket(s) live`);
  return { state: "active", causeChain, bucketCount, linked: true, linkedTableObjectId };
}

export {
  MAX_BUCKETS,
  MAX_MIME_TYPES,
  DEFAULT_FILE_SIZE_LIMIT,
  BUCKET_COLUMNS,
  bucketsObjectId,
  normalizeBucketName,
  validateBucketRequest,
  bucketCdnBaseUrl,
  parseBucketInventory,
  buildBucketRow,
  buildBucketsObject,
  mergeBucketsIntoRows,
  buildBucketProof,
  withBucketsObject,
  findBucketsObject,
  listLinkableTables,
  deriveBucketProductState,
};
