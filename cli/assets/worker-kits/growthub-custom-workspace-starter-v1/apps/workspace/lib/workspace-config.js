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
  PERSISTENCE_ADAPTERS,
  READ_ONLY_GUIDANCE,
  describePersistenceMode,
  readWorkspaceConfig,
  resolveWorkspaceConfigPath,
  validateWorkspaceConfig,
  writeWorkspaceConfig
};
