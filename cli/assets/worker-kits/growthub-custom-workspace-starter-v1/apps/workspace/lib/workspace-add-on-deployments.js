/**
 * Vercel deployments adapter — pure, env-injectable helpers for the governed
 * one-click deploy lane (`/api/workspace/add-ons/vercel/*`).
 *
 * Mirrors `workspace-add-on-scheduler.js` (the QStash adapter): everything here
 * is deterministic and offline-testable; routes own the actual fetch + the
 * workspace-config write + the outcome receipt. Secrets resolve through the
 * canonical `server-secrets.js` entry and travel ONLY inside request headers —
 * never in returned rows, receipts, or browser payloads.
 *
 * Endpoint contract (Vercel REST API):
 *   GET  /v9/projects            — list projects (?teamId= for team tokens)
 *   GET  /v6/deployments         — latest deployment (?projectId=&limit=1)
 *   POST /v13/deployments        — create deployment; `gitSource` builds from
 *                                  the linked repo, `deploymentId` redeploys
 *                                  the previous build (?forceNew=1)
 */

import { readEnvVar } from "./server-secrets.js";

const VERCEL_API_BASE_URL = "https://api.vercel.com";
const VERCEL_TOKEN_ENV = "VERCEL_TOKEN";
const VERCEL_TEAM_ENV = "VERCEL_TEAM_ID";
const VERCEL_API_URL_ENV = "VERCEL_API_URL";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Resolve the API base URL (env override → official base). */
function resolveVercelApiBaseUrl(env = process.env) {
  return clean(readEnvVar(VERCEL_API_URL_ENV, env)?.value || "").replace(/\/+$/, "") || VERCEL_API_BASE_URL;
}

/**
 * Resolve the Vercel account credential from the run env. `header` carries the
 * secret — server-side use only. `ready:false` when the token ref is absent.
 */
function resolveVercelAccountAuth(env = process.env) {
  const token = clean(readEnvVar(VERCEL_TOKEN_ENV, env)?.value || "");
  const teamId = clean(readEnvVar(VERCEL_TEAM_ENV, env)?.value || "");
  return {
    ready: Boolean(token),
    header: token ? `Bearer ${token}` : null,
    teamId,
    requiredEnv: [VERCEL_TOKEN_ENV],
    missingEnv: token ? [] : [VERCEL_TOKEN_ENV],
    resolvedEnv: token ? [VERCEL_TOKEN_ENV] : [],
  };
}

/** Append query params (teamId, forceNew, …) to an API path deterministically. */
function withVercelQuery(url, params = {}) {
  const entries = Object.entries(params)
    .map(([key, value]) => [key, clean(value)])
    .filter(([, value]) => value);
  if (!entries.length) return url;
  const suffix = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return `${url}${url.includes("?") ? "&" : "?"}${suffix}`;
}

/**
 * Normalize a raw Vercel project payload into the NON-SECRET shape the
 * governed directory row is built from. Unknown fields are dropped, never
 * forwarded.
 */
function normalizeVercelProject(item = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const id = clean(item.id || item.projectId);
  const name = clean(item.name || id);
  if (!id || !name) return null;
  const link = item.link && typeof item.link === "object" ? item.link : {};
  const latest = Array.isArray(item.latestDeployments) && item.latestDeployments.length ? item.latestDeployments[0] : null;
  return {
    id,
    name,
    framework: clean(item.framework),
    gitProvider: clean(link.type),
    gitRepo: link.org && link.repo ? `${clean(link.org)}/${clean(link.repo)}` : "",
    gitRepoId: clean(link.repoId ?? ""),
    gitBranch: clean(link.productionBranch || item.productionBranch || ""),
    latestDeploymentId: clean(latest?.id || latest?.uid || ""),
    latestDeploymentUrl: latest?.url ? `https://${clean(latest.url).replace(/^https?:\/\//i, "")}` : "",
    latestDeploymentState: clean(latest?.readyState || latest?.state || ""),
    // Per-project dashboard paths need the account slug, which the projects
    // API does not return; surfaces fall back to the provider consoleUrl.
    dashboardUrl: "",
  };
}

/** Extract the projects array from the /v9/projects response envelope. */
function pickVercelProjects(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.projects)) return payload.projects;
  return [];
}

