#!/usr/bin/env node
/**
 * Unit coverage for the Governed Capability Binding CLOSED LOOP
 * (GOVERNED_CAPABILITY_BINDING_V1) — the non-scheduler generalization of the
 * /schedule loop, proven on the Vercel (deploy) and Supabase (data) capabilities:
 *
 *   node surface  → bindCapabilityNode correlates an api-registry-call node to
 *                   the governed API Registry integrationId (no deviation)
 *   cockpit lens  → deriveCapabilityCockpit projects counts + attention +
 *                   per-card nextAction (the dopamine + agent-RL condition packet)
 *   action edge   → buildCapabilityActionRequest builds the governed run request
 *                   (auth in headers only)
 *   command door  → /deploy and /data are read-only lens commands (mutates:false)
 *
 * Pure / offline — no network, no fs, no Next runtime.
 * Run with:  node --test scripts/unit-capability-loop.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const kitApp = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app");

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const binding = await import(pathToFileURL(path.join(kitLib, "capability-binding.js")).href);
const cockpit = await import(pathToFileURL(path.join(kitLib, "capability-cockpit-console.js")).href);
const commands = await import(pathToFileURL(path.join(kitApp, "data-model/components/helper-commands.js")).href);

const { deriveCapabilityCockpit } = cockpit;
const { buildCapabilityActionRequest } = binding;

/* ---------- node surface: capability correlates to a governed API Registry object ---------- */
function workflowConfig(graph) {
  return {
    dataModel: {
      objects: [
        { id: "api-registry", objectType: "api-registry", columns: ["Name"], rows: [
          { Name: "Vercel Deployments", integrationId: "vercel-deployments", authRef: "VERCEL", executionLane: "deploy", nodeSurface: "api-registry-call", syncStatus: "verified", syncProof: "GET /v6/deployments 200", syncCheckedAt: "t", productId: "vercel-deployments", providerId: "vercel" },
        ] },
        { id: "sandbox-workflows", objectType: "sandbox-environment", rows: [
          { Name: "Ship Site", runLocality: "local", adapter: "local-process", orchestrationConfig: JSON.stringify(graph) },
        ] },
      ],
    },
  };
}

test("bindCapabilityNode points an unbound api-registry-call node at the API Registry integrationId", () => {
  const graph = { version: 1, nodes: [{ id: "call", type: "api-registry-call", config: {} }], edges: [] };
  const { config, bound, nodeId } = addOns.bindCapabilityNode(workflowConfig(graph), { objectId: "sandbox-workflows", rowId: "Ship Site", integrationId: "vercel-deployments", authRef: "VERCEL" });
  assert.equal(bound, true);
  assert.equal(nodeId, "call");
  const row = config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0];
  const node = JSON.parse(row.orchestrationConfig).nodes.find((n) => n.id === "call");
  assert.equal(node.config.registryId, "vercel-deployments", "node correlates to the governed API Registry row");
  assert.equal(node.config.authRef, "VERCEL");
});

test("bindCapabilityNode appends a canonical node when the graph has none (never mutates arbitrary nodes)", () => {
  const graph = { version: 1, nodes: [{ id: "other", type: "transform-filter", config: { keep: true } }], edges: [] };
  const { config } = addOns.bindCapabilityNode(workflowConfig(graph), { objectId: "sandbox-workflows", rowId: "Ship Site", integrationId: "vercel-deployments" });
  const nodes = JSON.parse(config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0].orchestrationConfig).nodes;
  const added = nodes.find((n) => n.id === "capability-call");
  assert.equal(added.type, "api-registry-call");
  assert.equal(added.config.registryId, "vercel-deployments");
  assert.equal(nodes.find((n) => n.id === "other").config.keep, true, "existing node untouched");
});

test("bindCapabilityNode is idempotent when the integration is already referenced", () => {
  const graph = { version: 1, nodes: [{ id: "call", type: "api-registry-call", config: { registryId: "vercel-deployments" } }], edges: [] };
  const before = workflowConfig(graph);
  const { config, bound } = addOns.bindCapabilityNode(before, { objectId: "sandbox-workflows", rowId: "Ship Site", integrationId: "vercel-deployments" });
  assert.equal(bound, true);
  const nodes = JSON.parse(config.dataModel.objects.find((o) => o.id === "sandbox-workflows").rows[0].orchestrationConfig).nodes;
  assert.equal(nodes.filter((n) => n.type === "api-registry-call").length, 1, "no duplicate node");
});

