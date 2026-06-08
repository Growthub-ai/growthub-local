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
 *   - `database` (future) Reserved adapter slot. Not implemented in V1 — the
 *                     return shape is stable so a hosted adapter can be wired
 *                     without changing UI or API contracts.
 *
 * `describePersistenceMode()` is the single source of truth the GET payload,
 * the no-code Settings/Readiness panel, and the PATCH 409 path all read.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";
import { envKeyCandidates } from "@/lib/env-key-catalog";
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

function resolveWorkspaceConfigPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "growthub.config.json");
}

function resolveEnvLocalPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), ".env.local");
}

function parseEnvLocalContent(text) {
  const lines = String(text || "").split("\n");
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      entries.push({ type: "raw", line });
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      entries.push({ type: "raw", line });
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    entries.push({ type: "kv", key, value, line });
  }
  return entries;
}

function serializeEnvLocalEntries(entries) {
  return `${entries.map((entry) => entry.line).join("\n").replace(/\n*$/, "\n")}`;
}

/**
 * Upsert secret values into .env.local (filesystem mode only). Keys are written
 * using the primary envKeyCandidates slug; values never enter growthub.config.json.
 */
async function writeEnvLocalSecrets(secretWrites) {
  if (!Array.isArray(secretWrites) || !secretWrites.length) return { written: [] };
  const persistence = describePersistenceMode();
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  const envPath = resolveEnvLocalPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(envPath) !== expectedDir) {
    const error = new Error(`refused to write outside workspace cwd: ${envPath}`);
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }

  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf8");
  } catch {
    existing = "";
  }

  const entries = parseEnvLocalContent(existing);
  const written = [];

  for (const { slug, value } of secretWrites) {
    const endpointRef = String(slug || "").trim();
    const secret = String(value || "");
    if (!endpointRef || !secret) continue;
    const envKey = envKeyCandidates(endpointRef)[0];
    if (!envKey) continue;
    const escaped = secret.includes(" ") || secret.includes("#") || secret.includes('"')
      ? `"${secret.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      : secret;
    const line = `${envKey}=${escaped}`;
    const idx = entries.findIndex((e) => e.type === "kv" && e.key === envKey);
    if (idx >= 0) {
      entries[idx] = { type: "kv", key: envKey, value: escaped, line };
    } else {
      entries.push({ type: "kv", key: envKey, value: escaped, line });
    }
    written.push({ endpointRef, envKey });
  }

  if (written.length) {
    await fs.writeFile(envPath, serializeEnvLocalEntries(entries), "utf8");
  }
  return { written };
}

async function readWorkspaceConfig() {
  const configPath = resolveWorkspaceConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
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

function applyPatch(currentConfig, patch) {
  const next = { ...currentConfig };
  if (patch.dashboards !== undefined) next.dashboards = patch.dashboards;
  if (patch.widgetTypes !== undefined) next.widgetTypes = patch.widgetTypes;
  if (patch.dataModel !== undefined) next.dataModel = patch.dataModel;
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
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }
  const current = await readWorkspaceConfig();
  const next = applyPatch(current, patch);
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
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  const normalized = normalizeWorkspaceIdentityPatch(patch);
  const current = await readWorkspaceConfig();
  const next = { ...current };
  if (normalized.name !== undefined) {
    next.name = normalized.name;
  }
  if (normalized.branding) {
    next.branding = {
      ...(current.branding && typeof current.branding === "object" && !Array.isArray(current.branding)
        ? current.branding
        : {}),
      ...normalized.branding
    };
    if (!next.branding.name) {
      next.branding.name = next.name || "Growthub Workspace";
    }
  }

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

function normalizeApiWebhookRefs(refs) {
  if (!Array.isArray(refs)) {
    const error = new Error("refs must be an array");
    error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
    throw error;
  }
  const normalized = [];
  const secretWrites = [];
  refs.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const error = new Error("each ref must be a plain object");
      error.code = "INVALID_WORKSPACE_SETTINGS_PATCH";
      throw error;
    }
    const allowed = new Set(["id", "label", "kind", "endpointRef", "status", "hasSecret", "url", "value"]);
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
    const value = typeof item.value === "string" ? item.value.trim() : "";
    if (!label && !endpointRef && !url && item.hasSecret !== true && !value) return;
    const hasSecret = item.hasSecret === true || Boolean(value);
    if (value && endpointRef) {
      secretWrites.push({ slug: endpointRef, value });
    }
    normalized.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `custom-${kind}-${index + 1}`,
      label: label || endpointRef,
      kind,
      sourceType: "custom-api-webhooks",
      endpointRef,
      url,
      status: typeof item.status === "string" && item.status.trim() ? item.status.trim() : "configured",
      hasSecret,
    });
  });
  return { refs: normalized, secretWrites };
}

async function writeWorkspaceApiWebhookSettings(patch) {
  const persistence = describePersistenceMode();
  const adapter = readAdapterConfig();
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }

  const { refs, secretWrites } = normalizeApiWebhookRefs(patch?.refs);
  const envWriteResult = secretWrites.length ? await writeEnvLocalSecrets(secretWrites) : { written: [] };
  const current = await readWorkspaceConfig();
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

  const configPath = resolveWorkspaceConfigPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  if (path.dirname(configPath) !== expectedDir) {
    const error = new Error(`refused to write outside workspace cwd: ${configPath}`);
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return {
    refs: next.integrations.filter((item) => item?.sourceType === "custom-api-webhooks"),
    envWritten: envWriteResult.written,
  };
}

/**
 * Source Records persistence — sidecar store for live-backed dataModel objects.
 *
 * Records are written by POST /api/workspace/refresh-sources when a resolver
 * fetches live data for a source with `binding.sourceStorage: "workspace-source-records"`.
 *
 * Persistence is keyed by `sourceId` and stored in a JSON sidecar file
 * (`growthub.source-records.json`) beside `growthub.config.json`. The same
 * filesystem / read-only / database mode rules apply: in read-only mode writes
 * are rejected gracefully so the refresh button surface is disabled.
 *
 * Shape: { [sourceId]: { records: Record[], integrationId: string, fetchedAt: string } }
 */

const SOURCE_RECORDS_FILENAME = "growthub.source-records.json";

function resolveSourceRecordsPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), SOURCE_RECORDS_FILENAME);
}

async function readWorkspaceSourceRecords(sourceId) {
  const recordsPath = resolveSourceRecordsPath();
  try {
    const raw = await fs.readFile(recordsPath, "utf8");
    const all = JSON.parse(raw);
    if (sourceId) {
      return all[sourceId] || null;
    }
    return all;
  } catch {
    return sourceId ? null : {};
  }
}

async function writeWorkspaceSourceRecords(sourceId, records, metadata = {}) {
  const persistence = describePersistenceMode();
  if (persistence.mode !== PERSISTENCE_ADAPTERS.FILESYSTEM || !persistence.canSave) {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || READ_ONLY_GUIDANCE;
    throw error;
  }
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    const error = new Error("sourceId must be a non-empty string");
    error.code = "INVALID_SOURCE_RECORDS_WRITE";
    throw error;
  }
  if (!Array.isArray(records)) {
    const error = new Error("records must be an array");
    error.code = "INVALID_SOURCE_RECORDS_WRITE";
    throw error;
  }
  const recordsPath = resolveSourceRecordsPath();
  const expectedDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
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
  all[sourceId.trim()] = {
    records,
    integrationId: metadata.integrationId || null,
    fetchedAt: metadata.fetchedAt || new Date().toISOString(),
    recordCount: records.length
  };
  await fs.writeFile(recordsPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  return all[sourceId.trim()];
}

export {
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  PERSISTENCE_ADAPTERS,
  READ_ONLY_GUIDANCE,
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  resolveEnvLocalPath,
  resolveWorkspaceConfigPath,
  validateWorkspaceConfig,
  writeEnvLocalSecrets,
  writeWorkspaceConfig,
  writeWorkspaceApiWebhookSettings,
  writeWorkspaceIdentitySettings,
  writeWorkspaceSourceRecords
};