/** Extract the deployments array from the /v6/deployments response envelope. */
function pickVercelDeployments(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deployments)) return payload.deployments;
  return [];
}

/**
 * Build the one-click deploy request for a linked project (pure).
 *
 * Lane 1 (git): the project has a linked repo → `gitSource` referencing the
 * repo + production branch builds from the latest commit.
 * Lane 2 (redeploy): no usable git link → redeploy the latest deployment via
 * `deploymentId` (+ forceNew so the previous build is not simply aliased).
 *
 * Returns { ok, url, body, lane } or { ok:false, reason } when neither lane
 * has enough routing metadata — the route surfaces that as an actionable 409.
 */
function buildVercelDeployRequest({ project = {}, baseUrl = VERCEL_API_BASE_URL, teamId = "", target = "production" } = {}) {
  const name = clean(project.name || project.Name);
  const projectId = clean(project.id || project.projectId);
  if (!name || !projectId) return { ok: false, reason: "project name and id are required" };
  const endpoint = withVercelQuery(`${clean(baseUrl).replace(/\/+$/, "") || VERCEL_API_BASE_URL}/v13/deployments`, {
    teamId,
    forceNew: "1",
  });
  const gitProvider = clean(project.gitProvider || project.link?.type);
  const gitRepoId = clean(project.gitRepoId ?? project.link?.repoId ?? "");
  const gitBranch = clean(project.gitBranch || project.link?.productionBranch || "");
  if (gitProvider && gitRepoId) {
    return {
      ok: true,
      lane: "git-source",
      url: endpoint,
      body: {
        name,
        project: projectId,
        target,
        gitSource: {
          type: gitProvider,
          // GitHub repo ids are numeric in the deployments contract.
          repoId: /^\d+$/.test(gitRepoId) ? Number(gitRepoId) : gitRepoId,
          ref: gitBranch || "main",
        },
      },
    };
  }
  const latestDeploymentId = clean(project.latestDeploymentId);
  if (latestDeploymentId) {
    return {
      ok: true,
      lane: "redeploy",
      url: endpoint,
      body: {
        name,
        deploymentId: latestDeploymentId,
        target,
      },
    };
  }
  return {
    ok: false,
    reason: "project has no linked git repository and no previous deployment to redeploy — deploy it once from the Vercel dashboard or CLI, then one-click deploys unlock here",
  };
}

/** Normalize the /v13/deployments response into non-secret proof fields. */
function normalizeVercelDeployment(payload = {}) {
  const id = clean(payload.id || payload.uid);
  if (!id) return null;
  const url = clean(payload.url);
  return {
    deploymentId: id,
    url: url ? `https://${url.replace(/^https?:\/\//i, "")}` : "",
    readyState: clean(payload.readyState || payload.state || "QUEUED"),
    createdAt: Number.isFinite(payload.createdAt) ? new Date(payload.createdAt).toISOString() : "",
    inspectorUrl: clean(payload.inspectorUrl || ""),
  };
}

/** Row patch recording a requested deploy on the owning project row. */
function vercelDeployProofPatch(deployment, requestedAt) {
  const proof = deployment
    ? `Deployment ${deployment.deploymentId} created (${deployment.readyState}${deployment.url ? ` → ${deployment.url}` : ""}).`
    : "";
  return {
    lastDeployRequestedAt: clean(requestedAt),
    lastDeployStatus: deployment ? clean(deployment.readyState || "QUEUED") : "failed",
    lastDeployProof: proof,
    ...(deployment?.deploymentId ? { latestDeploymentId: deployment.deploymentId } : {}),
    ...(deployment?.url ? { latestDeploymentUrl: deployment.url } : {}),
    ...(deployment?.readyState ? { latestDeploymentState: deployment.readyState } : {}),
    updatedAt: clean(requestedAt),
  };
}

export {
  VERCEL_API_BASE_URL,
  VERCEL_API_URL_ENV,
  VERCEL_TEAM_ENV,
  VERCEL_TOKEN_ENV,
  buildVercelDeployRequest,
  normalizeVercelDeployment,
  normalizeVercelProject,
  pickVercelDeployments,
  pickVercelProjects,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
  vercelDeployProofPatch,
  withVercelQuery,
};
