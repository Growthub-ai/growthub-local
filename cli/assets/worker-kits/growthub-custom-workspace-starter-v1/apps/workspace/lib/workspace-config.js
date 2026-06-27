/**
 * Workspace persistence — thin adapter boundary.
 *
 * Modes (Workspace Builder Runtime V1 contract — `docs/WORKSPACE_BUILDER_RUNTIME_V1.md`):
 *
 *   - `filesystem`    Local Next.js dev or any runtime that opts in via
 *                     `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`. Save writes
 *                     `growthub.config.json` on disk.
 *   - `read-only`     Vercel / Netlify-style runtimes where the bundle is
 *                     immutable. `PATCH /api/workspace` returns 409 with the
 *                     same `guidance` string the no-code Save UI surfaces.
 *   - `database`      Postgres-compatible hosted persistence. Supabase is
 *                     used through DATABASE_URL (or POSTGRES_URL, etc.) behind
 *                     the postgres adapter, without adding a provider SDK.
 *
 * `describePersistenceMode()` is the single source of truth the GET payload,
 * the no-code Settings/Readiness panel, and the PATCH 409 path all read.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  validateWorkspaceConfig
} from "@/lib/workspace-schema";

const PERSISTENCE_ADAPTERS = Object.freeze({
  FILESYSTEM: "filesystem",
  READ_ONLY: "read-only",
  DATABASE: "database"
});

const READ_ONLY_GUIDANCE =
  "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime.";

const WORKSPACE_CONFIG_TABLE = "growthub_workspace_configs";
const DEFAULT_WORKSPACE_OWNER = "local-workspace";

function stripSandboxRowViewMetadata(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const { views: _views, activeViewId: _activeViewId, fieldSettings: _fieldSettings, ...rest } = row;
  return rest;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Drop deprecated top-level keys so the only persistence surface is `dataModel` inside `config`. */
function normalizeConfigForPersistence(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const {
    workspaceSourceRecords: _removedWorkspaceSourceRecords,
    auxiliarySourceRecords: _removedAuxiliarySourceRecords,
    ...rest
  } = config;
  return rest;
}

function mapAllWidgetsInWorkspaceConfig(config, mapWidget) {
  let next = { ...config };
  if (Array.isArray(next.dashboards)) {
    next.dashboards = next.dashboards.map((dash) => ({
      ...dash,
      tabs: (dash.tabs || []).map((tab) => ({
        ...tab,
        widgets: (tab.widgets || []).map(mapWidget)
      }))
    }));
  }
  if (next.canvas) {
    const canvas = { ...next.canvas };
    if (Array.isArray(canvas.widgets)) canvas.widgets = canvas.widgets.map(mapWidget);
    if (Array.isArray(canvas.tabs)) {
      canvas.tabs = canvas.tabs.map((tab) => ({
        ...tab,
        widgets: (tab.widgets || []).map(mapWidget)
      }));
    }
    next = { ...next, canvas };
  }
  return next;
}

/** Keep widget bindings aligned with the governed data model row store (same JSONB row). */
function syncWidgetsToLiveObjectRows(config, objectId, rows, fetchedAt) {
  const pid = String(objectId).trim();
  return mapAllWidgetsInWorkspaceConfig(config, (widget) => {
    const b = widget?.config?.binding;
    if (!b || b.sourceType !== "workspace-data-model") return widget;
    const oid = typeof b.objectId === "string" ? b.objectId.trim() : "";
    if (oid !== pid) return widget;
    const nextBinding = { ...b, lastFetchedAt: fetchedAt, recordCount: rows.length };
    if ("rowSource" in nextBinding) delete nextBinding.rowSource;
    const base = { ...widget, config: { ...(widget.config || {}), binding: nextBinding } };
    if (widget.kind === "view") {
      return { ...base, config: { ...base.config, rows: [...rows] } };
    }
    return base;
  });
}

function resolveWorkspaceDatabaseUrl() {
  const keys = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_DATABASE_URL",
    "AGENCY_PORTAL_DATABASE_URL",
    "GROWTHUB_WORKSPACE_DATABASE_URL"
  ];
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function bundleFromLiveDataModelObject(o) {
  if (!o) return null;
  const rows = Array.isArray(o.rows) ? o.rows : [];
  return {
    records: rows,
    integrationId: o.binding?.integrationId ?? null,
    fetchedAt: o.binding?.lastFetchedAt ?? null,
    recordCount: typeof o.binding?.recordCount === "number" ? o.binding.recordCount : rows.length
  };
}

