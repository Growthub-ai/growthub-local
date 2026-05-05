import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  validateWorkspaceConfig
} from "@/lib/workspace-schema";

function resolveWorkspaceConfigPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "growthub.config.json");
}

async function readWorkspaceConfig() {
  const configPath = resolveWorkspaceConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Persistence modes
 *
 * filesystem   — local Next.js dev, or any runtime with WORKSPACE_CONFIG_ALLOW_FS_WRITE=true.
 *                PATCH /api/workspace writes growthub.config.json on disk.
 * read-only    — Vercel/Netlify-style runtimes where the bundle is immutable.
 *                PATCH /api/workspace returns 409. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true
 *                on a writable runtime, or wire a hosted persistence adapter.
 * (future)     — A database-backed adapter can replace the filesystem write path without
 *                touching the UI: implement a new adapter that satisfies the same read/write
 *                contract and register it via AGENCY_PORTAL_DATA_ADAPTER.
 */
function describePersistenceMode() {
  const target = process.env.AGENCY_PORTAL_DEPLOY_TARGET || "vercel";
  const isReadOnlyDeploy = target === "vercel" || target === "netlify";
  const allowFsWrite = process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE === "true";
  if (allowFsWrite) {
    return { mode: "filesystem", reason: "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true", canSave: true };
  }
  if (process.env.NODE_ENV === "development") {
    return { mode: "filesystem", reason: "Local Next.js development", canSave: true };
  }
  if (isReadOnlyDeploy) {
    return {
      mode: "read-only",
      reason: `Deploy target ${target} treats the bundle as read-only. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime, or wire a hosted persistence adapter.`,
      canSave: false
    };
  }
  return { mode: "filesystem", reason: "Local development", canSave: true };
}

function applyPatch(currentConfig, patch) {
  const next = { ...currentConfig };
  if (patch.dashboards !== undefined) next.dashboards = patch.dashboards;
  if (patch.widgetTypes !== undefined) next.widgetTypes = patch.widgetTypes;
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
    if (patchCanvas.branding !== undefined && patchCanvas.branding !== null) {
      const isBrandingObj = Boolean(patchCanvas.branding) && typeof patchCanvas.branding === "object" && !Array.isArray(patchCanvas.branding);
      if (isBrandingObj) {
        next.canvas.branding = { ...(currentConfig.canvas?.branding || {}), ...patchCanvas.branding };
      } else {
        next.canvas.branding = patchCanvas.branding;
      }
    }
    if (Array.isArray(patch.canvas.tabs)) {
      delete next.canvas.widgets;
      delete next.canvas.name;
    }
    if (Array.isArray(patch.canvas.widgets)) {
      delete next.canvas.tabs;
      delete next.canvas.activeTabId;
    }
    for (const key of ["widgets", "tabs", "activeTabId", "name", "branding"]) {
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
  if (persistence.mode !== "filesystem") {
    const error = new Error(persistence.reason);
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.adapter = adapter.integrationAdapter;
    throw error;
  }
  const current = await readWorkspaceConfig();
  const next = applyPatch(current, patch);
  validateWorkspaceConfig({
    dashboards: next.dashboards,
    widgetTypes: next.widgetTypes,
    canvas: next.canvas
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

export {
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  describePersistenceMode,
  readWorkspaceConfig,
  resolveWorkspaceConfigPath,
  validateWorkspaceConfig,
  writeWorkspaceConfig
};
