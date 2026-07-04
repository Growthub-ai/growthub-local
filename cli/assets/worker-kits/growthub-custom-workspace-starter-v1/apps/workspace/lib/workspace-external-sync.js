/**
 * Governed external-table sync helpers (Supabase PostgREST V1) — PURE.
 *
 * No fetch, no fs, no React, no config writes, never throws. The
 * provider-scoped data route (app/api/workspace/add-ons/[providerId]/data)
 * executes the HTTP legs and the config write; THIS module owns everything
 * deterministic: OpenAPI table parsing, data-source object construction,
 * external-record ↔ row mapping, push/pull merge with conflict detection,
 * and the compact non-secret sync proof written to receipts.
 *
 * Sync state lives on the existing `data-source` object grammar:
 *   - row FK column `registryId` binds each object to the api-registry
 *     product row (the preset's built-in resolver-binding relation renders it)
 *   - object-level fields `externalTable`, `externalCorrelationKey`,
 *     `externalRegistryId` declare the binding; `lastSyncedAt`,
 *     `lastSyncStatus`, `lastSyncSummary`, `lastSyncReceiptId` stamp proof.
 * No new object type, no PATCH allowlist change, no secret ever enters a row.
 */

const RESERVED_SYNC_COLUMNS = new Set(["Name", "externalId", "lastSyncedAt", "registryId"]);
const MAX_SYNC_ROWS = 500;
const MAX_CELL_CHARS = 4000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic object id for a mirrored external table. */
function externalTableObjectId(providerId, table) {
  return `${slugify(providerId) || "provider"}-${slugify(table) || "table"}`;
}

/**
 * Parse the table inventory from a PostgREST root OpenAPI document
 * (GET {SUPABASE_URL}/rest/v1/ returns Swagger 2.0: definitions keyed by
 * table name, paths keyed by /{table}). Returns [{ name, columns[] }] —
 * bounded, deduped, rpc paths excluded. Never throws on garbage input.
 */
