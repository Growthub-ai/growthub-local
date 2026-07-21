#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[provider-attestation] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[provider-attestation] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[provider-attestation] neither old nor hardened form found: ${label}`);
}

function replaceAllExact(source, before, after, { min = 1, label } = {}) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count < min) throw new Error(`[provider-attestation] expected at least ${min} ${label || "matches"}, found ${count}`);
  return parts.join(after);
}

const evidencePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-evidence.js";
let evidence = read(evidencePath);
evidence = replaceOrSkip(
  evidence,
  `    workSpecHash: str(raw.workSpecHash).trim(),
    requirementsHash: str(raw.requirementsHash).trim(),
    verifiedSha256: str(raw.verifiedSha256).trim(),`,
  `    workSpecHash: str(raw.workSpecHash).trim(),
    requirementsHash: str(raw.requirementsHash).trim(),
    corpusSha256: str(raw.corpusSha256 || raw.datasetSha256).trim(),
    providerAttestationVerified: raw.providerAttestationVerified === true,
    providerAttestationReason: str(raw.providerAttestationReason).trim(),
    verifiedSha256: str(raw.verifiedSha256).trim(),`,
  `providerAttestationVerified: raw.providerAttestationVerified === true`,
  "artifact attestation fields",
);
evidence = replaceOrSkip(
  evidence,
  `  if (!art.sha256) {
    return { promotable: false, reasonCode: "artifact-unproven", reason: "artifact has no sha256 identity — a claimed artifact is not a verified one" };
  }
  const expected = str(expectedSha256).trim();`,
  `  if (!art.sha256) {
    return { promotable: false, reasonCode: "artifact-unproven", reason: "artifact has no sha256 identity — a claimed artifact is not a verified one" };
  }
  if (art.providerAttestationVerified !== true) {
    return {
      promotable: false,
      reasonCode: "artifact-provider-attestation-missing",
      reason: art.providerAttestationReason || "provider artifact does not attest the exact governed work-spec and corpus identities",
    };
  }
  const expected = str(expectedSha256).trim();`,
  `reasonCode: "artifact-provider-attestation-missing"`,
  "attestation honesty gate",
);
write(evidencePath, evidence);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `      const { evaluationResults: _untrustedEvaluation, ...artifactEvidence } = collected;
      const candidate = {
        ...artifactEvidence,
        workSpecHash: workSpec?.workSpecHash || "",
        requirementsHash: intent?.requirementsHash || "",
      };
      const verified = deliveryVerified && typeof io.verifyArtifact === "function"
        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))
        : null;`,
  `      const { evaluationResults: _untrustedEvaluation, ...artifactEvidence } = collected;
      const reportedWorkSpecHash = str(artifactEvidence.workSpecHash);
      const reportedCorpusSha256 = str(artifactEvidence.corpusSha256 || artifactEvidence.datasetSha256);
      const expectedWorkSpecHash = str(workSpec?.workSpecHash);
      const expectedCorpusSha256 = str(workSpec?.dataset?.corpusSha256);
      const providerAttestationVerified = Boolean(
        reportedWorkSpecHash
          && reportedCorpusSha256
          && reportedWorkSpecHash === expectedWorkSpecHash
          && reportedCorpusSha256 === expectedCorpusSha256,
      );
      const providerAttestationReason = providerAttestationVerified
        ? "provider artifact binds the exact governed work-spec and delivered corpus identities"
        : `provider artifact attestation mismatch: expected workSpec=${expectedWorkSpecHash || "missing"} corpus=${expectedCorpusSha256 || "missing"}; received workSpec=${reportedWorkSpecHash || "missing"} corpus=${reportedCorpusSha256 || "missing"}`;
      const candidate = {
        ...artifactEvidence,
        workSpecHash: reportedWorkSpecHash,
        corpusSha256: reportedCorpusSha256,
        requirementsHash: intent?.requirementsHash || "",
        providerAttestationVerified,
        providerAttestationReason,
      };
      const verified = providerAttestationVerified && deliveryVerified && typeof io.verifyArtifact === "function"
        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))
        : null;`,
  `const providerAttestationVerified = Boolean(`,
  "provider-reported artifact binding",
);
write(executionPath, execution);

