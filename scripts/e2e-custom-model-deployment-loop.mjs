/**
 * Custom Model Deployment Loop — post-success reality probe.
 *
 * The training-loop probe proves the ledger advances on evidence. THIS probe
 * proves the POST-success half is real: after the model is "built and running
 * locally", the API Registry row actually performs a chat-completions call to
 * a REAL local HTTP endpoint, captures the response, and the tuned-tag gate
 * verifies it — with the negatives (base model demotes, error demotes).
 *
 * It stands up a real local OpenAI-compatible HTTP server (no network, no GPU
 * — the only thing stubbed is the weights), then drives the SHIPPED
 * training-deployment + training-verification logic end to end.
 *
 * Run: node scripts/e2e-custom-model-deployment-loop.mjs
 */

import http from "node:http";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { captureChatCompletion, buildRegistryTestStamp, findRegistryRow, resolveChatEndpoint, buildChatProbeBody } = await import(lib("training-deployment.js"));
const { verifyTunedResponse, deriveEndpointVerification } = await import(lib("training-verification.js"));
const { scaffoldHandoffRows, resolveFineTuneTarget } = await import(lib("adapters/fine-tune-targets.js"));

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); pass += 1; console.log(`  ✓ ${label}`); };
const eq = (label, a, b) => { assert.equal(a, b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); pass += 1; console.log(`  ✓ ${label}`); };

const TUNED_TAG = "workspace-local-tuned-v1";
const BASE_MODEL = "qwen2.5-coder:4b";

// A real local OpenAI-compatible server. `mode` decides what model it serves —
// exactly the difference between a real tuned deployment and a base/broken one.
let mode = "tuned";
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let parsed = {}; try { parsed = JSON.parse(raw); } catch {}
    const requestedModel = String(parsed.model || "");
    if (mode === "error") { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "model not found" } })); return; }
    if (mode === "garbage") { res.writeHead(200, { "content-type": "text/plain" }); res.end("not json at all"); return; }
    const served = mode === "base" ? BASE_MODEL : requestedModel; // tuned echoes the requested tag
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-probe", object: "chat.completion", model: served,
      choices: [{ index: 0, message: { role: "assistant", content: "Confirmed: tuned workspace model online." }, finish_reason: "stop" }],
    }));
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/v1`;
console.log(`\nLocal OpenAI-compatible endpoint: ${baseUrl}`);

try {
  // ------------------------------------------------------------------------
  // STEP 1 — the registry row the handoff scaffolds points at the local model.
  // ------------------------------------------------------------------------
  console.log("\n[1] API Registry row scaffolded for the custom model");
  const target = { ...resolveFineTuneTarget("ollama-local"), baseUrl }; // point at our local server
  const { registryRow, integrationId } = scaffoldHandoffRows({ slug: "workspace-local", version: 1, target, modelTag: TUNED_TAG, datasetRecords: 12, datasetPath: "ds.jsonl", now: "2026-06-17T00:00:00.000Z" });
  registryRow.expectedModelTag = TUNED_TAG; // the modal stamps this on prepare
  const workspaceConfig = { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows: [registryRow] }] } };
  eq("registry row id is the custom-model integration", integrationId, "workspace-local-model");
  eq("registry row capability is chat-completions", registryRow.capabilities, "chat-completions");
  eq("endpoint resolves to the local chat/completions URL", resolveChatEndpoint(registryRow), `${baseUrl}/chat/completions`);
  ok("probe body carries the tuned tag + a user message", buildChatProbeBody({ modelTag: TUNED_TAG }).model === TUNED_TAG && buildChatProbeBody({ modelTag: TUNED_TAG }).messages.length === 1);
  ok("row is found by integrationId", findRegistryRow(workspaceConfig, integrationId) === registryRow);

  // ------------------------------------------------------------------------
  // STEP 2 — POSITIVE: the locally-running tuned model answers → verified.
  // ------------------------------------------------------------------------
  console.log("\n[2] Real chat-completions call to the running custom model → verified");
  mode = "tuned";
  const cap = await captureChatCompletion({ registryRow, modelTag: TUNED_TAG });
  ok("the call reached the local endpoint (ok)", cap.ok === true);
  eq("the served model is the tuned tag", cap.response.model, TUNED_TAG);
  const stamp = buildRegistryTestStamp(cap.response, "2026-06-17T00:01:00.000Z");
  ok("the registry test stamp captured a real lastResponse", typeof stamp.lastResponse === "string" && stamp.lastResponse.includes(TUNED_TAG));
  eq("the row status becomes connected after a served reply", stamp.status, "connected");
  // Stamp the row exactly as the runner would, then verify off the row.
  Object.assign(registryRow, stamp);
  const v = deriveEndpointVerification({ registryRow, expectedTag: TUNED_TAG, baseModel: BASE_MODEL });
  ok("end-to-end: the API Registry row VERIFIES the tuned tag", v.verified === true);
  ok("verification carries the served model + a content snippet", v.servedModel === TUNED_TAG && v.snippet.length > 0);

  // ------------------------------------------------------------------------
  // STEP 3 — NEGATIVE: the endpoint serves the BASE model → must NOT verify.
  // ------------------------------------------------------------------------
  console.log("\n[3] NEGATIVE: endpoint serves the base model → demotes");
  mode = "base";
  const capBase = await captureChatCompletion({ registryRow, modelTag: TUNED_TAG });
  eq("the base endpoint served the base model", capBase.response.model, BASE_MODEL);
  const vBase = verifyTunedResponse({ expectedTag: TUNED_TAG, baseModel: BASE_MODEL, responseBody: capBase.response });
  ok("base-model reply does NOT verify", vBase.verified === false);
  eq("demotion reason is base-model", vBase.demotion, "base-model");

  // ------------------------------------------------------------------------
  // STEP 4 — NEGATIVE: endpoint error / garbage → must NOT verify.
  // ------------------------------------------------------------------------
  console.log("\n[4] NEGATIVE: endpoint error and malformed body → demote");
  mode = "error";
  const capErr = await captureChatCompletion({ registryRow, modelTag: TUNED_TAG });
  ok("error envelope does NOT verify", verifyTunedResponse({ expectedTag: TUNED_TAG, baseModel: BASE_MODEL, responseBody: capErr.response }).verified === false);
  mode = "garbage";
  const capGarbage = await captureChatCompletion({ registryRow, modelTag: TUNED_TAG });
  eq("malformed body demotes as malformed", verifyTunedResponse({ expectedTag: TUNED_TAG, baseModel: BASE_MODEL, responseBody: capGarbage.response }).demotion, "malformed");

  // ------------------------------------------------------------------------
  // STEP 5 — NEGATIVE: unreachable endpoint (model not running) → graceful.
  // ------------------------------------------------------------------------
  console.log("\n[5] NEGATIVE: model not running locally → graceful, no fake pass");
  const capDown = await captureChatCompletion({ registryRow: { ...registryRow, baseUrl: "http://127.0.0.1:1/v1" }, modelTag: TUNED_TAG });
  ok("an unreachable local model fails honestly (never throws, ok=false)", capDown.ok === false && capDown.response === null);

  console.log(`\n✅ Custom Model Deployment Loop — post-success path proven end-to-end (${pass} assertions).`);
} finally {
  server.close();
}
