import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeCodexSiteRecord } from "./codex-sites-workspace-adapter.js";

const MAX_SESSION_FILES = 16;

function resolveCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripSensitiveProjectFields(project) {
  if (!isPlainObject(project)) return null;
  const {
    source_repository_credential: _sourceRepositoryCredential,
    access_policy: _accessPolicy,
    auth_client_id: _authClientId,
    ...safeProject
  } = project;
  return safeProject;
}

function parseJsonMaybe(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const marker = "Output:";
    const index = trimmed.lastIndexOf(marker);
    if (index === -1) return null;
    const candidate = trimmed.slice(index + marker.length).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function collectStructuredPayloads(line) {
  const parsed = parseJsonMaybe(line);
  if (!isPlainObject(parsed)) return [];
  const payload = parsed.payload;
  const values = [];
  const structured = payload?.result?.Ok?.structuredContent;
  if (isPlainObject(structured)) values.push(structured);
  const outputPayload = parseJsonMaybe(payload?.output);
  if (isPlainObject(outputPayload)) values.push(outputPayload);
  return values;
}

function mergeCodexSitePayload(byProjectId, payload) {
  if (!isPlainObject(payload)) return;
  const isProject =
    typeof payload.id === "string" &&
    payload.id.startsWith("appgprj_") &&
    (payload.current_live_url !== undefined || payload.slug || payload.title);
  const isDeployment =
    typeof payload.project_id === "string" &&
    typeof payload.url === "string" &&
    payload.url.startsWith("http");
  if (!isProject && !isDeployment) return;

  const projectId = isProject ? payload.id : payload.project_id;
  const current = byProjectId.get(projectId) || { id: projectId };
  const next = isProject
    ? { ...current, ...stripSensitiveProjectFields(payload) }
    : {
        ...current,
        id: projectId,
        title: payload.title || current.title,
        current_live_url: payload.url,
        status: payload.status === "succeeded" ? "live" : payload.status || current.status,
        updated_at: payload.updated_at || current.updated_at,
        dashboardId: current.dashboardId || projectId,
        deployment_id: payload.id,
        version_id: payload.version_id
      };
  byProjectId.set(projectId, next);
}

async function listSessionFiles(root) {
  const entries = [];
  async function visit(dir) {
    let children;
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(children.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        return;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat) entries.push({ path: fullPath, mtimeMs: stat.mtimeMs });
      }
    }));
  }
  await visit(root);
  return entries
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SESSION_FILES)
    .map((entry) => entry.path);
}

async function listLocalCodexSites() {
  const codexHome = resolveCodexHome();
  const sessionRoot = path.join(codexHome, "sessions");
  const files = await listSessionFiles(sessionRoot);
  const byProjectId = new Map();
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8").catch(() => "");
    if (!raw.includes("mcp__codex_apps__sites") && !raw.includes("sites_") && !raw.includes("appgprj_")) continue;
    raw.split(/\r?\n/).forEach((line) => {
      collectStructuredPayloads(line).forEach((payload) => mergeCodexSitePayload(byProjectId, payload));
    });
  }
  return Array.from(byProjectId.values())
    .map((site) => normalizeCodexSiteRecord({
      ...site,
      url: site.current_live_url || site.url,
      accessMode: site.access_mode,
      dashboardId: site.dashboardId || site.slug || site.id
    }))
    .filter((site) => site.url);
}

export { listLocalCodexSites };