function auxiliarySourceRecordsFromConfig(config) {
  return config &&
    config.auxiliarySourceRecords &&
    typeof config.auxiliarySourceRecords === "object" &&
    !Array.isArray(config.auxiliarySourceRecords)
    ? cloneJson(config.auxiliarySourceRecords)
    : {};
}

function withAuxiliarySourceRecords(nextConfig, rawBasis) {
  const auxiliarySourceRecords = auxiliarySourceRecordsFromConfig(rawBasis);
  return Object.keys(auxiliarySourceRecords).length > 0
    ? { ...nextConfig, auxiliarySourceRecords }
    : nextConfig;
}

function resolveWorkspaceConfigPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "growthub.config.json");
}

async function readWorkspaceConfig() {
  if (shouldUseDatabasePersistence()) {
    return readDatabaseWorkspaceConfig();
  }
  const configPath = resolveWorkspaceConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  let c = JSON.parse(raw);
  if (c.dataModel) c.dataModel = healDataModelObjects(c.dataModel);
  return normalizeConfigForPersistence(c);
}

/**
 * `canSave` is a *logical* statement about adapter mode, not a *filesystem*
 * guarantee. A `filesystem`-mode workspace whose `growthub.config.json` is
 * actually read-only on disk (permission denied, RO mount) will still report
 * `canSave: true`; the no-code Save UI surfaces the underlying fs error
 * (workspace-builder.jsx#save → setConfigMessage) and PATCH returns 500 with
 * the original error message. Read-only-mode 409 is the *contractual* not-save
 * path and gets verbatim `guidance` instead.
 */
function describePersistenceMode() {
  if (shouldUseDatabasePersistence()) {
    return {
      mode: PERSISTENCE_ADAPTERS.DATABASE,
      adapter: "postgres",
      canSave: true,
      saveLabel: "Save writes workspace config to Postgres (e.g. Supabase).",
      reason:
        "postgres workspace data adapter with a configured Postgres URL (DATABASE_URL, POSTGRES_URL, …)",
      nextAction: null,
      guidance: null,
      /** Row key in `growthub_workspace_configs.workspace_id` — same as `GROWTHUB_WORKSPACE_CONFIG_ID` when set. */
      storageWorkspaceId: process.env.GROWTHUB_WORKSPACE_CONFIG_ID || null
    };
  }
  const target = process.env.GROWTHUB_WORKSPACE_DEPLOY_TARGET || process.env.AGENCY_PORTAL_DEPLOY_TARGET || "vercel";
  const isReadOnlyDeploy = target === "vercel" || target === "netlify";
  const allowFsWrite = process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE === "true";
  const baseFilesystem = (reason) => ({
    mode: PERSISTENCE_ADAPTERS.FILESYSTEM,
    adapter: PERSISTENCE_ADAPTERS.FILESYSTEM,
    canSave: true,
    saveLabel: "Save writes growthub.config.json on disk.",
    reason,
    nextAction: null,
    guidance: null
  });
  if (allowFsWrite) {
    return baseFilesystem("WORKSPACE_CONFIG_ALLOW_FS_WRITE=true");
  }
  if (process.env.NODE_ENV === "development") {
    return baseFilesystem("Local Next.js development");
  }
  if (isReadOnlyDeploy) {
    const reason = `Deploy target ${target} treats the bundle as read-only. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime, or wire a hosted persistence adapter.`;
    return {
      mode: PERSISTENCE_ADAPTERS.READ_ONLY,
      adapter: PERSISTENCE_ADAPTERS.READ_ONLY,
      canSave: false,
      saveLabel: "Save is disabled in this runtime.",
      reason,
      nextAction: "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or connect a persistence adapter.",
      guidance: READ_ONLY_GUIDANCE
    };
  }
  return baseFilesystem("Local development");
}

