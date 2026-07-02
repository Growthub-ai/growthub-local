/**
 * POST /api/workspace/add-ons/vercel/deploy
 *
 * Governed one-click Vercel deploy. The deploy request is built by the pure
 * adapter (`workspace-add-on-deployments.js`) from non-secret project routing
 * metadata, executed server-side with the env-resolved bearer token, and the
 * resulting proof (deployment id, url, readyState) is merged onto the owning
 * `vercel-projects` Data Model row — auto-linking the project first if it is
 * not yet a governed record, so a deploy is never unaccounted for. Every
 * outcome (published or blocked) emits a receipt to `workspace:agent-outcomes`.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  VERCEL_PROJECTS_OBJECT_ID,
  findVercelProjectRow,
  withVercelProjectPatch,
  withVercelProjectsDirectory,
} from "@/lib/workspace-add-ons";
import {
  buildVercelDeployRequest,
  normalizeVercelDeployment,
  normalizeVercelProject,
  pickVercelDeployments,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
  withVercelQuery,
} from "@/lib/workspace-add-on-deployments";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 15000;

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

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Fetch the live project (fresh git link + latest deployment metadata). */
async function fetchProject(account, baseUrl, projectId) {
  const url = withVercelQuery(`${baseUrl}/v9/projects/${encodeURIComponent(projectId)}`, { teamId: account.teamId });
  try {
    const response = await fetchWithTimeout(url, {
      headers: { authorization: account.header, accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeVercelProject(await readJsonSafe(response));
  } catch {
    return null;
  }
}

/** Fallback: latest deployment id for the redeploy lane. */
async function fetchLatestDeploymentId(account, baseUrl, projectId) {
  const url = withVercelQuery(`${baseUrl}/v6/deployments`, { teamId: account.teamId, projectId, limit: "1" });
  try {
    const response = await fetchWithTimeout(url, {
      headers: { authorization: account.header, accept: "application/json" },
    });
    if (!response.ok) return "";
    const deployments = pickVercelDeployments(await readJsonSafe(response));
    return clean(deployments[0]?.uid || deployments[0]?.id || "");
  } catch {
    return "";
  }
}

async function blockedReceipt(rowName, summary, violationCode, nextAction) {
  await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-deploy",
    lane: "server-authoritative",
    outcomeStatus: "blocked",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: VERCEL_PROJECTS_OBJECT_ID, objectType: "custom", rowName }],
    summary,
    policyVerdict: { ok: false, violationCodes: [violationCode] },
    nextActions: [nextAction],
  });
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
  const target = clean(body.target) || "production";
  if (!projectId) return jsonError("projectId is required", 400);

  const account = resolveVercelAccountAuth(process.env);
  if (!account.ready) {
    await blockedReceipt(projectId, "Vercel deploy blocked: account credentials are not connected.", "provider_account_credentials_missing", "Connect the Vercel provider account from the Add-ons Marketplace, then retry the deploy.");
    return jsonError("Vercel account auth is not connected", 422, {
      providerId: "vercel",
      missingEnv: account.missingEnv,
    });
  }

  const baseUrl = resolveVercelApiBaseUrl(process.env);
  const currentConfig = await readWorkspaceConfig();
  const linkedRow = findVercelProjectRow(currentConfig, projectId);
  const liveProject = await fetchProject(account, baseUrl, projectId);
  if (!liveProject && !linkedRow) {
    await blockedReceipt(projectId, `Vercel deploy blocked: project ${projectId} is not visible to this account.`, "vercel_project_not_found", "Check the project id and the token's account/team scope, then retry.");
    return jsonError(`no Vercel project ${projectId} visible to this account`, 404, { providerId: "vercel" });
  }
  const project = liveProject || {
    id: clean(linkedRow.projectId),
    name: clean(linkedRow.Name),
    gitProvider: clean(linkedRow.gitProvider),
    gitRepoId: clean(linkedRow.gitRepoId),
    gitBranch: clean(linkedRow.gitBranch),
    latestDeploymentId: clean(linkedRow.latestDeploymentId),
  };
  if (!project.latestDeploymentId && !(project.gitProvider && project.gitRepoId)) {
    project.latestDeploymentId = await fetchLatestDeploymentId(account, baseUrl, projectId);
  }

  const deployRequest = buildVercelDeployRequest({ project, baseUrl, teamId: account.teamId, target });
  if (!deployRequest.ok) {
    await blockedReceipt(project.name || projectId, `Vercel deploy blocked: ${deployRequest.reason}.`, "vercel_deploy_route_unavailable", "Deploy the project once from the Vercel dashboard or CLI so a git link or previous deployment exists, then retry here.");
    return jsonError(deployRequest.reason, 409, { providerId: "vercel", projectId });
  }

  let deployment = null;
  let failureDetail = "";
  try {
    const response = await fetchWithTimeout(deployRequest.url, {
      method: "POST",
      headers: { authorization: account.header, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(deployRequest.body),
    });
    const payload = await readJsonSafe(response);
    if (response.ok) {
      deployment = normalizeVercelDeployment(payload || {});
    } else {
      failureDetail = clean(payload?.error?.message || `HTTP ${response.status}`);
    }
  } catch (error) {
    failureDetail = clean(error?.message || "network error");
  }

  const now = new Date().toISOString();
  if (!deployment) {
    await blockedReceipt(project.name || projectId, `Vercel deploy failed: ${failureDetail || "no deployment returned"}.`, "vercel_deploy_failed", "Check the Vercel dashboard for project state, then retry the deploy.");
    return jsonError(`Vercel deploy failed: ${failureDetail || "no deployment returned"}`, 502, {
      providerId: "vercel",
      projectId,
      lane: deployRequest.lane,
    });
  }

  // Auto-link (idempotent upsert), then merge the deploy proof onto the row —
  // a one-click deploy always lands as a governed Data Model record.
  const withDirectory = withVercelProjectsDirectory(currentConfig, {
    projects: [liveProject || project],
    linkedAt: linkedRow?.linkedAt || now,
  });
  const { config: patchedConfig } = withVercelProjectPatch(withDirectory, {
    projectId,
    patch: {
      lastDeployRequestedAt: now,
      lastDeployStatus: deployment.readyState || "QUEUED",
      lastDeployProof: `Deployment ${deployment.deploymentId} created via ${deployRequest.lane}${deployment.url ? ` → ${deployment.url}` : ""}.`,
      latestDeploymentId: deployment.deploymentId,
      ...(deployment.url ? { latestDeploymentUrl: deployment.url } : {}),
      ...(deployment.readyState ? { latestDeploymentState: deployment.readyState } : {}),
      updatedAt: now,
    },
  });
  const persisted = await writeWorkspaceConfig({ dataModel: patchedConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-deploy",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: VERCEL_PROJECTS_OBJECT_ID, objectType: "custom", rowName: project.name || projectId }],
    changedFields: [`dataModel.${VERCEL_PROJECTS_OBJECT_ID}.${project.name || projectId}`],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `Vercel deployment ${deployment.deploymentId} created for ${project.name || projectId} (${deployRequest.lane}, ${deployment.readyState}).`,
    nextActions: [
      deployment.url
        ? `Track the deployment at ${deployment.url} or from the project's Data Model record.`
        : "Track the deployment from the project's Data Model record.",
    ],
  });

  return NextResponse.json({
    ok: true,
    providerId: "vercel",
    projectId,
    objectId: VERCEL_PROJECTS_OBJECT_ID,
    lane: deployRequest.lane,
    deployment,
    workspaceConfig: persisted,
    receiptId: receipt.receiptId,
  });
}

export { POST };
