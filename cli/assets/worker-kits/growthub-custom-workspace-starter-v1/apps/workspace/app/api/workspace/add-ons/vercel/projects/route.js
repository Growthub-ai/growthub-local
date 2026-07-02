/**
 * GET /api/workspace/add-ons/vercel/projects
 *
 * Server-side Vercel project discovery for the governed one-click deploy lane.
 * Lists the account's projects (normalized, NON-SECRET fields only) and joins
 * each against the governed `vercel-projects` Data Model directory so surfaces
 * can render link + deploy state in one read. The browser never talks to the
 * Vercel API; the bearer token resolves through server-secrets refs only.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { findVercelProjectRow, getMarketplaceProduct } from "@/lib/workspace-add-ons";
import {
  normalizeVercelProject,
  pickVercelProjects,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
  withVercelQuery,
} from "@/lib/workspace-add-on-deployments";
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

async function GET(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const account = resolveVercelAccountAuth(process.env);
  if (!account.ready) {
    return jsonError("Vercel account auth is not connected", 422, {
      providerId: "vercel",
      missingEnv: account.missingEnv,
      resolvedEnv: account.resolvedEnv,
      projects: [],
    });
  }

  const product = getMarketplaceProduct("vercel", "vercel-deployments");
  const url = withVercelQuery(`${resolveVercelApiBaseUrl(process.env)}/v9/projects`, { teamId: account.teamId, limit: "100" });
  let payload = null;
  try {
    const response = await fetchWithTimeout(url, {
      headers: { authorization: account.header, accept: "application/json" },
    });
    if (!response.ok) {
      return jsonError(`Vercel projects request failed (HTTP ${response.status})`, 502, { providerId: "vercel", projects: [] });
    }
    payload = await response.json().catch(() => null);
  } catch (error) {
    return jsonError(error?.message || "Vercel projects request failed", 502, { providerId: "vercel", projects: [] });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const hasMore = Boolean(payload?.pagination?.next);
  const projects = pickVercelProjects(payload)
    .map((item) => normalizeVercelProject(item))
    .filter(Boolean)
    .map((project) => {
      const linkedRow = findVercelProjectRow(workspaceConfig, project.id);
      return {
        ...project,
        linked: Boolean(linkedRow),
        linkedWorkflowRef: linkedRow?.linkedWorkflowRef || "",
        lastDeployStatus: linkedRow?.lastDeployStatus || "",
        lastDeployRequestedAt: linkedRow?.lastDeployRequestedAt || "",
      };
    });

  return NextResponse.json({
    ok: true,
    providerId: "vercel",
    productId: product?.productId || "vercel-deployments",
    projects,
    // Never truncate silently: true when the account has more projects than
    // this discovery page (limit=100).
    hasMore,
    resolvedEnv: account.resolvedEnv,
  });
}

export { GET };
