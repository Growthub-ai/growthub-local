#!/usr/bin/env node
/**
 * Offline end-to-end QA smoke for the Vercel marketplace provider (PR #265).
 *
 * Drives the REAL exported workspace server over HTTP — the exact requests the
 * marketplace UI and guided create-app flow produce — against a local mock of
 * the GitHub + Vercel APIs (via the product's own GITHUB_API_URL /
 * VERCEL_API_URL overrides), then asserts persistence truth in the workspace's
 * growthub.config.json and the workspace:agent-outcomes receipt stream.
 *
 * Covered journeys:
 *   A. Link Existing: connect provider → install product → discover projects
 *      → link → one-click deploy → governed record with proof
 *   B. Guided create-app: connect GitHub → private repo + starter seed →
 *      Vercel project linked at creation → initial deploy → governed record
 *   C. VALIDATION GATE (negative): forced provider failures at the project and
 *      deploy steps must leave workspace config byte-identical (no partial
 *      records) while still returning actionable guidance.
 *
 * Usage:
 *   1. Export + install the kit workspace app (see docs), create .env.local:
 *        VERCEL_API_URL / GITHUB_API_URL → this script's mock (started below)
 *   2. Start the workspace app (next dev) with that env.
 *   3. GROWTHUB_WORKSPACE_URL=http://localhost:3000 \
 *      GROWTHUB_SMOKE_MOCK_PORT=4949 \
 *      node scripts/smoke-vercel-marketplace-localhost.mjs [--serve-only]
 *
 * `--serve-only` starts ONLY the mock provider API (for manual QA in a
 * browser); without it the script also drives the full journey + assertions.
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const WORKSPACE_URL = (process.env.GROWTHUB_WORKSPACE_URL || "http://localhost:3000").replace(/\/+$/, "");
const MOCK_PORT = Number(process.env.GROWTHUB_SMOKE_MOCK_PORT || 4949);
const WORKSPACE_DIR = process.env.GROWTHUB_WORKSPACE_DIR || "";
const SERVE_ONLY = process.argv.includes("--serve-only");

/* ------------------------------------------------------------------ */
/* Mock GitHub + Vercel provider API                                    */
/* ------------------------------------------------------------------ */

const state = {
  repos: new Map(),
  projects: new Map([
    ["prj_existing", {
      id: "prj_existing",
      name: "existing-site",
      framework: "nextjs",
      link: { type: "github", repoId: 777001, org: "acme", repo: "existing-site", productionBranch: "main" },
      latestDeployments: [{ uid: "dpl_prev", url: "existing-site-prev.mock.vercel.app", readyState: "READY" }],
    }],
  ]),
  deployments: new Map(),
  nextRepoId: 900001,
  nextDeployment: 1,
  // failure injection: project names containing these markers force failures
  FAIL_PROJECT_MARKER: "failproject",
  FAIL_DEPLOY_MARKER: "faildeploy",
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

function requireAuth(req, res) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ") && !auth.startsWith("Basic ")) {
    json(res, 401, { message: "Requires authentication" });
    return false;
  }
  return true;
}

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  const p = url.pathname;
  if (!requireAuth(req, res)) return;

  /* ---- GitHub surface ---- */
  if (req.method === "GET" && p === "/user") {
    return json(res, 200, { login: "qa-operator", id: 1 });
  }
  if (req.method === "POST" && (p === "/user/repos" || /^\/orgs\/[^/]+\/repos$/.test(p))) {
    const body = await readBody(req);
    const name = String(body.name || "");
    if (state.repos.has(name)) return json(res, 422, { message: "name already exists on this account" });
    const repo = {
      id: state.nextRepoId++,
      name,
      full_name: `qa-operator/${name}`,
      owner: { login: "qa-operator" },
      html_url: `https://github.mock/qa-operator/${name}`,
      default_branch: "main",
      private: body.private === true,
    };
    state.repos.set(name, repo);
    return json(res, 201, repo);
  }
  if (req.method === "PUT" && /^\/repos\/[^/]+\/[^/]+\/contents\//.test(p)) {
    return json(res, 201, { content: { path: p.split("/contents/")[1] }, commit: { sha: "mocksha" } });
  }

  /* ---- Vercel surface ---- */
  if (req.method === "GET" && p === "/v2/user") {
    return json(res, 200, { user: { uid: "usr_1", username: "qa-operator", email: "qa@example.com" } });
  }
  if (req.method === "GET" && p === "/v2/teams") {
    return json(res, 200, { teams: [{ id: "team_qa", name: "QA Team", slug: "qa-team" }] });
  }
  if (req.method === "GET" && p === "/v9/projects") {
    return json(res, 200, { projects: [...state.projects.values()], pagination: { count: state.projects.size, next: null } });
  }
  if (req.method === "GET" && /^\/v9\/projects\/[^/]+$/.test(p)) {
    const project = state.projects.get(decodeURIComponent(p.split("/").pop()));
    return project ? json(res, 200, project) : json(res, 404, { error: { message: "project not found" } });
  }
  if (req.method === "POST" && p === "/v11/projects") {
    const body = await readBody(req);
    const name = String(body.name || "");
    if (name.includes(state.FAIL_PROJECT_MARKER)) {
      return json(res, 403, { error: { message: "git repository access denied" } });
    }
    const repo = state.repos.get(String(body?.gitRepository?.repo || "").split("/").pop());
    const project = {
      id: `prj_${name}`,
      name,
      framework: body.framework || null,
      link: repo
        ? { type: "github", repoId: repo.id, org: "qa-operator", repo: repo.name, productionBranch: "main" }
        : undefined,
      latestDeployments: [],
    };
    state.projects.set(project.id, project);
    return json(res, 200, project);
  }
  if (req.method === "GET" && p === "/v6/deployments") {
    const projectId = url.searchParams.get("projectId") || "";
    const found = [...state.deployments.values()].filter((d) => d.projectId === projectId);
    return json(res, 200, { deployments: found.map((d) => ({ uid: d.id, url: d.url, readyState: d.readyState })) });
  }
  if (req.method === "POST" && p === "/v13/deployments") {
    const body = await readBody(req);
    const name = String(body.name || "");
    if (name.includes(state.FAIL_DEPLOY_MARKER)) {
      return json(res, 400, { error: { message: "initial deployment failed - build error" } });
    }
    const id = `dpl_${state.nextDeployment++}`;
    const deployment = { id, projectId: `prj_${name}`, url: `${name}-${id}.mock.vercel.app`, readyState: "QUEUED", createdAt: 1751500000000 };
    state.deployments.set(id, deployment);
    const project = state.projects.get(`prj_${name}`) || state.projects.get(String(body.project || ""));
    if (project) project.latestDeployments = [{ uid: id, url: deployment.url, readyState: "QUEUED" }];
    return json(res, 200, { id, url: deployment.url, readyState: "QUEUED", createdAt: deployment.createdAt, inspectorUrl: `https://vercel.mock/inspect/${id}` });
  }

  json(res, 404, { message: `mock: no route for ${req.method} ${p}` });
});