function healDataModelObjects(dataModel) {
  if (!dataModel || !Array.isArray(dataModel.objects)) return dataModel;
  const healed = dataModel.objects.map((object) => {
    let next = object;
    if (
      object &&
      object.binding?.sourceStorage === "workspace-source-records" &&
      (typeof object.sourceId !== "string" || !object.sourceId.trim()) &&
      typeof object.id === "string" &&
      object.id.trim()
    ) {
      next = { ...next, sourceId: object.id.trim() };
    }
    if (next?.objectType === "sandbox-environment" && Array.isArray(next.rows)) {
      const rows = next.rows.map((row) => stripSandboxRowViewMetadata(row));
      const changed = rows.some((row, index) => row !== next.rows[index]);
      if (changed) next = { ...next, rows };
    }
    return next;
  });
  return { ...dataModel, objects: healed };
}

/**
 * Pure merge step shared by the real write path and the preflight dry-run
 * (`POST /api/workspace/patch/preflight`). Canvas patches MERGE over the
 * current canvas (layout/bindings preserved, single-tab vs multi-tab fields
 * stripped, `null` deletes a key) — they are NOT top-level replacements.
 * Preflight must call this exact function so it can never disagree with
 * `writeWorkspaceConfig` about what the merged config will be.
 */
function applyWorkspaceConfigPatch(currentConfig, patch) {
  const next = { ...currentConfig };
  if (patch.dashboards !== undefined) next.dashboards = patch.dashboards;
  if (patch.widgetTypes !== undefined) next.widgetTypes = patch.widgetTypes;
  if (patch.dataModel !== undefined) next.dataModel = healDataModelObjects(patch.dataModel);
  if (patch.canvas !== undefined && patch.canvas !== null) {
    const patchCanvas = { ...patch.canvas };
    if (Array.isArray(patchCanvas.tabs)) {
      delete patchCanvas.widgets;
      delete patchCanvas.name;
    } else if (Array.isArray(patchCanvas.widgets)) {
      delete patchCanvas.tabs;
      delete patchCanvas.activeTabId;
    }
    next.canvas = {
      ...currentConfig.canvas,
      ...patchCanvas,
      layout: { ...(currentConfig.canvas?.layout || {}), ...(patchCanvas.layout || {}) },
      bindings: { ...(currentConfig.canvas?.bindings || {}), ...(patchCanvas.bindings || {}) }
    };
    if (Array.isArray(patch.canvas.tabs)) {
      delete next.canvas.widgets;
      delete next.canvas.name;
    }
    if (Array.isArray(patch.canvas.widgets)) {
      delete next.canvas.tabs;
      delete next.canvas.activeTabId;
    }
    for (const key of ["widgets", "tabs", "activeTabId", "name"]) {
      if (Object.prototype.hasOwnProperty.call(patchCanvas, key) && patchCanvas[key] === null) {
        delete next.canvas[key];
      }
    }
  }
  return next;
}

async function writeWorkspaceConfig(patch) {
  const persistence = describePersistenceMode();
  const adapter = readAdapterConfig();
  if (persistence.mode === PERSISTENCE_ADAPTERS.DATABASE && persistence.canSave) {
    const rawCurrent = await readDatabaseWorkspaceConfigRaw();
    const current = normalizeConfigForPersistence(rawCurrent);
    const next = normalizeConfigForPersistence(applyWorkspaceConfigPatch(current, patch));
    validateWorkspaceConfig({
      dashboards: next.dashboards,
      widgetTypes: next.widgetTypes,
      canvas: next.canvas,
      dataModel: next.dataModel
    });
    await writeDatabaseWorkspaceConfig(withAuxiliarySourceRecords(next, rawCurrent));
    return next;
  }
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }
  const rawCurrent = persistence.mode === PERSISTENCE_ADAPTERS.DATABASE
    ? await readDatabaseWorkspaceConfigRaw()
    : null;
  const current = normalizeConfigForPersistence(
    rawCurrent || await readWorkspaceConfig()
  );
  const next = normalizeConfigForPersistence(applyWorkspaceConfigPatch(current, patch));
  validateWorkspaceConfig({
    dashboards: next.dashboards,
    widgetTypes: next.widgetTypes,
    canvas: next.canvas,
    dataModel: next.dataModel
  });
  const configPath = resolveWorkspaceConfigPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(configPath) !== expectedDir) {
    const error = new Error(`refused to write outside workspace cwd: ${configPath}`);
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function normalizeWorkspaceIdentityPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    const error = new Error("settings patch must be a plain object");
    error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
    throw error;
  }

  const allowed = new Set(["name", "branding"]);
  const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
  if (unknown.length) {
    const error = new Error("settings patch contains unknown fields");
    error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
    error.details = unknown;
    throw error;
  }

  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    if (typeof patch.name !== "string") {
      const error = new Error("name must be a string");
      error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
      throw error;
    }
    normalized.name = patch.name.trim() || "Growthub Workspace";
  }

  if (Object.prototype.hasOwnProperty.call(patch, "branding")) {
    if (!patch.branding || typeof patch.branding !== "object" || Array.isArray(patch.branding)) {
      const error = new Error("branding must be a plain object");
      error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
      throw error;
    }
    const brandingAllowed = new Set(["name", "logoUrl", "accent"]);
    const brandingUnknown = Object.keys(patch.branding).filter((key) => !brandingAllowed.has(key));
    if (brandingUnknown.length) {
      const error = new Error("branding patch contains unknown fields");
      error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
      error.details = brandingUnknown.map((key) => `branding.${key}`);
      throw error;
    }
    normalized.branding = {};
    for (const key of brandingAllowed) {
      if (Object.prototype.hasOwnProperty.call(patch.branding, key)) {
        if (typeof patch.branding[key] !== "string") {
          const error = new Error(`branding.${key} must be a string`);
          error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
          throw error;
        }
        normalized.branding[key] = patch.branding[key].trim();
      }
    }
  }

  return normalized;
}

