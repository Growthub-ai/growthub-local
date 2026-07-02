#!/usr/bin/env node
/**
 * Unit coverage for the official Vercel marketplace provider + one-click
 * deployment product:
 *   - provider registration shape (bearer account lane, single source of truth)
 *   - provider account auth resolution (mode, env keys, header, no leakage)
 *   - product readiness via the canonical readEnvVar contract
 *   - provider/product registry row shape (env REFS only, never values)
 *   - project normalization from the /v9/projects payload (non-secret)
 *   - governed vercel-projects Data Model directory (upsert idempotency,
 *     extras preservation, relations, schema validity — zero contract change)
 *   - one-click deploy request builder (git-source lane, redeploy lane,
 *     actionable failure) and deploy-proof patch merge
 *   - Upstash regression: the second provider changes nothing for the first
 *
 * Pure / offline — no network or runtime dependency.
 *
 * Run with:  node --test scripts/unit-workspace-add-ons-vercel.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const deployments = await import(pathToFileURL(path.join(kitLib, "workspace-add-on-deployments.js")).href);
const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);

const {
  MARKETPLACE_PROVIDERS,
  VERCEL_DEPLOYMENTS_INTEGRATION_ID,
  VERCEL_PROJECTS_OBJECT_ID,
  findVercelProjectRow,
  findVercelProjectsObject,
  getMarketplaceProvider,
  getVercelProduct,
  listProviderProductReadiness,
  makeMarketplaceProviderRow,
  makeVercelProductRow,
  makeVercelProjectRow,
  providerAccountAuthMode,
  providerAccountEnvKeys,
  resolveProviderAccountAuth,
  withMarketplaceProductRegistry,
  withMarketplaceProviderRegistry,
  withVercelProjectPatch,
  withVercelProjectsDirectory,
} = addOns;

const {
  buildVercelDeployRequest,
  normalizeVercelDeployment,
  normalizeVercelProject,
  pickVercelProjects,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
  vercelDeployProofPatch,
  withVercelQuery,
} = deployments;

const SAMPLE_PROJECT_PAYLOAD = {
  projects: [
    {
      id: "prj_123",
      name: "marketing-site",
      framework: "nextjs",
      link: { type: "github", repoId: 4242, org: "acme", repo: "marketing-site", productionBranch: "main" },
      latestDeployments: [{ uid: "dpl_9", url: "marketing-site-abc.vercel.app", readyState: "READY" }],
    },
    { id: "prj_456", name: "docs", framework: "astro", latestDeployments: [] },
  ],
};

/* ---------- provider registration shape ---------- */
test("vercel provider is registered parallel to upstash with a bearer account lane", () => {
  const vercel = getMarketplaceProvider("vercel");
  assert.ok(vercel, "vercel provider missing from MARKETPLACE_PROVIDERS");
  assert.equal(vercel.integrationId, "vercel-provider");
  assert.equal(providerAccountAuthMode(vercel), "bearer");
  assert.deepEqual(providerAccountEnvKeys(vercel), ["VERCEL_TOKEN"]);
  assert.equal(vercel.baseUrl, "https://api.vercel.com");
  const tokenField = vercel.accountSetupFields.find((field) => field.credentialRole === "bearerToken");
  assert.ok(tokenField, "bearer token setup field missing");
  assert.equal(tokenField.envRef, "VERCEL_TOKEN");
  assert.equal(tokenField.type, "password");
  // upstash keeps its basic lane untouched
  assert.equal(providerAccountAuthMode(getMarketplaceProvider("upstash")), "basic");
  assert.deepEqual(providerAccountEnvKeys(getMarketplaceProvider("upstash")), ["UPSTASH_EMAIL", "UPSTASH_API_KEY"]);
});

test("every marketplace provider resolves a usable account auth mode", () => {
  for (const provider of MARKETPLACE_PROVIDERS) {
    assert.notEqual(providerAccountAuthMode(provider), "none", `${provider.providerId} has no account lane`);
  }
});

