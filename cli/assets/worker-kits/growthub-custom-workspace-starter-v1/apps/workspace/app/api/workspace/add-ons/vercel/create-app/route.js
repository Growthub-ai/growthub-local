/**
 * GET /api/workspace/add-ons/vercel/create-app
 *
 * Preflight for the guided "Create Production App" flow: server-side connect
 * status for both accounts (GitHub + Vercel) and the pure checklist shape the
 * stepper renders. Read-only — no mutation, no receipts, no secrets in the
 * response (login + env ref NAMES only).
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import {
  deriveCreateAppChecklist,
  resolveGithubAccountAuth,
  resolveGithubApiBaseUrl,
} from "@/lib/workspace-add-on-create-app";
import { findVercelProjectsObject } from "@/lib/workspace-add-ons";
import { APP_REGISTRY_OBJECT_ID } from "@/lib/workspace-app-registry";
import { resolveVercelAccountAuth } from "@/lib/workspace-add-on-deployments";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

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

function latestCreateAppRow(workspaceConfig) {
  const object = findVercelProjectsObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows
    .filter((row) => String(row?.gitProvider || "").trim() === "github" && String(row?.gitRepo || "").trim())
    .sort((a, b) => String(b?.updatedAt || b?.linkedAt || "").localeCompare(String(a?.updatedAt || a?.linkedAt || "")))[0] || null;
}

function stateFromRow(row) {
  if (!row) return { repo: null, project: null, deployment: null, published: false };
  const gitRepo = String(row.gitRepo || "").trim();
  const repoName = gitRepo.split("/").pop() || String(row.Name || "").trim();
  const repo = gitRepo ? {
    id: Number(row.gitRepoId) || undefined,
    fullName: gitRepo,
    name: repoName,
    owner: gitRepo.includes("/") ? gitRepo.split("/")[0] : "",
    htmlUrl: String(row.gitRepoUrl || "").trim(),
    defaultBranch: String(row.gitBranch || "").trim() || "main",
    private: true,
  } : null;
  const projectId = String(row.projectId || "").trim();
  const project = projectId ? {
    id: projectId,
    name: String(row.Name || projectId).trim(),
    framework: String(row.framework || "").trim(),
    gitProvider: String(row.gitProvider || "").trim(),
    gitRepo,
    gitRepoId: String(row.gitRepoId || "").trim(),
    gitBranch: String(row.gitBranch || "").trim(),
    latestDeploymentId: String(row.latestDeploymentId || "").trim(),
    latestDeploymentUrl: String(row.latestDeploymentUrl || "").trim(),
    latestDeploymentState: String(row.latestDeploymentState || "").trim(),
  } : null;
  const deploymentId = String(row.latestDeploymentId || "").trim();
  const deployment = deploymentId ? {
    deploymentId,
    url: String(row.latestDeploymentUrl || "").trim(),
    readyState: String(row.latestDeploymentState || row.lastDeployStatus || "").trim(),
  } : null;
  return { repo, project, deployment, published: Boolean(projectId && deploymentId && String(row.lastDeployProof || "").trim()) };
}

function appRegistryRepoForRequest(workspaceConfig, request) {
  const url = new URL(request.url);
  const wantedApp = String(url.searchParams.get("app") || "workspace").trim();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((item) => String(item?.id || "").trim() === APP_REGISTRY_OBJECT_ID || String(item?.objectType || "").trim() === "app-surface");
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  const row = rows.find((item) => String(item?.appId || item?.Name || "").trim() === wantedApp) || null;
  const gitRepo = String(row?.githubRepo || row?.githubRepoUrl || row?.repositoryUrl || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/^\/+|\/+$/g, "");
  if (!gitRepo || !gitRepo.includes("/")) return null;
  return {
    repo: {
      fullName: gitRepo,
      name: gitRepo.split("/").pop(),
      owner: gitRepo.split("/")[0],
      htmlUrl: String(row?.githubRepoUrl || row?.repositoryUrl || `https://github.com/${gitRepo}`).trim(),
      defaultBranch: String(row?.gitBranch || "main").trim(),
      private: true,
    },
    row,
  };
}

async function GET(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const githubAuth = resolveGithubAccountAuth(process.env);
  let github = { connected: false, login: "", missingEnv: githubAuth.missingEnv };
  if (githubAuth.ready) {
    try {
      const response = await fetchWithTimeout(`${resolveGithubApiBaseUrl(process.env)}/user`, {
        headers: { authorization: githubAuth.header, accept: "application/vnd.github+json" },
      });
      const payload = await response.json().catch(() => null);
      github = { connected: response.ok, login: response.ok ? String(payload?.login || "") : "", missingEnv: [] };
    } catch {
      github = { connected: false, login: "", missingEnv: [] };
    }
  }

  const vercelAuth = resolveVercelAccountAuth(process.env);
  const vercel = { connected: vercelAuth.ready, missingEnv: vercelAuth.missingEnv, teamId: vercelAuth.teamId };
  const workspaceConfig = await readWorkspaceConfig();
  const row = latestCreateAppRow(workspaceConfig);
  const rowState = stateFromRow(row);
  const appRepoState = rowState.repo ? null : appRegistryRepoForRequest(workspaceConfig, request);
  const state = appRepoState ? { ...rowState, repo: appRepoState.repo } : rowState;

  return NextResponse.json({
    ok: true,
    github,
    vercel,
    ...state,
    row: row || appRepoState?.row || null,
    checklist: deriveCreateAppChecklist({ github, vercel, ...state }),
  });
}

export { GET };