function parseOpenApiTables(payload) {
  if (!payload || typeof payload !== "object") return [];
  const tables = new Map();
  const definitions = payload.definitions && typeof payload.definitions === "object" ? payload.definitions : {};
  for (const [name, definition] of Object.entries(definitions)) {
    const table = clean(name);
    if (!table) continue;
    const properties = definition?.properties && typeof definition.properties === "object" ? definition.properties : {};
    tables.set(table, {
      name: table,
      columns: Object.keys(properties).map(clean).filter(Boolean).slice(0, 64),
    });
  }
  const paths = payload.paths && typeof payload.paths === "object" ? payload.paths : {};
  for (const rawPath of Object.keys(paths)) {
    const match = /^\/([^/{]+)$/.exec(clean(rawPath));
    if (!match) continue;
    const table = clean(match[1]);
    if (!table || table === "rpc" || tables.has(table)) continue;
    tables.set(table, { name: table, columns: [] });
  }
  return Array.from(tables.values()).slice(0, 200);
}

function cellValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.length > MAX_CELL_CHARS ? `${value.slice(0, MAX_CELL_CHARS)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const text = JSON.stringify(value);
    return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
  } catch {
    return String(value);
  }
}

function recordKey(record, correlationKey) {
  return clean(record?.[correlationKey] ?? record?.id ?? record?.Name ?? record?.name);
}

function rowKey(row, correlationKey) {
  return clean(row?.externalId ?? row?.[correlationKey] ?? row?.Name);
}

/** Map external records into governed data-source rows (bounded, refs only). */
function mapExternalRecordsToRows({ records, columns, correlationKey = "id", registryId = "", nowIso = "" }) {
  const list = Array.isArray(records) ? records.slice(0, MAX_SYNC_ROWS) : [];
  const columnList = Array.isArray(columns) ? columns : [];
  return list
    .map((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return null;
      const key = recordKey(record, correlationKey) || `record-${index + 1}`;
      const row = {
        Name: clean(record.name || record.title || record.label) || key,
        externalId: key,
      };
      for (const column of columnList) {
        if (RESERVED_SYNC_COLUMNS.has(column)) continue;
        if (record[column] !== undefined) row[column] = cellValue(record[column]);
      }
      if (registryId) row.registryId = registryId;
      if (nowIso) row.lastSyncedAt = nowIso;
      return row;
    })
    .filter(Boolean);
}

/**
 * Build (or rebuild) the governed data-source object mirroring one external
 * table. Existing rows/fieldSettings are preserved by the caller via merge —
 * this constructs the canonical shell.
 */
function buildExternalTableObject({ providerId, table, columns, integrationId, correlationKey = "id", label = "" }) {
  const tableName = clean(table);
  const objectColumns = ["Name", "externalId"];
  for (const column of Array.isArray(columns) ? columns : []) {
    const name = clean(column);
    if (name && !RESERVED_SYNC_COLUMNS.has(name) && !objectColumns.includes(name)) objectColumns.push(name);
  }
  objectColumns.push("registryId", "lastSyncedAt");
  return {
    id: externalTableObjectId(providerId, tableName),
    label: clean(label) || tableName,
    name: clean(label) || tableName,
    source: "Supabase",
    objectType: "data-source",
    icon: "Globe",
    columns: objectColumns,
    rows: [],
    binding: { mode: "manual", source: "Supabase" },
    relations: [],
    externalTable: tableName,
    externalCorrelationKey: clean(correlationKey) || "id",
    externalRegistryId: clean(integrationId),
  };
}

/** All governed objects bound to an external table (any data provider). */
function listExternalSyncObjects(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((object) => clean(object?.externalTable) && clean(object?.externalRegistryId));
}

/**
 * PULL merge: external records into the object's rows, keyed by the
 * correlation key. External values win (that is what "pull" means); rows
 * that exist only locally are kept and reported as localOnly; field-level
 * differences on matched rows are reported as conflicts resolved external.
 */
function mergeExternalIntoRows({ rows, records, columns, correlationKey = "id", registryId = "", nowIso = "" }) {
  const existingRows = Array.isArray(rows) ? rows : [];
  const externalRows = mapExternalRecordsToRows({ records, columns, correlationKey, registryId, nowIso });
  const byKey = new Map(externalRows.map((row) => [rowKey(row, correlationKey), row]));
  const seen = new Set();
  const conflicts = [];
  const merged = existingRows.map((row) => {
    const key = rowKey(row, correlationKey);
    const incoming = key ? byKey.get(key) : null;
    if (!incoming) return row;
    seen.add(key);
    for (const [field, value] of Object.entries(incoming)) {
      if (field === "lastSyncedAt" || field === "registryId") continue;
      if (row[field] !== undefined && clean(row[field]) !== clean(value)) {
        conflicts.push({ key, field, local: cellValue(row[field]), external: cellValue(value), resolution: "external" });
      }
    }
    return { ...row, ...incoming };
  });
  const added = externalRows.filter((row) => !seen.has(rowKey(row, correlationKey)));
  const localOnly = existingRows
    .map((row) => rowKey(row, correlationKey))
    .filter((key) => key && !byKey.has(key));
  return {
    rows: [...merged, ...added],
    added: added.length,
    updated: seen.size,
    localOnly,
    conflicts: conflicts.slice(0, 50),
  };
}

/**
 * PUSH mapping: object rows → external upsert records. Local values win.
 * Only real table columns travel (reserved workspace columns stripped);
 * the correlation key is restored from externalId so PostgREST
 * merge-duplicates upserts deterministically.
 */
function buildPushRecords({ rows, columns, correlationKey = "id" }) {
  const columnList = (Array.isArray(columns) ? columns : []).filter((c) => !RESERVED_SYNC_COLUMNS.has(clean(c)));
  const records = [];
  const skipped = [];
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, MAX_SYNC_ROWS)) {
    const key = rowKey(row, correlationKey);
    const record = {};
    for (const column of columnList) {
      if (row[column] !== undefined && row[column] !== "") record[column] = row[column];
    }
    if (!Object.keys(record).length) {
      skipped.push(clean(row?.Name) || "unnamed-row");
      continue;
    }
    if (key && correlationKey && record[correlationKey] === undefined) record[correlationKey] = key;
    records.push(record);
  }
  return { records, skipped };
}

/** Compact, secret-free sync proof for receipts + object stamps. */
function buildSyncProof({ action, table, pulled = 0, pushed = 0, added = 0, updated = 0, conflicts = [], localOnly = [], httpStatus = 0 }) {
  const parts = [`${action} ${clean(table)}`];
  if (httpStatus) parts.push(`HTTP ${httpStatus}`);
  if (pulled) parts.push(`${pulled} pulled`);
  if (pushed) parts.push(`${pushed} pushed`);
  if (added) parts.push(`${added} added`);
  if (updated) parts.push(`${updated} matched`);
  if (localOnly.length) parts.push(`${localOnly.length} local-only kept`);
  if (conflicts.length) parts.push(`${conflicts.length} field conflicts`);
  return parts.join(" · ");
}

/** Stamp the sync outcome onto the owning object (object-level, additive). */
function stampObjectSyncResult(object, { status, summary, syncedAt, receiptId, fingerprint }) {
  if (!object || typeof object !== "object") return object;
  return {
    ...object,
    lastSyncedAt: clean(syncedAt),
    lastSyncStatus: clean(status),
    lastSyncSummary: clean(summary).slice(0, 500),
    lastSyncReceiptId: clean(receiptId),
    // Optional drift anchor: only overwritten when the caller measured one,
    // so stamps from lanes that did not fetch external rows keep the prior
    // causation evidence intact.
    lastSyncFingerprint: fingerprint !== undefined ? clean(fingerprint) : clean(object.lastSyncFingerprint),
  };
}

/**
 * Order-insensitive fingerprint of external records over the correlation
 * key + full row content. Pure and dependency-free (djb2 over a stable
 * serialization) — a collision costs one redundant receipted pull, never
 * a missed governance step.
 */
function buildDriftFingerprint(records, correlationKey = "id") {
  const list = Array.isArray(records) ? records : [];
  const key = clean(correlationKey) || "id";
  const parts = list
    .map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return "";
      const entries = Object.keys(record)
        .sort()
        .map((field) => {
          const value = record[field];
          return `${field}=${clean(value && typeof value === "object" ? JSON.stringify(value) : value)}`;
        });
      return `${clean(record[key])}|${entries.join(",")}`;
    })
    .filter(Boolean)
    .sort();
  const text = parts.join("\n");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `v1:${list.length}:${hash.toString(16)}`;
}

const SYNC_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Causation-state freshness for an externally-bound object. Derivation is
 * evidence-ordered — every conclusion is justified by a `causeChain` entry
 * reading straight off the governed stamps (binding → sync stamp → receipt
 * → fingerprint comparison), so the state stays strong no matter which
 * external system (Supabase PostgREST, Realtime-notified pulls, any future
 * data provider) holds the records:
 *
 *   unbound      → object declares no external binding
 *   never-synced → bound but no governed sync has stamped it
 *   drifted      → measured external fingerprint ≠ stamped fingerprint
 *   conflict     → last governed merge reported field conflicts
 *   stale        → last sync older than staleAfterMs (advisory; needs `now`)
 *   synced       → binding + stamp + no contrary evidence
 *
 * Garbage-safe: any malformed object degrades to "unbound", never throws.
 */
function deriveExternalSyncFreshness(object, { now = "", externalFingerprint = "", staleAfterMs = SYNC_STALE_AFTER_MS } = {}) {
  const causeChain = [];
  const boundTable = clean(object?.externalTable);
  const registryId = clean(object?.externalRegistryId);
  const base = {
    boundTable,
    registryId,
    lastSyncedAt: clean(object?.lastSyncedAt),
    lastSyncStatus: clean(object?.lastSyncStatus),
    receiptId: clean(object?.lastSyncReceiptId),
    ageMs: null,
    causeChain,
  };
  if (!boundTable || !registryId) {
    causeChain.push("no external binding declared on the object");
    return { ...base, state: "unbound" };
  }
  causeChain.push(`bound to external table "${boundTable}" via registry row ${registryId}`);
  if (!base.lastSyncedAt) {
    causeChain.push("no governed sync stamp — never pulled or pushed");
    return { ...base, state: "never-synced" };
  }
  causeChain.push(`last governed ${base.lastSyncStatus || "sync"} at ${base.lastSyncedAt}${base.receiptId ? ` (receipt ${base.receiptId})` : ""}`);
  const stampedFingerprint = clean(object?.lastSyncFingerprint);
  const measured = clean(externalFingerprint);
  if (measured && stampedFingerprint && measured !== stampedFingerprint) {
    causeChain.push(`external fingerprint ${measured} ≠ stamped ${stampedFingerprint} — external side changed since the last sync`);
    return { ...base, state: "drifted" };
  }
  if (measured && !stampedFingerprint) {
    causeChain.push("external fingerprint measured but no stamped anchor — one governed pull re-anchors it");
    return { ...base, state: "drifted" };
  }
  if (measured && stampedFingerprint) {
    causeChain.push("external fingerprint matches the stamped anchor");
  }
  const conflictMatch = /(\d+) field conflicts/.exec(clean(object?.lastSyncSummary));
  if (conflictMatch && Number(conflictMatch[1]) > 0) {
    causeChain.push(`last merge reported ${conflictMatch[1]} field conflict(s) — resolution followed the action direction`);
    return { ...base, state: "conflict" };
  }
  if (clean(now)) {
    const ageMs = Date.parse(clean(now)) - Date.parse(base.lastSyncedAt);
    if (Number.isFinite(ageMs)) {
      base.ageMs = ageMs;
      if (ageMs > staleAfterMs) {
        causeChain.push(`sync age ${Math.round(ageMs / 1000)}s exceeds ${Math.round(staleAfterMs / 1000)}s — advisory staleness`);
        return { ...base, state: "stale" };
      }
    }
  }
  causeChain.push("binding, stamp, and receipts agree — synced");
  return { ...base, state: "synced" };
}

/** Replace (or insert) one object in the config's dataModel — pure merge. */
function withExternalSyncObject(workspaceConfig, nextObject) {
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

export {
  MAX_SYNC_ROWS,
  SYNC_STALE_AFTER_MS,
  buildDriftFingerprint,
  buildExternalTableObject,
  buildPushRecords,
  buildSyncProof,
  deriveExternalSyncFreshness,
  externalTableObjectId,
  listExternalSyncObjects,
  mapExternalRecordsToRows,
  mergeExternalIntoRows,
  parseOpenApiTables,
  stampObjectSyncResult,
  withExternalSyncObject,
};