/* ---------- account auth resolution ---------- */
test("resolveProviderAccountAuth resolves the bearer lane without leaking beyond the header", () => {
  const vercel = getMarketplaceProvider("vercel");
  const missing = resolveProviderAccountAuth(vercel, {});
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.missingEnv, ["VERCEL_TOKEN"]);
  assert.equal(missing.header, null);

  const ready = resolveProviderAccountAuth(vercel, { VERCEL_TOKEN: "tok_secret", VERCEL_TEAM_ID: "team_1" });
  assert.equal(ready.ready, true);
  assert.equal(ready.mode, "bearer");
  assert.equal(ready.header, "Bearer tok_secret");
  assert.equal(ready.teamId, "team_1");
  assert.deepEqual(ready.resolvedEnv, ["VERCEL_TOKEN"]);
  // secret appears ONLY in header — the serializable evidence fields are key names
  for (const value of [...ready.requiredEnv, ...ready.resolvedEnv, ...ready.missingEnv]) {
    assert.ok(!String(value).includes("tok_secret"));
  }
});

test("resolveVercelAccountAuth mirrors the provider contract from concrete env keys", () => {
  const auth = resolveVercelAccountAuth({ VERCEL_TOKEN: "abc", VERCEL_TEAM_ID: "team_9" });
  assert.equal(auth.ready, true);
  assert.equal(auth.header, "Bearer abc");
  assert.equal(auth.teamId, "team_9");
  assert.deepEqual(resolveVercelAccountAuth({}).missingEnv, ["VERCEL_TOKEN"]);
});

/* ---------- product readiness ---------- */
test("vercel product readiness resolves through the canonical env contract", () => {
  const notReady = listProviderProductReadiness("vercel", {});
  assert.equal(notReady.length, 1);
  assert.equal(notReady[0].productId, "vercel-deployments");
  assert.equal(notReady[0].configured, false);
  assert.deepEqual(notReady[0].missingEnv, ["VERCEL_TOKEN"]);

  const ready = listProviderProductReadiness("vercel", { VERCEL_TOKEN: "x", VERCEL_TEAM_ID: "t" });
  assert.equal(ready[0].configured, true);
  assert.deepEqual(ready[0].configuredOptionalEnv, ["VERCEL_TEAM_ID"]);
});

test("vercel product probe declares a static base fallback and bearer token env", () => {
  const product = getVercelProduct("vercel-deployments");
  assert.equal(product.probe.tokenEnv, "VERCEL_TOKEN");
  assert.equal(product.probe.fallbackBaseUrl, "https://api.vercel.com");
  assert.deepEqual(product.probe.paths, ["/v9/projects"]);
  assert.equal(product.resourceDiscovery.auth, "provider-bearer");
  assert.deepEqual(product.resourceDiscovery.envFromResource, []);
});

/* ---------- registry rows: refs only, never values ---------- */
test("provider and product registry rows persist env refs only", () => {
  const providerRow = makeMarketplaceProviderRow("vercel", {
    syncResult: { ok: true, testedAt: "2026-07-02T00:00:00Z", proof: "probe ok", resolvedEnv: ["VERCEL_TOKEN"] },
  });
  assert.equal(providerRow.integrationId, "vercel-provider");
  assert.equal(providerRow.requiredEnv, "VERCEL_TOKEN");
  assert.equal(providerRow.providerAccountRequiredEnv, "VERCEL_TOKEN");
  assert.equal(providerRow.syncStatus, "verified");

  const productRow = makeVercelProductRow({ syncResult: { ok: true, testedAt: "t", proof: "p" } });
  assert.equal(productRow.integrationId, VERCEL_DEPLOYMENTS_INTEGRATION_ID);
  assert.equal(productRow.requiredEnv, "VERCEL_TOKEN");
  assert.equal(productRow.schemaVersion, "growthub-marketplace-vercel-v1");
  assert.equal(productRow.baseUrl, "https://api.vercel.com");
  const serialized = JSON.stringify({ providerRow, productRow });
  assert.ok(!serialized.includes("tok_secret"));
});

test("withMarketplaceProductRegistry routes vercel installs and preserves upstash behavior", () => {
  let config = { dataModel: { objects: [] } };
  config = withMarketplaceProviderRegistry(config, { providerId: "vercel", syncResult: { ok: true, testedAt: "t", proof: "p" } });
  config = withMarketplaceProductRegistry(config, { providerId: "vercel", productId: "vercel-deployments", syncResult: { ok: true, testedAt: "t", proof: "p" } });
  const registry = config.dataModel.objects.find((object) => object.id === "api-registry");
  const integrationIds = registry.rows.map((row) => row.integrationId);
  assert.ok(integrationIds.includes("vercel-provider"));
  assert.ok(integrationIds.includes("vercel-deployments"));
  // idempotent re-sync updates in place, no duplicate rows
  const again = withMarketplaceProductRegistry(config, { providerId: "vercel", productId: "vercel-deployments", syncResult: { ok: true, testedAt: "t2", proof: "p2" } });
  const rows = again.dataModel.objects.find((object) => object.id === "api-registry").rows
    .filter((row) => row.integrationId === "vercel-deployments");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].syncCheckedAt, "t2");
  // unknown provider unchanged (existing contract)
  const unchanged = withMarketplaceProductRegistry(config, { providerId: "other", productId: "x" });
  assert.deepEqual(unchanged, config);
});