async function writeWorkspaceIdentitySettings(patch) {
  const persistence = describePersistenceMode();
  const adapter = readAdapterConfig();
  if (![PERSISTENCE_ADAPTERS.FILESYSTEM, PERSISTENCE_ADAPTERS.DATABASE].includes(persistence.mode) || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  const normalized = normalizeWorkspaceIdentityPatch(patch);
  const rawCurrent = persistence.mode === PERSISTENCE_ADAPTERS.DATABASE
    ? await readDatabaseWorkspaceConfigRaw()
    : null;
  const current = normalizeConfigForPersistence(
    rawCurrent || await readWorkspaceConfig()
  );
  const next = { ...current };
  if (normalized.name !== undefined) next.name = normalized.name;
  if (normalized.branding) {
    next.branding = {
      ...(current.branding && typeof current.branding === "object" && !Array.isArray(current.branding)
        ? current.branding
        : {}),
      ...normalized.branding
    };
    if (!next.branding.name) next.branding.name = next.name || "Growthub Workspace";
  }

  validateWorkspaceConfig({
    dashboards: next.dashboards,
    widgetTypes: next.widgetTypes,
    canvas: next.canvas,
    dataModel: next.dataModel
  });

  if (persistence.mode === PERSISTENCE_ADAPTERS.DATABASE) {
    await writeDatabaseWorkspaceConfig(withAuxiliarySourceRecords(next, rawCurrent));
    return next;
  }

  const configPath = resolveWorkspaceConfigPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(configPath) !== expectedDir) {
    const error = new Error(`refused to write outside workspace cwd: ${configPath}`);
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function normalizeApiWebhookRefs(refs) {
  if (!Array.isArray(refs)) {
    const error = new Error("refs must be an array");
    error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
    throw error;
  }
  return refs
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        const error = new Error("each ref must be a plain object");
        error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
        throw error;
      }
      const allowed = new Set(["id", "label", "kind", "endpointRef", "status", "hasSecret", "url"]);
      const unknown = Object.keys(item).filter((key) => !allowed.has(key));
      if (unknown.length) {
        const error = new Error("ref contains unknown fields");
        error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
        error.details = unknown;
        throw error;
      }
      const kind = item.kind === "webhook" ? "webhook" : "api";
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const endpointRef = typeof item.endpointRef === "string" ? item.endpointRef.trim() : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!label && !endpointRef && !url && item.hasSecret !== true) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `custom-${kind}-${index + 1}`,
        label: label || endpointRef,
        kind,
        sourceType: "custom-api-webhooks",
        endpointRef,
        url,
        status: typeof item.status === "string" && item.status.trim() ? item.status.trim() : "configured",
        hasSecret: item.hasSecret === true
      };
    })
    .filter(Boolean);
}

