/**
 * Unit tests for the governance-plane derivers (S3/S5/S6 intelligence atoms):
 *
 *   - deriveAppReadiness       (workspace-app-readiness.js)
 *   - deriveContractCompliance (workspace-contract-compliance.js)
 *
 * All pure derivers over the read-only substrate (graph / contract / evidence).
 * Run with:  node --test scripts/unit-workspace-derivations-governance.test.mjs
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
const load = (file) => import(pathToFileURL(path.join(kitLib, file)).href);
const { deriveAppReadiness } = await load("workspace-app-readiness.js");
const { deriveContractCompliance } = await load("workspace-contract-compliance.js");

const node = (id, type, label, summary = {}) => ({ id, type, label, summary: { label, ...summary }, metadataId: id });
const edge = (from, to, relation) => ({ id: `${from}::${relation}::${to}`, from, to, relation });

// ── deriveAppReadiness ─────────────────────────────────────────────────────

test("deriveAppReadiness: a clean workspace is ready with score 100", () => {
  const graph = {
    nodes: [
      node("int", "integration", "Stripe", { status: "connected" }),
      node("sbx", "sandbox", "Local", { authStatus: "authed" }),
      node("ph", "pipelineHealth", "sync", { status: "ok", latestOk: true }),
    ],
    edges: [],
  };
  const out = deriveAppReadiness(graph);
  assert.equal(out.ready, true);
  assert.equal(out.score, 100);
  assert.equal(out.blocking.length, 0);
});

test("deriveAppReadiness: an unconnected integration blocks and sets a nextAction", () => {
  const graph = {
    nodes: [
      node("int", "integration", "Stripe", { status: "error" }),
      node("ph", "pipelineHealth", "sync", { status: "untested", latestOk: null }),
    ],
    edges: [],
  };
  const out = deriveAppReadiness(graph);
  assert.equal(out.ready, false);
  assert.ok(out.blocking.some((b) => b.code === "integration_not_connected"));
  // blocker outranks the untested-pipeline warning for nextAction.
  assert.match(out.nextAction, /Connect integration/);
  assert.ok(out.score < 100);
});

test("deriveAppReadiness: extraBlockers merge in (env-status / deploy signals)", () => {
  const out = deriveAppReadiness({ nodes: [], edges: [] }, {
    extraBlockers: [{ code: "env_missing", message: "STRIPE_KEY missing", nextAction: "Set STRIPE_KEY" }],
  });
  assert.equal(out.ready, false);
  assert.equal(out.blocking[0].code, "env_missing");
});

test("deriveAppReadiness: a sandbox with MISSING auth is not silently ready (review D)", () => {
  const graph = { nodes: [node("sbx", "sandbox", "Mystery", { authStatus: "" })], edges: [] };
  const out = deriveAppReadiness(graph);
  // unknown auth → warning, not a clean ready and not a silent pass.
  assert.ok(out.warnings.some((w) => w.code === "sandbox_auth_unknown"));
  assert.ok(out.score < 100);
});

test("deriveAppReadiness: an explicitly local/no-auth sandbox is ready by design", () => {
  const graph = { nodes: [node("sbx", "sandbox", "Local", { authStatus: "", runLocality: "local" })], edges: [] };
  const out = deriveAppReadiness(graph);
  assert.equal(out.ready, true);
  assert.ok(!out.warnings.some((w) => w.code === "sandbox_auth_unknown"));
});

test("deriveAppReadiness: an explicitly unauthenticated sandbox blocks", () => {
  const graph = { nodes: [node("sbx", "sandbox", "Stripe", { authStatus: "expired" })], edges: [] };
  const out = deriveAppReadiness(graph);
  assert.equal(out.ready, false);
  assert.ok(out.blocking.some((b) => b.code === "sandbox_unauthenticated"));
});

test("deriveAppReadiness: malformed graph never throws", () => {
  assert.equal(deriveAppReadiness(null).ready, false);
});

// ── deriveContractCompliance ───────────────────────────────────────────────

test("deriveContractCompliance: dataModel change requires a preflight receipt", () => {
  const out = deriveContractCompliance({ changedFields: ["dataModel"] });
  assert.ok(out.required.some((r) => r.code === "preflight_receipt"));
  assert.equal(out.compliant, false);
  assert.match(out.nextAction, /preflight/i);
});

test("deriveContractCompliance: receipt evidence satisfies the requirement", () => {
  const out = deriveContractCompliance({ changedFields: ["dataModel"] }, undefined, { hasPreflightReceipt: true });
  assert.equal(out.compliant, true);
  assert.ok(out.satisfied.some((r) => r.code === "preflight_receipt"));
});

test("deriveContractCompliance: a field outside the allowlist is a hard violation", () => {
  const out = deriveContractCompliance({ changedFields: ["pipelines"] }, undefined, { hasPreflightReceipt: true });
  assert.equal(out.compliant, false);
  assert.ok(out.violations.some((v) => v.code === "field_not_allowed"));
});

test("deriveContractCompliance: live workflow change requires the publish proof chain", () => {
  const unmet = deriveContractCompliance({ changedFields: ["canvas"], touchesLiveWorkflow: true });
  assert.ok(unmet.required.some((r) => r.code === "publish_proof"));
  assert.equal(unmet.compliant, false);
  const met = deriveContractCompliance({ changedFields: ["canvas"], touchesLiveWorkflow: true }, undefined, { hasPublishProof: true });
  assert.equal(met.compliant, true);
});