/* ---------- project normalization ---------- */
test("normalizeVercelProject keeps non-secret routing metadata only", () => {
  const [raw] = pickVercelProjects(SAMPLE_PROJECT_PAYLOAD);
  const project = normalizeVercelProject(raw);
  assert.equal(project.id, "prj_123");
  assert.equal(project.gitProvider, "github");
  assert.equal(project.gitRepo, "acme/marketing-site");
  assert.equal(project.gitRepoId, "4242");
  assert.equal(project.gitBranch, "main");
  assert.equal(project.latestDeploymentId, "dpl_9");
  assert.equal(project.latestDeploymentUrl, "https://marketing-site-abc.vercel.app");
  assert.equal(project.latestDeploymentState, "READY");
  assert.equal(normalizeVercelProject(null), null);
  assert.equal(normalizeVercelProject({}), null);
});

test("withVercelQuery appends params deterministically and skips blanks", () => {
  assert.equal(withVercelQuery("https://api.vercel.com/v9/projects", { teamId: "" }), "https://api.vercel.com/v9/projects");
  assert.equal(withVercelQuery("https://api.vercel.com/v9/projects", { teamId: "t 1" }), "https://api.vercel.com/v9/projects?teamId=t%201");
  assert.equal(withVercelQuery("https://x/y?a=1", { b: "2" }), "https://x/y?a=1&b=2");
  assert.equal(resolveVercelApiBaseUrl({ VERCEL_API_URL: "https://proxy.example.com/" }), "https://proxy.example.com");
  assert.equal(resolveVercelApiBaseUrl({}), "https://api.vercel.com");
});

/* ---------- governed vercel-projects directory ---------- */
function linkedConfig() {
  const projects = pickVercelProjects(SAMPLE_PROJECT_PAYLOAD).map((item) => normalizeVercelProject(item));
  return withVercelProjectsDirectory({ dataModel: { objects: [] } }, { projects, linkedAt: "2026-07-02T00:00:00Z" });
}

test("withVercelProjectsDirectory creates one atomic custom-object row per project", () => {
  const config = linkedConfig();
  const object = findVercelProjectsObject(config);
  assert.ok(object, "vercel-projects object missing");
  assert.equal(object.objectType, "custom");
  assert.equal(object.rows.length, 2);
  const row = findVercelProjectRow(config, "prj_123");
  assert.equal(row.Name, "marketing-site");
  assert.equal(row.registryId, VERCEL_DEPLOYMENTS_INTEGRATION_ID);
  assert.equal(row.connectorKind, "vercel-project");
  assert.equal(row.linkedAt, "2026-07-02T00:00:00Z");
  // relations reuse the existing reference primitive
  const relationTargets = object.relations.map((relation) => relation.targetObjectType).sort();
  assert.deepEqual(relationTargets, ["api-registry", "sandbox-environment"]);
  const workflowRelation = object.relations.find((relation) => relation.targetObjectType === "sandbox-environment");
  assert.equal(workflowRelation.field, "linkedWorkflowRef");
});

test("directory upsert is idempotent and preserves operator extras + deploy proof", () => {
  let config = linkedConfig();
  // operator links a workflow + a deploy lands proof on the row
  config = withVercelProjectPatch(config, {
    projectId: "prj_123",
    patch: { linkedWorkflowRef: "My Flow", lastDeployStatus: "READY", lastDeployProof: "Deployment dpl_9 created." },
  }).config;
  // re-link (marketplace refresh) must NOT clobber those fields
  const refreshed = withVercelProjectsDirectory(config, {
    projects: [normalizeVercelProject(pickVercelProjects(SAMPLE_PROJECT_PAYLOAD)[0])],
    linkedAt: "2026-07-03T00:00:00Z",
  });
  const row = findVercelProjectRow(refreshed, "prj_123");
  assert.equal(row.linkedWorkflowRef, "My Flow");
  assert.equal(row.lastDeployStatus, "READY");
  assert.equal(row.lastDeployProof, "Deployment dpl_9 created.");
  assert.equal(row.linkedAt, "2026-07-02T00:00:00Z");
  assert.equal(findVercelProjectsObject(refreshed).rows.length, 2);
});