async function writeWorkspaceApiWebhookSettings(patch) {
  const persistence = describePersistenceMode();
  const adapter = readAdapterConfig();
  if (![PERSISTENCE_ADAPTERS.FILESYSTEM, PERSISTENCE_ADAPTERS.DATABASE].includes(persistence.mode) || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  const refs = normalizeApiWebhookRefs(patch?.refs);
  const rawCurrent = persistence.mode === PERSISTENCE_ADAPTERS.DATABASE
    ? await readDatabaseWorkspaceConfigRaw()
    : null;
  const current = normalizeConfigForPersistence(
    rawCurrent || await readWorkspaceConfig()
  );
  const existing = Array.isArray(current.integrations) ? current.integrations : [];
  const next = {
    ...current,
    integrations: [
      ...existing.filter((item) => item?.sourceType !== "custom-api-webhooks"),
      ...refs
    ]
  };

  validateWorkspaceConfig({
    dashboards: next.dashboards,
    widgetTypes: next.widgetTypes,
    canvas: next.canvas,
    dataModel: next.dataModel
  });

  if (persistence.mode === PERSISTENCE_ADAPTERS.DATABASE) {
    await writeDatabaseWorkspaceConfig(withAuxiliarySourceRecords(next, rawCurrent));
    return next.integrations.filter((item) => item?.sourceType === "custom-api-webhooks");
  }

  const configPath = resolveWorkspaceConfigPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(configPath) !== expectedDir) {
    const error = new Error(`refused to write outside workspace cwd: ${configPath}`);
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next.integrations.filter((item) => item?.sourceType === "custom-api-webhooks");
}

function shouldUseDatabasePersistence() {
  const adapter = readAdapterConfig();
  return adapter.dataAdapter === "postgres" && Boolean(resolveWorkspaceDatabaseUrl());
}

/** Hosted workspace row key: explicit env, then Growthub bridge user id (same value many kits already set in `.env`). */
function resolveWorkspaceOwnerIdFromEnv() {
  const id =
    process.env.GROWTHUB_WORKSPACE_USER_ID ||
    process.env.AGENCY_PORTAL_WORKSPACE_USER_ID ||
    process.env.GROWTHUB_BRIDGE_USER_ID ||
    "";
  return typeof id === "string" && id.trim() ? id.trim() : DEFAULT_WORKSPACE_OWNER;
}

async function readWorkspaceOwner() {
  const sessionPath = process.env.GROWTHUB_WORKSPACE_SESSION_PATH || process.env.AGENCY_PORTAL_WORKSPACE_SESSION_PATH;
  if (sessionPath) {
    try {
      const raw = await fs.readFile(path.resolve(/*turbopackIgnore: true*/ sessionPath), "utf8");
      const session = JSON.parse(raw);
      const sid = session.userId || session.email;
      return {
        ownerId: (typeof sid === "string" && sid.trim() ? sid.trim() : null) || resolveWorkspaceOwnerIdFromEnv(),
        ownerEmail: session.email || null,
        hostedBaseUrl: session.hostedBaseUrl || null,
        sessionPath
      };
    } catch {
      return {
        ownerId: resolveWorkspaceOwnerIdFromEnv(),
        ownerEmail: null,
        hostedBaseUrl: null,
        sessionPath
      };
    }
  }
  return {
    ownerId: resolveWorkspaceOwnerIdFromEnv(),
    ownerEmail: null,
    hostedBaseUrl: null,
    sessionPath: null
  };
}

async function connectPostgres() {
  const { Client } = await import("pg");
  const rawUrl = resolveWorkspaceDatabaseUrl();
  const connectionString = normalizePostgresConnectionString(rawUrl);
  const usesSsl = process.env.DATABASE_SSL === "true" || /supabase\.(co|com)|sslmode=require/.test(String(connectionString || ""));
  const client = new Client({
    connectionString,
    ssl: usesSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } : undefined
  });
  await client.connect();
  return client;
}

function normalizePostgresConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function ensureWorkspaceConfigTable(client) {
  await client.query(`
    create table if not exists ${WORKSPACE_CONFIG_TABLE} (
      owner_id text not null,
      workspace_id text not null,
      owner_email text,
      hosted_base_url text,
      config jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (owner_id, workspace_id)
    )
  `);
}

