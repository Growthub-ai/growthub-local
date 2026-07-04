/**
 * Guided create-app adapter — pure, env-injectable helpers for the governed
 * "Create Production App" flow (GitHub private repo → starter seed → Vercel
 * project linked at creation → initial deploy → atomic governed record).
 *
 * Mirrors `workspace-add-on-deployments.js`: everything here is deterministic
 * and offline-testable; routes own the actual fetch + receipts. The ONLY
 * workspace-config write in the whole chain is the existing governed deploy
 * route (withVercelProjectsDirectory/withVercelProjectPatch → the
 * schema-validating writeWorkspaceConfig) — repo/project creation persists
 * nothing, so a half-finished chain never leaks into the workspace.
 *
 * Endpoint contracts:
 *   GitHub REST: GET /user · POST /user/repos · POST /orgs/{org}/repos ·
 *                PUT /repos/{owner}/{repo}/contents/{path}
 *   Vercel REST: POST /v11/projects with gitRepository {type:"github", repo}
 */

import { readEnvVar } from "./server-secrets.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_TOKEN_ENV = "GITHUB_TOKEN";
const GITHUB_API_URL_ENV = "GITHUB_API_URL";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/**
 * Resolve the GitHub API base URL (env override → official base). Mirrors
 * VERCEL_API_URL on the deployments adapter — used for GitHub Enterprise
 * hosts and for offline QA smokes against a local mock provider.
 */
function resolveGithubApiBaseUrl(env = process.env) {
  return clean(readEnvVar(GITHUB_API_URL_ENV, env)?.value || "").replace(/\/+$/, "") || GITHUB_API_BASE_URL;
}

/**
 * Resolve the GitHub credential from the run env. `header` carries the secret
 * — server-side use only. Same honesty shape as resolveVercelAccountAuth.
 */
function resolveGithubAccountAuth(env = process.env) {
  const token = clean(readEnvVar(GITHUB_TOKEN_ENV, env)?.value || "");
  return {
    ready: Boolean(token),
    header: token ? `Bearer ${token}` : null,
    requiredEnv: [GITHUB_TOKEN_ENV],
    missingEnv: token ? [] : [GITHUB_TOKEN_ENV],
    resolvedEnv: token ? [GITHUB_TOKEN_ENV] : [],
  };
}

/** Repo names must be slug-safe; derive one deterministically from any label. */
function slugifyRepoName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
}

/** POST /user/repos (personal) or /orgs/{org}/repos (org). Private-by-default. */
function buildGithubRepoCreateRequest({ name, org = "", baseUrl = GITHUB_API_BASE_URL } = {}) {
  const repoName = slugifyRepoName(name);
  if (!repoName) return { ok: false, reason: "repository name is required" };
  const base = clean(baseUrl).replace(/\/+$/, "") || GITHUB_API_BASE_URL;
  const owner = clean(org);
  return {
    ok: true,
    url: owner ? `${base}/orgs/${encodeURIComponent(owner)}/repos` : `${base}/user/repos`,
    body: {
      name: repoName,
      private: true,
      auto_init: true,
      description: "Production app created from a governed Growthub workspace.",
    },
  };
}

/** Normalize the repo payload into NON-SECRET routing metadata. */
function normalizeGithubRepo(payload = {}) {
  const id = payload?.id;
  const fullName = clean(payload?.full_name);
  if (!Number.isFinite(id) || !fullName) return null;
  return {
    id,
    fullName,
    name: clean(payload.name),
    owner: clean(payload?.owner?.login),
    htmlUrl: clean(payload.html_url),
    defaultBranch: clean(payload.default_branch) || "main",
    private: payload.private === true,
  };
}

/**
 * Minimal static starter the initial deployment serves — enough for “Visit
 * Production Site” to show a real page, nothing framework-opinionated.
 */
function starterAppFiles({ appName = "Production App" } = {}) {
  const title = clean(appName) || "Production App";
  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `    <title>${title}</title>`,
    "    <style>",
    "      body { font-family: ui-sans-serif, system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }",
    "      main { text-align: center; padding: 2rem; }",
    "      h1 { font-size: 1.5rem; margin-bottom: .5rem; }",
    "      p { color: #a1a1aa; }",
    "    </style>",
    "  </head>",
    "  <body>",
    "    <main>",
    `      <h1>${title}</h1>`,
    "      <p>Live on Vercel — created and governed from your Growthub workspace.</p>",
    "    </main>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
  return [
    {
      path: "index.html",
      message: "feat: governed workspace starter page",
      contentBase64: Buffer.from(html, "utf8").toString("base64"),
    },
  ];
}