test("linked directory + registry rows validate against the untouched workspace schema", () => {
  let config = { dataModel: { objects: [] } };
  config = withMarketplaceProviderRegistry(config, { providerId: "vercel", syncResult: { ok: true, testedAt: "t", proof: "p" } });
  config = withMarketplaceProductRegistry(config, { providerId: "vercel", productId: "vercel-deployments", syncResult: { ok: true, testedAt: "t", proof: "p" } });
  config = withVercelProjectsDirectory(config, {
    projects: pickVercelProjects(SAMPLE_PROJECT_PAYLOAD).map((item) => normalizeVercelProject(item)),
    linkedAt: "2026-07-02T00:00:00Z",
  });
  // validateWorkspaceConfig throws with error.details on any violation.
  assert.doesNotThrow(() => schema.validateWorkspaceConfig({ dataModel: config.dataModel }));
});

/* ---------- one-click deploy request ---------- */
test("buildVercelDeployRequest prefers the git-source lane with numeric repoId", () => {
  const project = normalizeVercelProject(pickVercelProjects(SAMPLE_PROJECT_PAYLOAD)[0]);
  const request = buildVercelDeployRequest({ project, teamId: "team_1" });
  assert.equal(request.ok, true);
  assert.equal(request.lane, "git-source");
  assert.equal(request.url, "https://api.vercel.com/v13/deployments?teamId=team_1&forceNew=1");
  assert.deepEqual(request.body, {
    name: "marketing-site",
    project: "prj_123",
    target: "production",
    gitSource: { type: "github", repoId: 4242, ref: "main" },
  });
});

test("buildVercelDeployRequest falls back to the redeploy lane, then fails actionably", () => {
  const redeploy = buildVercelDeployRequest({
    project: { id: "prj_456", name: "docs", latestDeploymentId: "dpl_77" },
  });
  assert.equal(redeploy.ok, true);
  assert.equal(redeploy.lane, "redeploy");
  assert.deepEqual(redeploy.body, { name: "docs", deploymentId: "dpl_77", target: "production" });

  const blocked = buildVercelDeployRequest({ project: { id: "prj_456", name: "docs" } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /git repository|previous deployment/);

  const invalid = buildVercelDeployRequest({ project: {} });
  assert.equal(invalid.ok, false);
});

test("deploy proof normalization + patch stay non-secret and merge onto the row", () => {
  const deployment = normalizeVercelDeployment({ id: "dpl_100", url: "docs-xyz.vercel.app", readyState: "QUEUED", createdAt: 1751414400000 });
  assert.equal(deployment.deploymentId, "dpl_100");
  assert.equal(deployment.url, "https://docs-xyz.vercel.app");
  assert.equal(deployment.createdAt, "2025-07-02T00:00:00.000Z");
  assert.equal(normalizeVercelDeployment({}), null);

  const patch = vercelDeployProofPatch(deployment, "2026-07-02T00:00:01Z");
  assert.equal(patch.lastDeployStatus, "QUEUED");
  assert.equal(patch.latestDeploymentId, "dpl_100");
  assert.match(patch.lastDeployProof, /dpl_100/);

  const config = linkedConfig();
  const { config: patched, found } = withVercelProjectPatch(config, { projectId: "prj_456", patch });
  assert.equal(found, true);
  assert.equal(findVercelProjectRow(patched, "prj_456").latestDeploymentId, "dpl_100");
  assert.equal(withVercelProjectPatch(config, { projectId: "missing", patch }).found, false);
});

/* ---------- upstash regression ---------- */
test("upstash provider row + readiness are unchanged by the second provider", () => {
  const row = makeMarketplaceProviderRow("upstash", { syncResult: null });
  assert.equal(row.requiredEnv, "UPSTASH_EMAIL,UPSTASH_API_KEY");
  assert.equal(row.providerAccountRequiredEnv, "UPSTASH_EMAIL,UPSTASH_API_KEY");
  const readiness = listProviderProductReadiness("upstash", { QSTASH_TOKEN: "x" });
  const qstash = readiness.find((item) => item.productId === "upstash-qstash");
  assert.equal(qstash.configured, true);
});
