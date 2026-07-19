#!/usr/bin/env node
/** Focused coverage for the custom-model branch of POST /test-source. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const {
  executeCustomModelSourceTest,
  resolveCustomModelTestTarget,
} = await import(pathToFileURL(path.join(appRoot, "lib/custom-model-test-source.js")).href);

const completion = (model, content = "verified") => ({
  id: "cmpl-test-source",
  object: "chat.completion",
  model,
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
});

function fixture({ studentTag = "workspace-tuned-v3", routeTag = studentTag, policyTag = studentTag } = {}) {
  const student = {
    integrationId: "workspace-student",
    kind: "custom-model",
    capabilityType: "custom-model-inference",
    capabilities: "chat-completions",
    baseUrl: "http://127.0.0.1:4111/v1",
    endpoint: "/chat/completions",
    expectedModelTag: studentTag,
    status: "registered",
    lastResponse: "",
  };
  const policy = {
    integrationId: "mothership-workspace-tuned-v3",
    kind: "custom-model",
    capabilityType: "custom-model-inference",
    metadata: {
      mothershipProxy: {
        schema: "growthub-mothership-proxy-v1",
        modelTag: policyTag,
        workspaceSlug: "workspace-local",
        routes: [{ target: "local-student", registryId: student.integrationId, modelTag: routeTag }],
      },
    },
  };
  return {
    student,
    policy,
    workspaceConfig: {
      dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows: [student, policy] }] },
    },
  };
}

test("recognizes only an explicit custom-model trait plus one mothership/student bond", () => {
  const f = fixture();
  const target = resolveCustomModelTestTarget(f.workspaceConfig, f.student.integrationId);
  assert.equal(target.recognized, true);
  assert.equal(target.ok, true);
  assert.equal(target.policyRow.integrationId, f.policy.integrationId);
  assert.equal(target.studentRow.integrationId, f.student.integrationId);
  assert.equal(target.expectedModel, "workspace-tuned-v3");

  const ordinary = { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "crm", kind: "http" }] }] } };
  assert.deepEqual(resolveCustomModelTestTarget(ordinary, "crm"), { recognized: false, ok: false });
});

test("a custom-model trait with no bond or inconsistent tuned tags fails closed", () => {
  const unbonded = fixture();
  unbonded.workspaceConfig.dataModel.objects[0].rows = [unbonded.student];
  const missing = resolveCustomModelTestTarget(unbonded.workspaceConfig, unbonded.student.integrationId);
  assert.equal(missing.recognized, true);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "invalid-mothership-policy");

  const mismatch = fixture({ routeTag: "different-tag" });
  const inconsistent = resolveCustomModelTestTarget(mismatch.workspaceConfig, mismatch.student.integrationId);
  assert.equal(inconsistent.recognized, true);
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.reason, "model-tag-mismatch");
});

test("first invocation reaches an unverified student through the real gateway and returns its receipt", async () => {
  const f = fixture();
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(completion("workspace-tuned-v3", "student answered")), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await executeCustomModelSourceTest({
    workspaceConfig: f.workspaceConfig,
    integrationId: f.student.integrationId,
    prompt: "Confirm the tuned runtime",
    runId: "test-source:first-proof",
    fetchImpl,
  });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.tunedTagVerified, true);
  assert.equal(result.expectedModel, "workspace-tuned-v3");
  assert.equal(result.servedModel, "workspace-tuned-v3");
  assert.ok(result.verificationReceipt, "gateway receipt is returned");
  assert.equal(result.verificationReceipt.cache.cache_status, "BYPASS", "proof comes from a live runtime call, not cached completion replay");
  assert.equal(requests.length, 1, "only the local-student route executes");
  assert.equal(requests[0].body.model, "workspace-tuned-v3");
  assert.equal(requests[0].body.messages[0].content, "Confirm the tuned runtime");
});

test("the server-only probe remains student-only and llama requires verified composite identity", async () => {
  const f = fixture();
  f.student.baseUrl = "";
  f.student.connectorKind = "llama.cpp-server";
  f.student.metadata = { inferenceControlPlane: { providerKind: "llama.cpp-server", runtime: { kind: "llama.cpp-server" } } };
  let captured = null;
  const result = await executeCustomModelSourceTest({
    workspaceConfig: f.workspaceConfig,
    integrationId: f.student.integrationId,
    prompt: "probe",
    executeImpl: async (input) => {
      captured = input;
      return {
        ok: true,
        response: completion("workspace-tuned-v3"),
        verificationReceipt: { identity: { status: "partial" } },
        attempts: [],
      };
    },
  });
  assert.deepEqual(captured.allowedTargets, ["local-student"]);
  assert.equal(captured.verificationProbe, true);
  assert.equal(captured.timeoutMs, 120_000, "server-only proof allows a bounded cold external-storage model load");
  assert.equal(captured.inputPayload.inference.cache_policy.mode, "bypass");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "custom-model-verification-failed");
});

test("route preserves ordinary resolver dispatch and the modal never pre-claims callability", () => {
  const route = fs.readFileSync(path.join(appRoot, "app/api/workspace/test-source/route.js"), "utf8");
  const modal = fs.readFileSync(path.join(appRoot, "app/data-model/components/TrainingHandoffModal.jsx"), "utf8");
  assert.ok(route.indexOf("executeCustomModelSourceTest") < route.indexOf("loadAllResolvers();"));
  assert.match(route, /getSourceResolver\(integrationId\.trim\(\)\)/);
  assert.match(route, /resolver\.fetchRecords\(adapterConfig, connection, binding \|\| \{\}\)/);
  assert.doesNotMatch(modal, /registered and callable/);
  assert.match(modal, /verificationReceipt/);
  assert.match(modal, /governed PATCH/);
});