/** PUT /repos/{owner}/{repo}/contents/{path} — seed one starter file. */
function buildGithubSeedRequest({ repoFullName, file, branch = "", baseUrl = GITHUB_API_BASE_URL } = {}) {
  const repo = clean(repoFullName);
  const filePath = clean(file?.path);
  if (!repo || !filePath || !file?.contentBase64) return { ok: false, reason: "repo, path, and content are required" };
  const base = clean(baseUrl).replace(/\/+$/, "") || GITHUB_API_BASE_URL;
  return {
    ok: true,
    url: `${base}/repos/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
    body: {
      message: clean(file.message) || `feat: add ${filePath}`,
      content: file.contentBase64,
      ...(clean(branch) ? { branch: clean(branch) } : {}),
    },
  };
}

/**
 * POST /v11/projects — create the Vercel project with the GitHub repo linked
 * at creation time (requires the Vercel GitHub App on the account/org; the
 * route maps that failure to actionable guidance).
 */
function buildVercelProjectCreateRequest({ name, repoFullName, framework = null, baseUrl = "https://api.vercel.com", teamId = "" } = {}) {
  const projectName = slugifyRepoName(name);
  const repo = clean(repoFullName);
  if (!projectName || !repo) return { ok: false, reason: "project name and linked repository are required" };
  const base = clean(baseUrl).replace(/\/+$/, "") || "https://api.vercel.com";
  const team = clean(teamId);
  return {
    ok: true,
    url: `${base}/v11/projects${team ? `?teamId=${encodeURIComponent(team)}` : ""}`,
    body: {
      name: projectName,
      ...(framework ? { framework: clean(framework) } : {}),
      gitRepository: { type: "github", repo },
    },
  };
}

/**
 * Map raw GitHub failures to the specific, actionable guidance the flow UI
 * surfaces (never a bare status code).
 */
function actionableGithubError(status, payload = {}) {
  const detail = clean(payload?.message);
  if (status === 401) return "GitHub token was rejected — generate a new token and reconnect GitHub.";
  if (status === 403) return "GitHub token lacks permission — it needs the repo scope (classic) or Contents + Administration read/write (fine-grained).";
  if (status === 404) return "GitHub org not found or the token cannot create repositories there — check the org name and token owner.";
  if (status === 422 && /name already exists/i.test(detail)) return "A repository with that name already exists — pick a different name.";
  return `GitHub request failed (HTTP ${status}${detail ? `: ${detail}` : ""}).`;
}

/** Same mapping for Vercel project creation failures. */
function actionableVercelProjectError(status, payload = {}) {
  const detail = clean(payload?.error?.message);
  if (status === 401 || status === 403) {
    if (/git/i.test(detail) || /repo/i.test(detail)) {
      return "Vercel could not link the repository — install the Vercel GitHub App on the account/org that owns the repo, then retry.";
    }
    return "Vercel token was rejected — reconnect the Vercel provider account.";
  }
  if (status === 409 || /already exists/i.test(detail)) return "A Vercel project with that name already exists — pick a different name.";
  if (/git/i.test(detail) || /repository/i.test(detail)) {
    return `Vercel could not link the repository (${detail}) — confirm the Vercel GitHub App is installed for that repo, then retry.`;
  }
  return `Vercel project creation failed (HTTP ${status}${detail ? `: ${detail}` : ""}).`;
}

const CREATE_APP_STEPS = ["github-account", "github-repo", "vercel-account", "vercel-project", "initial-deploy", "publish"];

/**
 * Pure checklist derivation for the guided flow — one entry per journey step,
 * green ONLY on real proof (ids/urls returned by live responses). The UI and
 * tests share this so progress can never be optimistic.
 */
function deriveCreateAppChecklist({ github = {}, repo = null, vercel = {}, project = null, deployment = null, published = false } = {}) {
  const githubReady = github.connected === true || github.ready === true;
  const vercelReady = vercel.connected === true || vercel.ready === true;
  const repoDone = Boolean(repo?.fullName);
  const projectDone = Boolean(project?.id);
  const deployDone = Boolean(deployment?.deploymentId);
  const steps = [
    { id: "github-account", label: githubReady && github.login ? `GitHub connected as @${github.login}` : "Connect GitHub account", done: githubReady },
    { id: "github-repo", label: repoDone ? `Private repo ${repo.fullName} created` : "Create private GitHub repository", done: repoDone },
    { id: "vercel-account", label: "Connect Vercel account", done: vercelReady },
    { id: "vercel-project", label: projectDone ? `Vercel project ${project.name || project.id} created + repo linked` : "Create Vercel project linked to the repo", done: projectDone },
    { id: "initial-deploy", label: deployDone ? `Initial deployment ${deployment.readyState || "created"}${deployment.url ? ` → ${deployment.url}` : ""}` : "Deploy starter and validate live deployment", done: deployDone },
    { id: "publish", label: published ? "Published as a governed Data Model record" : "Publish & validate to workspace", done: published },
  ];
  const nextStep = steps.find((step) => !step.done)?.id || "";
  return { steps, nextStep, complete: steps.every((step) => step.done) };
}

export {
  CREATE_APP_STEPS,
  GITHUB_API_BASE_URL,
  GITHUB_API_URL_ENV,
  GITHUB_TOKEN_ENV,
  resolveGithubApiBaseUrl,
  actionableGithubError,
  actionableVercelProjectError,
  buildGithubRepoCreateRequest,
  buildGithubSeedRequest,
  buildVercelProjectCreateRequest,
  deriveCreateAppChecklist,
  normalizeGithubRepo,
  resolveGithubAccountAuth,
  slugifyRepoName,
  starterAppFiles,
};
