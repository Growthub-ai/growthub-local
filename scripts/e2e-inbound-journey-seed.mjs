#!/usr/bin/env node
/**
 * Thin seed EXTENSION for the inbound input-method e2e journey.
 *
 * Runs against a temp workspace export produced by export-seed-workspace.mjs
 * (never against the repo tree) and layers the inbound fixtures on top of the
 * standard feature seed — same lane: direct pre-boot filesystem write.
 *
 *   - installs + verifies the two packaged inbound capability rows
 *     (growthub-webhook-trigger / growthub-api-trigger) in the api-registry
 *     object, the exact end-state of "Install + sync in Workspace Add-ons",
 *   - gives the registry-workflow input node a REAL samplePayload (the
 *     scheduled-input contract collectAvailableInputKeys derives from),
 *   - clones a second workflow row (api-workflow) so webhook and api-request
 *     can each bind their own row in one boot,
 *   - appends the inbound signing/invoke env refs to .env.local.
 *
 * Usage:  node scripts/e2e-inbound-journey-seed.mjs <export>/growthub-custom-workspace-starter-v1/apps/workspace
 */
import fs from "node:fs";
import path from "node:path";

const appDir = path.resolve(process.argv[2] || "");
if (!appDir || !fs.existsSync(path.join(appDir, "growthub.config.json"))) {
  console.error("Usage: node scripts/e2e-inbound-journey-seed.mjs <export .../apps/workspace> (growthub.config.json not found)");
  process.exit(1);
}
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
if (appDir.startsWith(repoRoot + path.sep)) {
  console.error("Refusing to seed inside the repo tree — point at a temp export.");
  process.exit(1);
}

const SAMPLE_PAYLOAD = { since: "2026-01-01", segment: "daily-brief" };
const configPath = path.join(appDir, "growthub.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const objects = config?.dataModel?.objects || [];

const verified = { syncStatus: "verified", syncProof: "e2e-inbound-journey", syncCheckedAt: new Date().toISOString() };
const registry = objects.find((o) => String(o?.objectType || "") === "api-registry");
if (!registry) throw new Error("api-registry object missing from feature seed");
registry.rows = registry.rows || [];
for (const cap of [
  { Name: "Growthub Webhook Trigger", integrationId: "growthub-webhook-trigger", authRef: "GROWTHUB_WEBHOOK", requiredEnv: "GROWTHUB_WEBHOOK_SIGNING_SECRET", ...verified },
  { Name: "Growthub API Trigger", integrationId: "growthub-api-trigger", authRef: "GROWTHUB_API", requiredEnv: "GROWTHUB_API_INVOKE_TOKEN", ...verified },
]) {
  if (!registry.rows.some((r) => String(r?.integrationId || "") === cap.integrationId)) registry.rows.push(cap);
}

const sandbox = objects.find((o) => String(o?.objectType || "") === "sandbox-environment"
  && (o.rows || []).some((r) => String(r?.Name || "") === "registry-workflow"));
if (!sandbox) throw new Error("sandbox object with registry-workflow row missing from feature seed");
const baseRow = sandbox.rows.find((r) => String(r?.Name || "") === "registry-workflow");

function withSamplePayload(graphJson) {
  const graph = JSON.parse(graphJson);
  const input = (graph.nodes || []).find((n) => n?.type === "input" || n?.id === "input");
  if (input) input.config = { ...(input.config || {}), samplePayload: SAMPLE_PAYLOAD };
  return JSON.stringify(graph, null, 2);
}
baseRow.orchestrationConfig = withSamplePayload(baseRow.orchestrationConfig);

if (!sandbox.rows.some((r) => String(r?.Name || "") === "api-workflow")) {
  sandbox.rows.push({ ...baseRow, Name: "api-workflow" });
}

// A deliberately NOT-ready workflow: its API node references an unconfigured
// env ref, so selecting a serverless input method must surface the readiness
// blast-radius flags (orange node border + field deltas) BEFORE bind.
if (!sandbox.rows.some((r) => String(r?.Name || "") === "gap-workflow")) {
  const gapGraph = JSON.parse(baseRow.orchestrationConfig);
  for (const node of gapGraph.nodes || []) {
    if (node?.type === "api-registry-call") node.config = { ...(node.config || {}), authRef: "UNSET_E2E_SECRET" };
  }
  sandbox.rows.push({ ...baseRow, Name: "gap-workflow", orchestrationConfig: JSON.stringify(gapGraph, null, 2) });
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

const envPath = path.join(appDir, ".env.local");
const port = String(process.env.E2E_PORT || "3777");
const envLines = [
  "GROWTHUB_WEBHOOK_SIGNING_SECRET=whsec_e2e_inbound_journey",
  "GROWTHUB_API_INVOKE_TOKEN=tok_e2e_inbound_journey",
  // The bind gate requires a resolvable public destination origin — locally
  // that is the dev/start server itself, which needs the existing localhost
  // escape hatch (the same one the localhost readiness smoke uses).
  `GROWTHUB_WORKSPACE_PUBLIC_URL=http://127.0.0.1:${port}`,
  "GROWTHUB_ALLOW_INSECURE_CALLBACK_URL=true",
];
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
for (const line of envLines) {
  const key = line.split("=")[0];
  if (!env.includes(`${key}=`)) env += (env.endsWith("\n") || !env ? "" : "\n") + line + "\n";
}
fs.writeFileSync(envPath, env);

console.log(JSON.stringify({
  ok: true,
  appDir,
  capabilityRows: ["growthub-webhook-trigger", "growthub-api-trigger"],
  workflows: ["registry-workflow", "api-workflow"],
  samplePayload: SAMPLE_PAYLOAD,
}, null, 2));
