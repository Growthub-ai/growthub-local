import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";

const KNOWN_FIELDS = ["dashboards", "widgetTypes", "canvas", "onboarding"];
const KNOWN_WIDGET_KINDS = [
  "chart",
  "view",
  "iframe",
  "rich-text",
  "chat-session",
  "workflow-runner",
  "artifact-viewer"
];

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

function validateWorkspaceConfig(nextConfig) {
  if (!nextConfig || typeof nextConfig !== "object") {
    throw new Error("workspace config must be an object");
  }
  const errors = [];
  for (const key of Object.keys(nextConfig)) {
    if (!KNOWN_FIELDS.includes(key)) {
      errors.push(`unknown top-level field: ${key}`);
    }
  }
  if (nextConfig.dashboards && !Array.isArray(nextConfig.dashboards)) {
    errors.push("dashboards must be an array");
  }
  if (nextConfig.widgetTypes && !Array.isArray(nextConfig.widgetTypes)) {
    errors.push("widgetTypes must be an array");
  }
  if (nextConfig.canvas && typeof nextConfig.canvas !== "object") {
    errors.push("canvas must be an object");
  }
  if (nextConfig.canvas?.widgets) {
    if (!Array.isArray(nextConfig.canvas.widgets)) {
      errors.push("canvas.widgets must be an array");
    } else {
      nextConfig.canvas.widgets.forEach((widget, index) => {
        if (!widget || typeof widget !== "object") {
          errors.push(`canvas.widgets[${index}] must be an object`);
          return;
        }
        if (typeof widget.id !== "string" || !widget.id) {
          errors.push(`canvas.widgets[${index}].id must be a non-empty string`);
        }
        if (!KNOWN_WIDGET_KINDS.includes(widget.kind)) {
          errors.push(`canvas.widgets[${index}].kind must be one of ${KNOWN_WIDGET_KINDS.join(", ")}`);
        }
        if (!widget.position || typeof widget.position !== "object") {
          errors.push(`canvas.widgets[${index}].position must be an object`);
        } else {
          for (const k of ["x", "y", "w", "h"]) {
            if (typeof widget.position[k] !== "number") {
              errors.push(`canvas.widgets[${index}].position.${k} must be a number`);
            }
          }
        }
      });
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
  if (patch.onboarding !== undefined) next.onboarding = patch.onboarding;
  if (patch.canvas !== undefined) {
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
    canvas: next.canvas,
    onboarding: next.onboarding
  });
  const configPath = resolveWorkspaceConfigPath();
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export {
  describePersistenceMode,
  readWorkspaceConfig,
  resolveWorkspaceConfigPath,
  validateWorkspaceConfig,
  writeWorkspaceConfig
};