/* ---------- cockpit lens: the dopamine + agent-RL condition packet ---------- */
test("deriveCapabilityCockpit surfaces a READY card + next action when creds resolve", () => {
  const graph = { version: 1, nodes: [{ id: "call", type: "api-registry-call", config: { registryId: "vercel-deployments", authRef: "VERCEL", endpoint: "/v13/deployments" } }], edges: [] };
  const view = deriveCapabilityCockpit({ lane: "deploy", title: "Deploy Cockpit", actionVerb: "Trigger deploy", workspaceConfig: workflowConfig(graph), configuredEnvRefs: ["VERCEL"] });
  assert.equal(view.hasCapability, true, "verified Vercel product installed");
  assert.equal(view.capabilityCards.length, 1, "one workflow uses the capability");
  const card = view.capabilityCards[0];
  assert.equal(card.integrationId, "vercel-deployments", "card correlates to the API Registry row");
  assert.equal(card.state, "ready");
  assert.equal(card.nextAction.kind, "run");
  assert.equal(card.nextAction.label, "Trigger deploy");
  assert.equal(view.counts.ready, 1);
});

test("deriveCapabilityCockpit marks a card BLOCKED (with next move) when the credential is missing", () => {
  const graph = { version: 1, nodes: [{ id: "call", type: "api-registry-call", config: { registryId: "vercel-deployments", authRef: "VERCEL", endpoint: "/v13/deployments" } }], edges: [] };
  const view = deriveCapabilityCockpit({ lane: "deploy", title: "Deploy Cockpit", actionVerb: "Trigger deploy", workspaceConfig: workflowConfig(graph), configuredEnvRefs: [] });
  const card = view.capabilityCards[0];
  assert.equal(card.state, "blocked", "no VERCEL credential resolved");
  assert.equal(card.nextAction.kind, "readiness");
  assert.equal(view.attention.state, "blocked", "attention points at the blocker (the RL next move)");
});

test("deriveCapabilityCockpit only shows workflows that actually USE the capability", () => {
  const graph = { version: 1, nodes: [{ id: "call", type: "api-registry-call", config: { registryId: "some-other-api" } }], edges: [] };
  const view = deriveCapabilityCockpit({ lane: "deploy", workspaceConfig: workflowConfig(graph), configuredEnvRefs: ["VERCEL"] });
  assert.equal(view.capabilityCards.length, 0, "a workflow not referencing the capability is not a deploy card");
});

/* ---------- action edge: governed run request, secret in header only ---------- */
test("buildCapabilityActionRequest builds the Vercel deploy trigger (bearer in header only)", () => {
  const product = addOns.getMarketplaceProduct("vercel", "vercel-deployments");
  const r = buildCapabilityActionRequest({
    auth: product.auth,
    baseUrl: "https://api.vercel.com",
    step: product.action.trigger,
    body: { name: "my-app" },
    env: { VERCEL_TOKEN: "vt_secret" },
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.request.url, "https://api.vercel.com/v13/deployments");
  assert.equal(r.request.method, "POST");
  assert.equal(r.request.headers.authorization, "Bearer vt_secret");
  assert.match(r.request.body, /my-app/);
  assert.ok(!JSON.stringify(r.resolvedEnv).includes("vt_secret"), "resolvedEnv is key names only");
});

test("buildCapabilityActionRequest blocks (missingEnv) before any call when creds absent", () => {
  const product = addOns.getMarketplaceProduct("vercel", "vercel-deployments");
  const r = buildCapabilityActionRequest({ auth: product.auth, baseUrl: "https://api.vercel.com", step: product.action.trigger, env: {} });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingEnv, ["VERCEL_TOKEN"]);
});

test("buildCapabilityActionRequest resolves Supabase PostgREST path + apikey header", () => {
  const product = addOns.getMarketplaceProduct("supabase", "supabase-postgrest");
  const r = buildCapabilityActionRequest({
    auth: product.auth,
    baseUrl: "https://abc.supabase.co",
    step: product.action.read,
    pathVars: { table: "leads" },
    env: { SUPABASE_SERVICE_ROLE_KEY: "svc_secret" },
  });
  assert.equal(r.request.url, "https://abc.supabase.co/rest/v1/leads");
  assert.equal(r.request.headers.apikey, "svc_secret");
});

/* ---------- command door: /deploy + /data are governed read-only lenses ---------- */
test("/deploy and /data are governed, read-only, view-switching commands", () => {
  for (const name of ["/deploy", "/data"]) {
    const cmd = commands.HELPER_COMMANDS.find((c) => c.name === name);
    assert.ok(cmd, `${name} registered`);
    assert.equal(cmd.mutates, false, `${name} must be read-only (a lens door, not an action runner)`);
    assert.ok(cmd.view, `${name} opens a cockpit view`);
    assert.equal(commands.isGovernedHelperCommand(cmd).ok, true, `${name} passes the governance validator`);
  }
});