async function readDatabaseWorkspaceConfigRaw() {
  const owner = await readWorkspaceOwner();
  const seed = JSON.parse(await fs.readFile(resolveWorkspaceConfigPath(), "utf8"));
  const workspaceId = process.env.GROWTHUB_WORKSPACE_CONFIG_ID || seed.id || "default";
  const client = await connectPostgres();
  try {
    await ensureWorkspaceConfigTable(client);
    const result = await client.query(
      `select config from ${WORKSPACE_CONFIG_TABLE} where owner_id = $1 and workspace_id = $2 limit 1`,
      [owner.ownerId, workspaceId]
    );
    if (result.rows[0]?.config) {
      return cloneJson(result.rows[0].config);
    }
    await client.query(
      `insert into ${WORKSPACE_CONFIG_TABLE} (owner_id, workspace_id, owner_email, hosted_base_url, config)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (owner_id, workspace_id) do nothing`,
      [owner.ownerId, workspaceId, owner.ownerEmail, owner.hostedBaseUrl, JSON.stringify(seed)]
    );
    return cloneJson(seed);
  } finally {
    await client.end();
  }
}

async function readDatabaseWorkspaceConfig() {
  const config = normalizeConfigForPersistence(await readDatabaseWorkspaceConfigRaw());
  if (config.dataModel) config.dataModel = healDataModelObjects(config.dataModel);
  return config;
}

async function writeDatabaseWorkspaceConfig(config) {
  const owner = await readWorkspaceOwner();
  const workspaceId = process.env.GROWTHUB_WORKSPACE_CONFIG_ID || config.id || "default";
  const client = await connectPostgres();
  try {
    await ensureWorkspaceConfigTable(client);
    await client.query(
      `insert into ${WORKSPACE_CONFIG_TABLE} (owner_id, workspace_id, owner_email, hosted_base_url, config)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (owner_id, workspace_id)
       do update set
         owner_email = excluded.owner_email,
         hosted_base_url = excluded.hosted_base_url,
         config = excluded.config,
         updated_at = now()`,
      [owner.ownerId, workspaceId, owner.ownerEmail, owner.hostedBaseUrl, JSON.stringify(config)]
    );
  } finally {
    await client.end();
  }
}

/**
 * Read normalized live rows for a refresh `sourceId` / object id from
 * `dataModel.objects[]` (same document as workspace config — Postgres JSONB or
 * growthub.config.json). No sidecar files or auxiliary tables.
 */
async function readLiveDataModelBundle(sourceId) {
  const config = await readWorkspaceConfig();
  const objects = config.dataModel?.objects || [];
  if (sourceId) {
    const sid = sourceId.trim();
    const o = objects.find((obj) => obj.id === sid || obj.sourceId === sid);
    if (!o || o.binding?.sourceStorage !== "workspace-source-records") return null;
    return bundleFromLiveDataModelObject(o);
  }
  const all = {};
  for (const o of objects) {
    if (o.binding?.sourceStorage !== "workspace-source-records") continue;
    const key = typeof o.sourceId === "string" && o.sourceId.trim() ? o.sourceId.trim() : o.id;
    all[key] = bundleFromLiveDataModelObject(o);
  }
  return all;
}

