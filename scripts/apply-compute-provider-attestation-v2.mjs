#!/usr/bin/env node
/** Current-head provider artifact attestation wiring. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);
const fail = (message) => { throw new Error(`[provider-attestation-v2] ${message}`); };
function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) fail(`missing source for ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) fail(`ambiguous source for ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const evidencePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-evidence.js";
let evidence = read(evidencePath);
if (!evidence.includes("providerAttestationVerified: raw.providerAttestationVerified === true")) {
  evidence = replaceOnce(
    evidence,
    `    workSpecHash: str(raw.workSpecHash).trim(),\n    requirementsHash: str(raw.requirementsHash).trim(),\n    verifiedSha256: str(raw.verifiedSha256).trim(),`,
    `    workSpecHash: str(raw.workSpecHash).trim(),\n    requirementsHash: str(raw.requirementsHash).trim(),\n    corpusSha256: str(raw.corpusSha256 || raw.datasetSha256).trim(),\n    providerAttestationVerified: raw.providerAttestationVerified === true,\n    providerAttestationReason: str(raw.providerAttestationReason).trim(),\n    verifiedSha256: str(raw.verifiedSha256).trim(),`,
    "artifact attestation fields",
  );
}
if (!evidence.includes('reasonCode: "artifact-provider-attestation-missing"')) {
  evidence = replaceOnce(
    evidence,
    `  if (!art.sha256) {\n    return { promotable: false, reasonCode: "artifact-unproven", reason: "artifact has no sha256 identity — a claimed artifact is not a verified one" };\n  }\n  const expected = str(expectedSha256).trim();`,
    `  if (!art.sha256) {\n    return { promotable: false, reasonCode: "artifact-unproven", reason: "artifact has no sha256 identity — a claimed artifact is not a verified one" };\n  }\n  if (art.providerAttestationVerified !== true) {\n    return {\n      promotable: false,\n      reasonCode: "artifact-provider-attestation-missing",\n      reason: art.providerAttestationReason || "provider artifact does not attest the exact governed work-spec and corpus identities",\n    };\n  }\n  const expected = str(expectedSha256).trim();`,
    "artifact attestation honesty gate",
  );
}
write(evidencePath, evidence);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
if (!execution.includes("const providerAttestationVerified = Boolean(")) {
  const start = execution.indexOf("      const { evaluationResults: _untrustedEvaluation, ...artifactEvidence } = collected;");
  const endMarker = "      artifact = verified && !verified.__error && verified.verifiedSha256 === candidate.sha256";
  const end = execution.indexOf(endMarker, start);
  if (start < 0 || end < 0) fail("could not locate artifact collection block");
  const prefix = execution.slice(start, end);
  const verifiedStart = prefix.lastIndexOf("      const verified = ");
  if (verifiedStart < 0) fail("artifact verifier declaration not found");
  const replacement = `      const { evaluationResults: _untrustedEvaluation, ...artifactEvidence } = collected;\n      const reportedWorkSpecHash = str(artifactEvidence.workSpecHash);\n      const reportedCorpusSha256 = str(artifactEvidence.corpusSha256 || artifactEvidence.datasetSha256);\n      const expectedWorkSpecHash = str(workSpec?.workSpecHash);\n      const expectedCorpusSha256 = str(workSpec?.dataset?.corpusSha256);\n      const providerAttestationVerified = Boolean(\n        reportedWorkSpecHash\n          && reportedCorpusSha256\n          && reportedWorkSpecHash === expectedWorkSpecHash\n          && reportedCorpusSha256 === expectedCorpusSha256,\n      );\n      const providerAttestationReason = providerAttestationVerified\n        ? "provider artifact binds the exact governed work-spec and corpus identities"\n        : \`provider artifact attestation mismatch: expected workSpec=\${expectedWorkSpecHash || "missing"} corpus=\${expectedCorpusSha256 || "missing"}; received workSpec=\${reportedWorkSpecHash || "missing"} corpus=\${reportedCorpusSha256 || "missing"}\`;\n      const candidate = {\n        ...artifactEvidence,\n        workSpecHash: reportedWorkSpecHash,\n        corpusSha256: reportedCorpusSha256,\n        requirementsHash: intent?.requirementsHash || "",\n        providerAttestationVerified,\n        providerAttestationReason,\n      };\n      const verified = providerAttestationVerified && deliveryVerified && typeof io.verifyArtifact === "function"\n        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))\n        : null;\n`;
  execution = `${execution.slice(0, start)}${replacement}${execution.slice(start + verifiedStart + (prefix.length - verifiedStart))}`;
  // The splice above intentionally replaces the full pre-artifact-assignment
  // prefix. Verify no duplicate candidate/verifier declaration survived.
  const window = execution.slice(start, execution.indexOf(endMarker, start));
  if ((window.match(/const candidate =/g) || []).length !== 1 || (window.match(/const verified =/g) || []).length !== 1) {
    fail("artifact attestation block was not replaced exactly once");
  }
}
if (!execution.includes("const providerAttestationVerified = Boolean(")) fail("executor provider attestation is absent");
write(executionPath, execution);

for (const [file, oldSnippet, newSnippet, marker] of [
  [
    "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js",
    `      evidenceObservedAt: new Date().toISOString(),\n      evaluationResults: Array.isArray(call?.evaluationResults) ? call.evaluationResults : [],`,
    `      evidenceObservedAt: new Date().toISOString(),\n      workSpecHash: str(artifact.workSpecHash || call?.workSpecHash),\n      corpusSha256: str(artifact.corpusSha256 || call?.corpusSha256),\n      evaluationResults: Array.isArray(call?.evaluationResults) ? call.evaluationResults : [],`,
    "corpusSha256: str(artifact.corpusSha256 || call?.corpusSha256)",
  ],
  [
    "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js",
    `          evidenceObservedAt: new Date().toISOString(),\n          evaluationResults: Array.isArray(job?.output?.evaluationResults) ? job.output.evaluationResults : [],`,
    `          evidenceObservedAt: new Date().toISOString(),\n          workSpecHash: str(out.workSpecHash || job?.output?.workSpecHash),\n          corpusSha256: str(out.corpusSha256 || job?.output?.corpusSha256),\n          evaluationResults: Array.isArray(job?.output?.evaluationResults) ? job.output.evaluationResults : [],`,
    "corpusSha256: str(out.corpusSha256 || job?.output?.corpusSha256)",
  ],
  [
    "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js",
    `        evidenceObservedAt: new Date().toISOString(),\n        evaluationResults: Array.isArray(artifact.evaluationResults) ? artifact.evaluationResults : [],`,
    `        evidenceObservedAt: new Date().toISOString(),\n        workSpecHash: str(artifact.workSpecHash),\n        corpusSha256: str(artifact.corpusSha256 || artifact.datasetSha256),\n        evaluationResults: Array.isArray(artifact.evaluationResults) ? artifact.evaluationResults : [],`,
    "corpusSha256: str(artifact.corpusSha256 || artifact.datasetSha256)",
  ],
]) {
  let source = read(file);
  if (!source.includes(marker)) source = replaceOnce(source, oldSnippet, newSnippet, marker);
  if (!source.includes(marker)) fail(`adapter invariant missing: ${marker}`);
  write(file, source);
}

const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
if (!e2e.includes("const submittedAuthority = new Map();")) {
  e2e = replaceOnce(e2e, "const statusCalls = new Map();", "const statusCalls = new Map();\nconst submittedAuthority = new Map();", "provider authority memory");
}
if (!e2e.includes("submittedAuthority.set(callId")) {
  const oldReturn = `    datasetFetchCount += 1;\n    return json(200, { call_id: \`call-\${body.workSpec.trainingRunId}\` });`;
  const newReturn = `    datasetFetchCount += 1;\n    const callId = \`call-\${body.workSpec.trainingRunId}\`;\n    submittedAuthority.set(callId, {\n      workSpecHash: body.workSpec.workSpecHash,\n      corpusSha256: body.datasetAccess.corpusSha256,\n    });\n    return json(200, { call_id: callId });`;
  e2e = replaceOnce(e2e, oldReturn, newReturn, "remember provider-consumed identities");
}
if (!e2e.includes("const attestedArtifact = (callId)")) {
  e2e = replaceOnce(
    e2e,
    "const submittedAuthority = new Map();",
    `const submittedAuthority = new Map();\nconst attestedArtifact = (callId) => {\n  const attestation = submittedAuthority.get(callId) || {};\n  return {\n    kind: "gguf",\n    locator: \`${providerBase}/artifact\`,\n    sha256: artifactSha,\n    sizeBytes: artifactBytes.length,\n    workSpecHash: attestation.workSpecHash,\n    corpusSha256: attestation.corpusSha256,\n  };\n};`,
    "attested artifact factory",
  );
}
const oldArtifact = `artifact: { kind: "gguf", locator: \`${providerBase}/artifact\`, sha256: artifactSha, sizeBytes: artifactBytes.length }`;
const occurrences = e2e.split(oldArtifact).length - 1;
if (occurrences > 0) e2e = e2e.split(oldArtifact).join("artifact: attestedArtifact(id)");
if (!e2e.includes("artifact: attestedArtifact(id)")) fail("booted provider responses do not carry attested artifacts");
if (!e2e.includes("successCompute.artifact.providerAttestationVerified")) {
  e2e = replaceOnce(
    e2e,
    `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);`,
    `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);\n  assert.equal(successCompute.artifact.providerAttestationVerified, true);\n  assert.equal(successCompute.artifact.workSpecHash, successCompute.workSpecHash);\n  assert.equal(successCompute.artifact.corpusSha256, successCompute.workSpec.dataset.corpusSha256);`,
    "booted provider attestation assertions",
  );
}
write(e2ePath, e2e);

const certification = read("scripts/run-compute-certification.mjs");
if (!certification.includes("scripts/unit-compute-provider-attestation.test.mjs")) fail("provider attestation suite is not in certification");
console.log("[provider-attestation-v2] exact work-spec and corpus attestation is enforced and booted-proofed");
