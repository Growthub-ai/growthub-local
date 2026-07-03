#!/usr/bin/env node
/**
 * Hardening coverage for the Supabase provider release (source-truth style,
 * mirroring the scheduler suite's discipline):
 *   - resolveEnvFromResourceMappings core: the full Supabase Management API
 *     project mapping (urlTemplate → SUPABASE_URL, fromPath service_role /
 *     anon keys, aliasEnv) proven offline with an injected fetch — zero
 *     outbound requests
 *   - optional-mapping failure suppression, match-miss reporting, alias
 *     fallback to already-present env
 *   - SOURCE-TRUTH assertions on the governed routes and executor: operator
 *     gate on every /data handler, receipted blocked outcomes, bearer branch
 *     in discovery/credentials, pure-core delegation in products/sync,
 *     secret redaction in the supabase-data executor, and the no-browser-
 *     storage rule
 *
 * Run with:  node --test scripts/unit-supabase-provider-hardening.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitApp = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);
const kitLib = path.join(kitApp, "lib");

const discovery = await import(pathToFileURL(path.join(kitLib, "provider-resource-discovery.js")).href);
const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const { resolveEnvFromResourceMappings } = discovery;

const SERVICE_KEY = "service-role-key-fixture";
const ANON_KEY = "anon-key-fixture";

function supabaseMappings() {
  return addOns.getMarketplaceProduct("supabase", "supabase-postgrest").resourceDiscovery.envFromResource;
}

function managementApiFetch(calls, { anonStatus = 200, serviceStatus = 200 } = {}) {
  return async (subPath) => {
    calls.push(subPath);
    if (subPath === "/v1/projects/mockref/api-keys") {
      if (serviceStatus !== 200 && anonStatus !== 200) return { ok: false, status: serviceStatus, payload: null };
      return {
        ok: true,
        status: 200,
        payload: [
          { name: "anon", api_key: ANON_KEY },
          { name: "service_role", api_key: SERVICE_KEY },
        ],
      };
    }
    return { ok: false, status: 404, payload: null };
  };
}

test("Supabase project mapping resolves URL + keys + alias with zero real I/O", async () => {
  const calls = [];
  const provider = addOns.getMarketplaceProvider("supabase");
  const { updates, failures } = await resolveEnvFromResourceMappings({
    mappings: supabaseMappings(),
    resource: { id: "mockref", row: { id: "mockref", name: "growthub-prod" } },
    aliasEnv: provider.accountProbe.aliasEnv,
    fetchJson: managementApiFetch(calls),
  });
  assert.deepEqual(failures, []);
  assert.equal(updates.SUPABASE_URL, "https://mockref.supabase.co");
  assert.equal(updates.SUPABASE_SERVICE_ROLE_KEY, SERVICE_KEY);
  assert.equal(updates.SUPABASE_ANON_KEY, ANON_KEY);
  assert.equal(updates.SUPABASE_API_KEY, SERVICE_KEY, "alias write feeds the canonical authRef expansion");
  // Every fromPath mapping fetched the declared sub-path; nothing else.
  assert.deepEqual(Array.from(new Set(calls)), ["/v1/projects/mockref/api-keys"]);
});

test("optional mappings suppress failures; required mappings report them", async () => {
  const failing = async (subPath) => ({ ok: false, status: 403, payload: null });
  const { updates, failures } = await resolveEnvFromResourceMappings({
    mappings: supabaseMappings(),
    resource: { id: "mockref", row: {} },
    fetchJson: failing,
  });
  assert.equal(updates.SUPABASE_URL, "https://mockref.supabase.co", "urlTemplate never depends on fetch");
  assert.equal(updates.SUPABASE_SERVICE_ROLE_KEY, undefined);
  // service_role is required → exactly one failure; anon is optional → suppressed.
  assert.equal(failures.length, 1);
  assert.equal(failures[0].status, 403);
});

test("match-miss on a required mapping reports an actionable failure", async () => {
  const noServiceRole = async () => ({ ok: true, status: 200, payload: [{ name: "anon", api_key: ANON_KEY }] });
  const { failures } = await resolveEnvFromResourceMappings({
    mappings: supabaseMappings(),
    resource: { id: "mockref", row: {} },
    fetchJson: noServiceRole,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0].error, /no service_role entry/);
});

test("alias falls back to already-present env when the source is not in this pass", async () => {
  const { updates } = await resolveEnvFromResourceMappings({
    mappings: [],
    resource: { id: "x", row: {} },
    aliasEnv: { SUPABASE_API_KEY: "SUPABASE_SERVICE_ROLE_KEY" },
    readEnv: (key) => (key === "SUPABASE_SERVICE_ROLE_KEY" ? SERVICE_KEY : ""),
    fetchJson: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(updates.SUPABASE_API_KEY, SERVICE_KEY);
});

// ---------------------------------------------------------------------------
// Source-truth assertions (the routes ARE the contract — read them).
// ---------------------------------------------------------------------------

const dataRouteSource = readFileSync(path.join(kitApp, "app/api/workspace/add-ons/[providerId]/data/route.js"), "utf8");
const resourcesRouteSource = readFileSync(path.join(kitApp, "app/api/workspace/add-ons/providers/[providerId]/products/[productId]/resources/route.js"), "utf8");
const productsSyncRouteSource = readFileSync(path.join(kitApp, "app/api/workspace/add-ons/providers/[providerId]/products/sync/route.js"), "utf8");
const credentialsRouteSource = readFileSync(path.join(kitApp, "app/api/workspace/add-ons/providers/[providerId]/credentials/route.js"), "utf8");
const runnerSource = readFileSync(path.join(kitLib, "orchestration-graph-runner.js"), "utf8");

test("/data route: operator gate on every handler, receipted outcomes, canonical write lane", () => {
  const handlers = dataRouteSource.match(/async function (GET|POST|DELETE)/g) || [];
  assert.deepEqual(handlers.sort(), ["async function DELETE", "async function GET", "async function POST"]);
  const gateCount = (dataRouteSource.match(/requireWorkspaceOperator\(request\)/g) || []).length;
  assert.ok(gateCount >= 3, `every handler is operator-gated (found ${gateCount})`);
  assert.ok(dataRouteSource.includes("appendOutcomeReceipt"), "receipts emitted");
  assert.ok(dataRouteSource.includes('kind: "workspace-add-on-data-sync"'), "canonical receipt kind");
  assert.ok(dataRouteSource.includes('outcomeStatus: "blocked"') || dataRouteSource.includes('outcomeStatus,'), "blocked outcomes receipted");
  assert.ok(dataRouteSource.includes("readWorkspaceConfig") && dataRouteSource.includes("writeWorkspaceConfig"), "canonical read → pure helper → write sequence");
  assert.ok(!/localStorage|sessionStorage/.test(dataRouteSource), "no browser storage");
  assert.ok(!/console\.log\(.*secret/i.test(dataRouteSource), "no secret logging");
});

test("resources route: declared discovery auth branches, Basic no longer unconditional", () => {
  assert.ok(resourcesRouteSource.includes('discoveryAuth === "provider-bearer"'), "bearer branch exists");
  assert.ok(resourcesRouteSource.includes("provider.accountProbe?.tokenEnv"), "bearer token resolves from the provider contract");
  assert.ok(resourcesRouteSource.includes("provider-basic"), "basic mode preserved for Upstash");
});

test("products/sync route delegates mapping semantics to the pure core", () => {
  assert.ok(productsSyncRouteSource.includes("resolveEnvFromResourceMappings("), "pure core called");
  assert.ok(!productsSyncRouteSource.includes("mapping.urlTemplate") && !productsSyncRouteSource.includes("mapping.fromPath"), "no inline duplicate of the mapping semantics");
  assert.ok(productsSyncRouteSource.includes("tokenHeaderName"), "probe supports the declared token header shape");
});

test("credentials route: bearer verify + direct project fallback + alias application", () => {
  assert.ok(credentialsRouteSource.includes("verifyProviderAccountBearer"), "bearer account verify");
  assert.ok(credentialsRouteSource.includes("verifyProviderProjectFallback"), "project-probe fallback");
  assert.ok(credentialsRouteSource.includes("aliasEnv"), "alias applied before env write");
  assert.ok(credentialsRouteSource.includes("writeLocalEnv"), "secrets land in .env.local only");
});

test("supabase-data executor: canonical secret resolution + redaction, no secret in metadata", () => {
  const executor = runnerSource.slice(runnerSource.indexOf("async function executeSupabaseData"), runnerSource.indexOf("async function runOrchestrationGraphIfPresent"));
  assert.ok(executor.length > 0, "executor present");
  assert.ok(executor.includes('readEnvVar("SUPABASE_SERVICE_ROLE_KEY")'), "declared concrete env first");
  assert.ok(executor.includes("readServerSecret(authRef)"), "canonical candidate expansion fallback");
  assert.ok(executor.includes("redactSecretsFromText"), "errors pass through redaction");
  assert.ok(executor.includes("authRefSlug"), "metadata carries the ref slug");
  assert.ok(!executor.includes("authRefValue") && !/adapterMeta[\s\S]{0,400}secret[,}]/.test(executor), "no secret value in adapter metadata");
  assert.ok(executor.includes("requires a row filter"), "filterless update/delete guardrail present");
});