/* ------------------------------------------------------------------ */
/* Journey driver + assertions                                          */
/* ------------------------------------------------------------------ */

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(method, route, body) {
  const response = await fetch(`${WORKSPACE_URL}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function readWorkspaceConfigFile() {
  if (!WORKSPACE_DIR) return null;
  try {
    return readFileSync(path.join(WORKSPACE_DIR, "growthub.config.json"), "utf8");
  } catch {
    return null;
  }
}

function findProjectRow(configRaw, projectId) {
  const config = JSON.parse(configRaw);
  const object = (config?.dataModel?.objects || []).find((o) => o.id === "vercel-projects");
  return (object?.rows || []).find((row) => row.projectId === projectId) || null;
}

async function run() {
  // unique per run so re-runs against a persisted workspace stay meaningful
  const APP = `qa-production-app-${Date.now().toString(36)}`;
  console.log(`\nSmoke target: ${WORKSPACE_URL} (mock provider on :${MOCK_PORT})\n`);

  console.log("Journey A — connect provider, install product, link + one-click deploy:");
  const creds = await api("POST", "/api/workspace/add-ons/providers/vercel/credentials", { credentials: { apiToken: "vt_mock_token", teamId: "" } });
  check("provider credentials verified (bearer lane)", creds.status === 200 && creds.payload.accountState === "verified", JSON.stringify(creds.payload).slice(0, 200));
  const install = await api("POST", "/api/workspace/add-ons/providers/vercel/products/sync", { productId: "vercel-deployments" });
  check("product installed via live read-probe", install.status === 200 && install.payload.sync?.ok === true, JSON.stringify(install.payload).slice(0, 200));
  const discovery = await api("GET", "/api/workspace/add-ons/vercel/projects");
  check("project discovery returns account projects", discovery.status === 200 && discovery.payload.projects?.some((item) => item.id === "prj_existing"));
  const link = await api("POST", "/api/workspace/add-ons/vercel/projects/link", { projectId: "prj_existing" });
  check("link persists a governed record + receipt", link.status === 200 && Boolean(link.payload.receiptId));
  const deploy = await api("POST", "/api/workspace/add-ons/vercel/deploy", { projectId: "prj_existing" });
  check("one-click deploy returns live proof", deploy.status === 200 && Boolean(deploy.payload.deployment?.url));
  const configAfterA = readWorkspaceConfigFile();
  if (configAfterA) {
    const row = findProjectRow(configAfterA, "prj_existing");
    check("record persisted with deploy proof in growthub.config.json", Boolean(row?.latestDeploymentUrl && row?.lastDeployProof));
    check("record carries NO secrets", !configAfterA.includes("vt_mock_token") && !configAfterA.includes("ghp_mock"));
  } else {
    check("workspace config readable (set GROWTHUB_WORKSPACE_DIR)", false);
  }

  console.log("\nJourney B — guided create-app (GitHub repo → project → deploy → record):");
  const gh = await api("POST", "/api/workspace/add-ons/github/credentials", { credentials: { token: "ghp_mock_token" } });
  check("github token verified + stored as env ref", gh.status === 200 && gh.payload.login === "qa-operator");
  const preflight = await api("GET", "/api/workspace/add-ons/vercel/create-app");
  check("preflight shows both accounts connected", preflight.status === 200 && preflight.payload.github?.connected && preflight.payload.vercel?.connected);
  const repoStep = await api("POST", "/api/workspace/add-ons/vercel/create-app/github-repo", { name: APP });
  check("private repo created + starter seeded", repoStep.status === 200 && repoStep.payload.repo?.fullName === `qa-operator/${APP}`);
  const projectStep = await api("POST", "/api/workspace/add-ons/vercel/create-app/project", { name: APP, repoFullName: repoStep.payload.repo?.fullName });
  check("vercel project created with repo linked", projectStep.status === 200 && Boolean(projectStep.payload.project?.gitRepoId));
  const configBeforePublish = readWorkspaceConfigFile();
  check("VALIDATION GATE: creation steps persisted nothing", configBeforePublish ? findProjectRow(configBeforePublish, projectStep.payload.project?.id) === null : false);
  const initialDeploy = await api("POST", "/api/workspace/add-ons/vercel/deploy", { projectId: projectStep.payload.project?.id });
  check("initial deploy publishes atomically with proof", initialDeploy.status === 200 && Boolean(initialDeploy.payload.deployment?.url));
  const configAfterB = readWorkspaceConfigFile();
  if (configAfterB) {
    const row = findProjectRow(configAfterB, projectStep.payload.project?.id);
    check("governed record live: URL + proof + git metadata", Boolean(row?.latestDeploymentUrl && row?.lastDeployProof && row?.gitRepo === `qa-operator/${APP}`));
  }
  const validate = await api("GET", "/api/workspace/add-ons/vercel/projects");
  check("publish & validate: record visible as linked", validate.payload.projects?.some((item) => item.id === projectStep.payload.project?.id && item.linked));

  console.log("\nJourney C — validation gate under forced provider failures:");
  const beforeFailures = readWorkspaceConfigFile();
  const repoFail = await api("POST", "/api/workspace/add-ons/vercel/create-app/github-repo", { name: APP });
  check("duplicate repo fails with actionable guidance", repoFail.status === 409 && /different name/.test(repoFail.payload.error || ""));
  const repoForProjectFail = await api("POST", "/api/workspace/add-ons/vercel/create-app/github-repo", { name: `${APP}-failproject` });
  const projectFail = await api("POST", "/api/workspace/add-ons/vercel/create-app/project", { name: `${APP}-failproject`, repoFullName: repoForProjectFail.payload.repo?.fullName });
  check("project-step failure maps to Vercel GitHub App guidance", projectFail.status === 502 && /Vercel GitHub App/.test(projectFail.payload.error || ""));
  const repoForDeployFail = await api("POST", "/api/workspace/add-ons/vercel/create-app/github-repo", { name: `${APP}-faildeploy` });
  const projectForDeployFail = await api("POST", "/api/workspace/add-ons/vercel/create-app/project", { name: `${APP}-faildeploy`, repoFullName: repoForDeployFail.payload.repo?.fullName });
  const deployFail = await api("POST", "/api/workspace/add-ons/vercel/deploy", { projectId: projectForDeployFail.payload.project?.id });
  check("deploy-step failure blocks with guidance", deployFail.status === 502 && /deploy failed/i.test(deployFail.payload.error || ""));
  const afterFailures = readWorkspaceConfigFile();
  check("VALIDATION GATE: failed chains left workspace config byte-identical", beforeFailures !== null && beforeFailures === afterFailures);
  const receipts = await api("GET", "/api/workspace/agent-outcomes?limit=100");
  const receiptText = JSON.stringify(receipts.payload);
  check("blocked outcomes receipted to workspace:agent-outcomes", receipts.status === 200
    && /workspace-add-on-vercel-create-app/.test(receiptText)
    && /workspace-add-on-vercel-deploy/.test(receiptText)
    && /"blocked"/.test(receiptText));
  check("published outcomes receipted for the full lifecycle", /workspace-add-on-provider-credentials/.test(receiptText)
    && /workspace-add-on-vercel-link/.test(receiptText)
    && /workspace-add-on-github-credentials/.test(receiptText));
  check("receipt stream carries no secrets", !receiptText.includes("vt_mock_token") && !receiptText.includes("ghp_mock_token"));

  console.log(`\n${failures === 0 ? "SMOKE PASSED" : `SMOKE FAILED — ${failures} assertion(s)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

mock.listen(MOCK_PORT, async () => {
  console.log(`mock GitHub+Vercel provider API listening on :${MOCK_PORT}`);
  if (SERVE_ONLY) return;
  try {
    await run();
  } catch (error) {
    console.error(`SMOKE FAILED — ${error?.message || error}`);
    process.exit(1);
  }
});
