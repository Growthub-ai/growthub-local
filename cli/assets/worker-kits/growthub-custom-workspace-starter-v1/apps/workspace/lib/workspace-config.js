import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";

const KNOWN_FIELDS = ["dashboards", "widgetTypes", "canvas"];
const KNOWN_WIDGET_KINDS = ["chart", "view", "iframe", "rich-text"];
const GRID_COLUMNS = 12;
const GRID_ROWS = 16;

function resolveWorkspaceConfigPath() {
  return path.resolve(process.cwd(), "growthub.config.json");
}

async function readWorkspaceConfig() {
  const configPath = resolveWorkspaceConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

function describePersistenceMode() {
  const target = process.env.AGENCY_PORTAL_DEPLOY_TARGET || "vercel";
  const isReadOnlyDeploy = target === "vercel" || target === "netlify";
  const allowFsWrite = process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE === "true";
  if (allowFsWrite) {
    return { mode: "filesystem", reason: "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true" };
  }
  if (isReadOnlyDeploy) {
    return {
      mode: "read-only",
      reason: `Deploy target ${target} treats the bundle as read-only. Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime, or wire a hosted persistence adapter.`
    };
  }
  return { mode: "filesystem", reason: "Local development" };
}

function isFiniteInt(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value;
}

function validateWorkspaceConfig(nextConfig) {
  if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
    const error = new Error("workspace config must be a plain object");
    error.code = "INVALID_WORKSPACE_CONFIG";
    error.details = ["root must be a plain object"];
    throw error;
  }
  const errors = [];
  for (const key of Object.keys(nextConfig)) {
    if (!KNOWN_FIELDS.includes(key)) {
      errors.push(`unknown top-level field: ${key}`);
    }
  }
  if (nextConfig.dashboards !== undefined && !Array.isArray(nextConfig.dashboards)) {
    errors.push("dashboards must be an array");
  }
  if (nextConfig.widgetTypes !== undefined && !Array.isArray(nextConfig.widgetTypes)) {
    errors.push("widgetTypes must be an array");
  }
  if (nextConfig.canvas !== undefined) {
    if (typeof nextConfig.canvas !== "object" || Array.isArray(nextConfig.canvas) || nextConfig.canvas === null) {
      errors.push("canvas must be a plain object");
    } else if (nextConfig.canvas.widgets !== undefined) {
      if (!Array.isArray(nextConfig.canvas.widgets)) {
        errors.push("canvas.widgets must be an array");
      } else {
        const seenIds = new Set();
        nextConfig.canvas.widgets.forEach((widget, index) => {
          if (!widget || typeof widget !== "object" || Array.isArray(widget)) {
            errors.push(`canvas.widgets[${index}] must be an object`);
            return;
          }
          if (typeof widget.id !== "string" || !widget.id) {
            errors.push(`canvas.widgets[${index}].id must be a non-empty string`);
          } else if (seenIds.has(widget.id)) {
            errors.push(`canvas.widgets[${index}].id duplicates an earlier widget id`);
          } else {
            seenIds.add(widget.id);
          }
          if (!KNOWN_WIDGET_KINDS.includes(widget.kind)) {
            errors.push(`canvas.widgets[${index}].kind must be one of ${KNOWN_WIDGET_KINDS.join(", ")}`);
          }
          if (!widget.position || typeof widget.position !== "object" || Array.isArray(widget.position)) {
            errors.push(`canvas.widgets[${index}].position must be an object`);
          } else {
            for (const k of ["x", "y", "w", "h"]) {
              if (!isFiniteInt(widget.position[k])) {
                errors.push(`canvas.widgets[${index}].position.${k} must be a finite integer`);
              }
            }
            if (
              isFiniteInt(widget.position.x) &&
              isFiniteInt(widget.position.w) &&
              (widget.position.x < 0 || widget.position.w < 1 || widget.position.x + widget.position.w > GRID_COLUMNS)
            ) {
              errors.push(`canvas.widgets[${index}] x/w out of [0..${GRID_COLUMNS}] grid`);
            }
            if (
              isFiniteInt(widget.position.y) &&
              isFiniteInt(widget.position.h) &&
              (widget.position.y < 0 || widget.position.h < 1 || widget.position.y + widget.position.h > GRID_ROWS)
            ) {
              errors.push(`canvas.widgets[${index}] y/h out of [0..${GRID_ROWS}] grid`);
            }
          }
        });
      }
    }
  }
  if (errors.length) {
    const error = new Error(`invalid workspace config: ${errors.join("; ")}`);
    error.code = "INVALID_WORKSPACE_CONFIG";
    error.details = errors;
    throw error;
  }
}

function applyPatch(currentConfig, patch) {
  const next = { ...currentConfig };
  if (patch.dashboards !== undefined) next.dashboards = patch.dashboards;
  if (patch.widgetTypes !== undefined) next.widgetTypes = patch.widgetTypes;
  if (patch.canvas !== undefined && patch.canvas !== null) {
    next.canvas = {
      ...currentConfig.canvas,
      ...patch.canvas,
      layout: { ...(currentConfig.canvas?.layout || {}), ...(patch.canvas.layout || {}) },
      bindings: { ...(currentConfig.canvas?.bindings || {}), ...(patch.canvas.bindings || {}) }
    };
    if (patch.canvas.widgets !== undefined) {
      next.canvas.widgets = patch.canvas.widgets;
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
  const expectedDir = path.resolve(process.cwd());
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
