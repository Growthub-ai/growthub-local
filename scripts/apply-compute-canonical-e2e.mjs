#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "scripts/e2e-compute-route-realization-loop.mjs");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[canonical-e2e] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[canonical-e2e] ambiguous anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

if (!source.includes("provider self-scores intentionally prefer the base")) {
  replaceOnce(
    `const fabricatedEvaluationResults = Array.from({ length: 6 }, (_, index) => ({
  taskId: \`provider-controlled-\${index}\`,
  student: { quality: 1, latencyMs: 1, costUsd: 0 },
  baseline: { quality: 0, latencyMs: 100, costUsd: 100 },
}));`,
    `// The provider self-scores intentionally prefer the base. If these rows
// ever leak into promotion, the booted proof will fail because the canonical
// workspace judge below independently prefers the tuned artifact.
const fabricatedEvaluationResults = Array.from({ length: 6 }, (_, index) => ({
  taskId: \`provider-controlled-\${index}\`,
  student: { quality: 0, latencyMs: 100, costUsd: 100 },
  baseline: { quality: 1, latencyMs: 1, costUsd: 0 },
}));`,
    "provider self-score inversion",
  );
}

if (!source.includes("canonical evaluator judge")) {
  replaceOnce(
    `  if (url.pathname === "/chat") {
    return json(200, {
      model: "student-v1",
      choices: [{ message: { role: "assistant", content: "verified student" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
  }`,
    `  if (["/chat", "/v1/chat/completions", "/chat/completions"].includes(url.pathname)) {
    const requestedModel = String(body?.model || "");
    if (requestedModel === "teacher-v1") {
      // The canonical evaluator judge compares the tuned/base outputs and
      // emits the shipped eval-vs-base JSON verdict contract.
      return json(200, {
        model: "teacher-v1",
        choices: [{ message: { role: "assistant", content: JSON.stringify({ winner: "tuned", score: 5, reason: "the tuned answer follows the governed workspace behavior more accurately" }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      });
    }
    const model = requestedModel || "student-v1";
    return json(200, {
      model,
      choices: [{ message: { role: "assistant", content: model === "base-v1" ? "generic base answer" : "workspace-specific tuned answer" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
  }`,
    "canonical evaluator chat endpoints",
  );
}

if (!source.includes("providerId: \"teacher-test\"")) {
  replaceOnce(
    `  const mothership = buildMothershipProxyRow({
    modelTag: "student-v1",
    workspaceSlug: "workspace-local",
    studentRegistryId: "student-model",
    fallbackBaseModel: "base-v1",
    fallbackBaseUrl: providerBase,
  });`,
    `  const mothership = buildMothershipProxyRow({
    modelTag: "student-v1",
    workspaceSlug: "workspace-local",
    studentRegistryId: "student-model",
    fallbackBaseModel: "base-v1",
    fallbackBaseUrl: providerBase,
    teacher: { providerId: "teacher-test", baseUrl: providerBase, modelTag: "teacher-v1", authEnvVar: "" },
  });`,
    "canonical evaluator teacher route",
  );
}

if (!source.includes("Canonical evaluation holdouts")) {
  replaceOnce(
    `  const runIds = ["route-crash", "route-resume", "route-cancel", "route-success"];`,
    `  // Canonical evaluation holdouts are server-owned workspace evidence and
  // are deliberately not exported into the training corpus.
  const holdoutRows = Array.from({ length: 6 }, (_, index) => ({
    inputPrompt: \`Canonical evaluation holdout \${index}: answer with the governed workspace behavior.\`,
    agentOutput: \`reference \${index}\`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "false",
    evaluationHoldout: true,
    sessionDate: \`2026-07-\${String(index + 1).padStart(2, "0")}\`,
  }));
  const existingTraces = objects.find((object) => object.id === "training-traces" || object.objectType === "training-traces");
  if (existingTraces) existingTraces.rows = holdoutRows;
  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: holdoutRows });

  const runIds = ["route-crash", "route-resume", "route-cancel", "route-success"];`,
    "canonical holdout task set",
  );
}

if (source.includes(`  assert.equal(recoveredCompute.evaluation, null, "provider-authored wins did not become canonical evaluation");`)) {
  replaceOnce(
    `  assert.equal(recoveredCompute.evaluation, null, "provider-authored wins did not become canonical evaluation");`,
    `  assert.equal(recoveredCompute.evaluation?.source, "workspace-canonical");
  assert.equal(recoveredCompute.evaluation?.benchmarkWins?.promoted, true);
  assert.equal(recoveredCompute.evaluation?.taskCount, 6);
  assert.match(String(recoveredCompute.evaluation?.taskSetHash || ""), /^[0-9a-f]{64}$/);`,
    "recovered canonical evaluation assertions",
  );
}

if (source.includes(`  assert.equal(successCompute.evaluation, null);
  const successDistillation = typeof successRow.distillation === "string"
    ? JSON.parse(successRow.distillation)
    : successRow.distillation;
  assert.equal(successDistillation?.benchmarkWins, undefined, "provider-controlled score rows never minted promotion");`)) {
  replaceOnce(
    `  assert.equal(successCompute.evaluation, null);
  const successDistillation = typeof successRow.distillation === "string"
    ? JSON.parse(successRow.distillation)
    : successRow.distillation;
  assert.equal(successDistillation?.benchmarkWins, undefined, "provider-controlled score rows never minted promotion");`,
    `  assert.equal(successCompute.evaluation?.source, "workspace-canonical");
  assert.equal(successCompute.evaluation?.evaluatorVersion, "custom-model-eval-vs-base-v1");
  assert.equal(successCompute.evaluation?.artifactSha256, artifactSha);
  assert.equal(successCompute.evaluation?.benchmarkWins?.promoted, true);
  assert.equal(successCompute.evaluation?.taskCount, 6);
  assert.equal(JSON.stringify(successCompute.evaluation).includes("Canonical evaluation holdout"), false, "raw holdout prompts stay out of the compute journal");
  const successDistillation = typeof successRow.distillation === "string"
    ? JSON.parse(successRow.distillation)
    : successRow.distillation;
  assert.equal(successDistillation?.benchmarkWins?.promoted, true);
  assert.equal(successDistillation?.evaluationLineage?.source, "workspace-canonical");`,
    "success canonical evaluation assertions",
  );
}

source = source.replace(
  "verified artifact, provider-score isolation, PATCH integrity, Mothership reload truth",
  "verified artifact, workspace-owned canonical evaluation against losing provider self-scores, PATCH integrity, Mothership reload truth",
);

fs.writeFileSync(file, source);
console.log("[canonical-e2e] booted route proof now proves workspace-owned evaluation and provider-score isolation");