async function writeLiveDataModelRows(sourceId, records, metadata = {}) {
  const persistence = describePersistenceMode();
  if (![PERSISTENCE_ADAPTERS.FILESYSTEM, PERSISTENCE_ADAPTERS.DATABASE].includes(persistence.mode) || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    const error = new Error("sourceId must be a non-empty string");
    error.code = "INVALID_LIVE_DATA_MODEL_ROWS";
    throw error;
  }
  if (!Array.isArray(records)) {
    const error = new Error("records must be an array");
    error.code = "INVALID_LIVE_DATA_MODEL_ROWS";
    throw error;
  }

  const sid = sourceId.trim();
  const fetchedAt = metadata.fetchedAt || new Date().toISOString();
  const integrationId = metadata.integrationId ?? null;

  const rawBasis = persistence.mode === PERSISTENCE_ADAPTERS.DATABASE
    ? await readDatabaseWorkspaceConfigRaw()
    : null;
  const basis = normalizeConfigForPersistence(rawBasis || await readWorkspaceConfig());
  if (!Array.isArray(basis.dataModel?.objects)) {
    const error = new Error("workspace config has no dataModel.objects");
    error.code = "LIVE_DATA_MODEL_NO_OBJECTS";
    throw error;
  }

  let found = false;
  const objects = basis.dataModel.objects.map((o) => {
    if (o.id !== sid && o.sourceId !== sid) return o;
    if (o.binding?.sourceStorage !== "workspace-source-records") return o;
    found = true;
    const nextBinding = {
      ...o.binding,
      lastFetchedAt: fetchedAt,
      recordCount: records.length
    };
    if ("rowSource" in nextBinding) delete nextBinding.rowSource;
    return {
      ...o,
      rows: records,
      binding: nextBinding
    };
  });

  if (!found) {
    const error = new Error(`no live-backed data model object for sourceId: ${sid}`);
    error.code = "LIVE_DATA_MODEL_OBJECT_NOT_FOUND";
    throw error;
  }

  let next = normalizeConfigForPersistence({
    ...basis,
    dataModel: { ...basis.dataModel, objects }
  });
  next = syncWidgetsToLiveObjectRows(next, sid, records, fetchedAt);
  if (next.dataModel) next.dataModel = healDataModelObjects(next.dataModel);

  validateWorkspaceConfig({
    dashboards: next.dashboards,
    widgetTypes: next.widgetTypes,
    canvas: next.canvas,
    dataModel: next.dataModel
  });

  if (persistence.mode === PERSISTENCE_ADAPTERS.DATABASE) {
    await writeDatabaseWorkspaceConfig(withAuxiliarySourceRecords(next, rawBasis));
  } else {
    const configPath = resolveWorkspaceConfigPath();
    const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
    if (path.dirname(configPath) !== expectedDir) {
      const error = new Error(`refused to write outside workspace cwd: ${configPath}`);
      error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
      throw error;
    }
    await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  return { records, integrationId, fetchedAt, recordCount: records.length };
}

/** Kit artifact parity: sidecar keyed by stable `sourceId` (live integrations + sandbox run-history keys). */
const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsSidecarPath() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), SOURCE_RECORDS_FILENAME);
}

/**
 * Canonical read contract for keyed source records (`refresh-sources`,
 * sandbox run history keyed as `sandbox:<objectId>:<slug>`, reference pickers).
 *
 * Lookup order per key:
 * 1. Live-backed `workspace-source-records` **rows inside** `dataModel.objects[]`
 *    (Postgres JSONB or growthub.config.json).
 * 2. **Supabase/hosted Postgres** — `auxiliarySourceRecords` keyed map on the workspace
 *    document persisted with config JSON (same Postgres row).
 * 3. Filesystem **`growthub.source-records.json`** — same keyed shape as exported kits.
 */
