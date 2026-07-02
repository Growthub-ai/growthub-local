/**
 * POST /api/workspace/add-ons/vercel/projects/link
 *
 * Link one Vercel project (or the whole account list with `all:true`) into the
 * governed `vercel-projects` Data Model directory — one atomic custom-object
 * row per project, carrying only non-secret routing metadata. The write goes
 * through the same server-authoritative lane every add-ons route uses
 * (readWorkspaceConfig → pure helper → writeWorkspaceConfig) and emits an
 * outcome receipt to `workspace:agent-outcomes`.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  VERCEL_PROJECTS_OBJECT_ID,
  withVercelProjectsDirectory,
} from "@/lib/workspace-add-ons";
import {
  normalizeVercelProject,
  pickVercelProjects,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
  withVercelQuery,
} from "@/lib/workspace-add-on-deployments";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAccountProjects(account) {
  const url = withVercelQuery(`${resolveVercelApiBaseUrl(process.env)}/v9/projects`, { teamId: account.teamId, limit: "100" });
  const response = await fetchWithTimeout(url, {
    headers: { authorization: account.header, accept: "application/json" },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const payload = await response.json().catch(() => null);
  return { ok: true, projects: pickVercelProjects(payload).map((item) => normalizeVercelProject(item)).filter(Boolean) };
}

async function POST(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const projectId = clean(body.projectId);
  const linkAll = body.all === true;
  if (!projectId && !linkAll) return jsonError("projectId (or all:true) is required", 400);

  const account = resolveVercelAccountAuth(process.env);
  if (!account.ready) {
    return jsonError("Vercel account auth is not connected", 422, {
      providerId: "vercel",
      missingEnv: account.missingEnv,
    });
  }

  const listed = await fetchAccountProjects(account);
  if (!listed.ok) {
    return jsonError(`Vercel projects request failed (HTTP ${listed.status})`, 502, { providerId: "vercel" });
  }
  const selected = linkAll
    ? listed.projects
    : listed.projects.filter((project) => project.id === projectId);
  if (!selected.length) {
    return jsonError(`no Vercel project ${projectId || ""} visible to this account`, 404, { providerId: "vercel" });
  }

  const now = new Date().toISOString();
  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withVercelProjectsDirectory(currentConfig, { projects: selected, linkedAt: now });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-link",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: selected.map((project) => ({
      objectId: VERCEL_PROJECTS_OBJECT_ID,
      objectType: "custom",
      rowName: project.name,
    })),
    changedFields: [`dataModel.${VERCEL_PROJECTS_OBJECT_ID}`],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: linkAll
      ? `${selected.length} Vercel project${selected.length === 1 ? "" : "s"} linked as governed Data Model records.`
      : `Vercel project ${selected[0].name} linked as a governed Data Model record.`,
    nextActions: [
      "Open the Vercel Projects object in the Data Model to deploy, manage, or link records to workflows.",
    ],
  });

  return NextResponse.json({
    ok: true,
    providerId: "vercel",
    objectId: VERCEL_PROJECTS_OBJECT_ID,
    linked: selected.map((project) => ({ projectId: project.id, name: project.name })),
    workspaceConfig: persisted,
    receiptId: receipt.receiptId,
  });
}

export { POST };