const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  `      evidenceObservedAt: new Date().toISOString(),
      evaluationResults: Array.isArray(call?.evaluationResults) ? call.evaluationResults : [],`,
  `      evidenceObservedAt: new Date().toISOString(),
      // A compliant worker computes these from the exact request it consumed;
      // the workspace independently compares them with sealed authority.
      workSpecHash: str(artifact.workSpecHash || call?.workSpecHash),
      corpusSha256: str(artifact.corpusSha256 || call?.corpusSha256),
      evaluationResults: Array.isArray(call?.evaluationResults) ? call.evaluationResults : [],`,
  `corpusSha256: str(artifact.corpusSha256 || call?.corpusSha256)`,
  "Modal artifact attestation",
);
write(modalPath, modal);

const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  `          evidenceObservedAt: new Date().toISOString(),
          evaluationResults: Array.isArray(job?.output?.evaluationResults) ? job.output.evaluationResults : [],`,
  `          evidenceObservedAt: new Date().toISOString(),
          workSpecHash: str(out.workSpecHash || job?.output?.workSpecHash),
          corpusSha256: str(out.corpusSha256 || job?.output?.corpusSha256),
          evaluationResults: Array.isArray(job?.output?.evaluationResults) ? job.output.evaluationResults : [],`,
  `corpusSha256: str(out.corpusSha256 || job?.output?.corpusSha256)`,
  "Runpod artifact attestation",
);
write(runpodPath, runpod);

const rayPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js";
let ray = read(rayPath);
ray = replaceOrSkip(
  ray,
  `        evidenceObservedAt: new Date().toISOString(),
        evaluationResults: Array.isArray(artifact.evaluationResults) ? artifact.evaluationResults : [],`,
  `        evidenceObservedAt: new Date().toISOString(),
        workSpecHash: str(artifact.workSpecHash),
        corpusSha256: str(artifact.corpusSha256 || artifact.datasetSha256),
        evaluationResults: Array.isArray(artifact.evaluationResults) ? artifact.evaluationResults : [],`,
  `corpusSha256: str(artifact.corpusSha256 || artifact.datasetSha256)`,
  "Ray artifact attestation",
);
write(rayPath, ray);

const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
e2e = replaceOrSkip(
  e2e,
  `const statusCalls = new Map();`,
  `const statusCalls = new Map();
const submittedAuthority = new Map();`,
  `const submittedAuthority = new Map();`,
  "booted provider authority memory",
);
e2e = replaceOrSkip(
  e2e,
  `    datasetFetchCount += 1;
    return json(200, { call_id: `call-${body.workSpec.trainingRunId}` });`,
  `    datasetFetchCount += 1;
    const callId = `call-${body.workSpec.trainingRunId}`;
    submittedAuthority.set(callId, {
      workSpecHash: body.workSpec.workSpecHash,
      corpusSha256: body.datasetAccess.corpusSha256,
    });
    return json(200, { call_id: callId });`,
  `submittedAuthority.set(callId`,
  "remember provider-consumed identities",
);

if (!e2e.includes("workSpecHash: submittedAuthority.get(id)?.workSpecHash")) {
  const compactOld = `artifact: { kind: "gguf", locator: `${providerBase}/artifact`, sha256: artifactSha, sizeBytes: artifactBytes.length },`;
  const expanded = `artifact: {
          kind: "gguf",
          locator: `${providerBase}/artifact`,
          sha256: artifactSha,
          sizeBytes: artifactBytes.length,
          workSpecHash: submittedAuthority.get(id)?.workSpecHash || "",
          corpusSha256: submittedAuthority.get(id)?.corpusSha256 || "",
        },`;
  e2e = replaceAllExact(e2e, compactOld, expanded, { min: 2, label: "booted provider success artifact branches" });
}

e2e = replaceOrSkip(
  e2e,
  `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);`,
  `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);
  assert.equal(successCompute.artifact.providerAttestationVerified, true);
  assert.equal(successCompute.artifact.workSpecHash, successCompute.workSpecHash);
  assert.equal(successCompute.artifact.corpusSha256, successCompute.workSpec.dataset.corpusSha256);`,
  `successCompute.artifact.providerAttestationVerified`,
  "booted attestation proof",
);
write(e2ePath, e2e);

const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-provider-attestation.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-data-plane.test.mjs",
`,
    `  "scripts/unit-compute-data-plane.test.mjs",
  "scripts/unit-compute-provider-attestation.test.mjs",
`,
    "provider attestation certification suite",
  );
}
write(certificationPath, certification);

console.log("[provider-attestation] artifact import now requires exact work-spec and corpus identities reported by the provider worker");