async function readWorkspaceSourceRecords(sourceId) {
  if (!sourceId) {
    const liveAllRaw = await readLiveDataModelBundle();
    const liveAll =
      typeof liveAllRaw === "object" &&
      liveAllRaw !== null &&
      !Array.isArray(liveAllRaw)
        ? liveAllRaw
        : {};
    const config = shouldUseDatabasePersistence()
      ? await readDatabaseWorkspaceConfigRaw()
      : await readWorkspaceConfig();
    const auxPlain =
      config.auxiliarySourceRecords &&
      typeof config.auxiliarySourceRecords === "object" &&
      !Array.isArray(config.auxiliarySourceRecords)
        ? config.auxiliarySourceRecords
        : {};
    let merged = { ...auxPlain, ...liveAll };

    if (!shouldUseDatabasePersistence()) {
      try {
        const raw = await fs.readFile(resolveSourceRecordsSidecarPath(), "utf8");
        const all = JSON.parse(raw);
        if (typeof all === "object" && all !== null && !Array.isArray(all)) merged = { ...all, ...merged };
      } catch {
        /* no sidecar */
      }
    }
    return merged;
  }

  const sid = sourceId.trim();
  const liveOne = await readLiveDataModelBundle(sid);
  if (liveOne && typeof liveOne === "object") return liveOne;

  const cfg = shouldUseDatabasePersistence()
    ? await readDatabaseWorkspaceConfigRaw()
    : await readWorkspaceConfig();
  const auxHit =
    cfg.auxiliarySourceRecords &&
    typeof cfg.auxiliarySourceRecords === "object" &&
    !Array.isArray(cfg.auxiliarySourceRecords)
      ? cfg.auxiliarySourceRecords[sid]
      : null;
  if (auxHit && typeof auxHit === "object" && Array.isArray(auxHit.records)) return auxHit;

  if (!shouldUseDatabasePersistence()) {
    try {
      const raw = await fs.readFile(resolveSourceRecordsSidecarPath(), "utf8");
      const all = JSON.parse(raw);
      return all[sid] || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Persist keyed records: live integrations update governed object rows when
 * `binding.sourceStorage === "workspace-source-records"` matches; sandbox and
 * other keyed stores use Postgres-embedded auxiliary map or filesystem sidecar.
 */
async function writeWorkspaceSourceRecords(sourceId, records, metadata = {}) {
  const persistence = describePersistenceMode();

  const sid = typeof sourceId === "string" ? sourceId.trim() : "";
  if (!sid) {
    const error = new Error("sourceId must be a non-empty string");
    error.code = "INVALID_SOURCE_RECORDS_WRITE";
    throw error;
  }
  if (!Array.isArray(records)) {
    const error = new Error("records must be an array");
    error.code = "INVALID_SOURCE_RECORDS_WRITE";
    throw error;
  }

  const fetchedAt = metadata.fetchedAt || new Date().toISOString();
  const integrationId = metadata.integrationId ?? null;
  const entry = {
    records,
    integrationId,
    fetchedAt,
    recordCount: records.length
  };

  const basis = shouldUseDatabasePersistence()
    ? await readDatabaseWorkspaceConfigRaw()
    : await readWorkspaceConfig();
  const hasLiveBackedObject =
    Array.isArray(basis.dataModel?.objects) &&
    basis.dataModel.objects.some(
      (o) =>
        o &&
        o.binding?.sourceStorage === "workspace-source-records" &&
        (o.id === sid || o.sourceId === sid)
    );

  if (hasLiveBackedObject) {
    return writeLiveDataModelRows(sid, records, { integrationId, fetchedAt });
  }

  if (!persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  if (persistence.mode === PERSISTENCE_ADAPTERS.DATABASE) {
    const aux = cloneJson(
      basis.auxiliarySourceRecords &&
        typeof basis.auxiliarySourceRecords === "object" &&
        !Array.isArray(basis.auxiliarySourceRecords)
        ? basis.auxiliarySourceRecords
        : {}
    );
    aux[sid] = entry;
    const next = normalizeConfigForPersistence({
      ...basis,
      auxiliarySourceRecords: aux
    });
    validateWorkspaceConfig({
      dashboards: next.dashboards,
      widgetTypes: next.widgetTypes,
      canvas: next.canvas,
      dataModel: next.dataModel
    });
    await writeDatabaseWorkspaceConfig({
      ...next,
      auxiliarySourceRecords: aux
    });
    return entry;
  }

  if (persistence.mode === PERSISTENCE_ADAPTERS.FILESYSTEM) {
    const recordsPath = resolveSourceRecordsSidecarPath();
    const expectedDir = path.resolve(/* turbopackIgnore: true */ process.cwd());
    if (path.dirname(recordsPath) !== expectedDir) {
      const error = new Error(`refused to write outside workspace cwd: ${recordsPath}`);
      error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
      throw error;
    }

    let all = {};
    try {
      const raw = await fs.readFile(recordsPath, "utf8");
      all = JSON.parse(raw);
    } catch {
      all = {};
    }

    all[sid] = entry;
    await fs.writeFile(recordsPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
    return entry;
  }

  const error = new Error(persistence.reason || "cannot persist source records");
  error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
  error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
  throw error;
}
export {
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  PERSISTENCE_ADAPTERS,
  READ_ONLY_GUIDANCE,
  applyWorkspaceConfigPatch,
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  readLiveDataModelBundle,
  resolveWorkspaceConfigPath,
  validateWorkspaceConfig,
  writeWorkspaceConfig,
  writeWorkspaceApiWebhookSettings,
  writeWorkspaceIdentitySettings,
  writeLiveDataModelRows,
  writeWorkspaceSourceRecords
};
