import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-training-evidence-policy.js",
)).href;
const {
  evaluateTrainingEvidencePatchCompleteness,
} = await import(moduleUrl);

const SEALED_COMPUTE = JSON.stringify({
  schema: "growthub-compute-evidence-v1",
  authority: {
    schema: "growthub-compute-authority-v1",
    authorityHash: "a".repeat(64),
    keyId: "wsk-deadbeefdeadbeef",
    seal: "b".repeat(64),
  },
  decision: {
    schema: "growthub-compute-decision-v1",
    selectedProviderId: "remote-provider",
  },
  allocation: {
    allocationId: "alloc-1",
    releaseConfirmed: false,
  },
  events: [{ type: "compute-allocated", providerEventId: "evt-1" }],
});

const COMPUTE_REQUEST = JSON.stringify({
  schema: "growthub-compute-request-v1",
  policy: { mode: "cloud", excludeLocal: true },
  providerRegistryId: "remote-provider",
  outputModelTag: "workspace-tuned-v1",
});

function runRow(overrides = {}) {
  return {
    trainingRunId: "trainrun-1",
    status: "imported",
    computeRequest: COMPUTE_REQUEST,
    compute: SEALED_COMPUTE,
    artifactType: "gguf",
    artifactPath: "/governed/artifacts/model.gguf",
    artifactSha256: "c".repeat(64),
    artifactArtifactBytes: 1024,
    distillation: JSON.stringify({
      benchmarkWins: { total: 6, wins: 5, winRatePct: 83.3, promoted: true },
    }),
    ...overrides,
  };
}

function config(rows = [runRow()]) {
  return {
    dataModel: {
      objects: [{
        id: "model-training-run",
        objectType: "model-training-run",
        rows,
      }],
    },
  };
}

function patch(rows, { includeObject = true } = {}) {
  return {
    dataModel: {
      objects: includeObject ? [{
        id: "model-training-run",
        objectType: "model-training-run",
        rows,
      }] : [],
    },
  };
}

function verdict(current, incoming) {
  return evaluateTrainingEvidencePatchCompleteness(current, incoming);
}

function paths(result) {
  return result.violations.map((item) => item.path);
}

test("byte-identical protected evidence survives a replacement dataModel PATCH", () => {
  const current = config();
  const result = verdict(current, patch([runRow()]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("omitting compute from an existing protected row is rejected", () => {
  const current = config();
  const incoming = runRow();
  delete incoming.compute;
  const result = verdict(current, patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".compute")));
});

test("changing computeRequest after server authority is sealed is rejected", () => {
  const current = config();
  const incoming = runRow({
    computeRequest: JSON.stringify({
      schema: "growthub-compute-request-v1",
      policy: { mode: "cloud", excludeLocal: true },
      providerRegistryId: "attacker-selected-provider",
      outputModelTag: "attacker-output",
    }),
  });
  const result = verdict(current, patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".computeRequest")));
});

test("omitting benchmarkWins from distillation is rejected", () => {
  const current = config();
  const incoming = runRow({ distillation: JSON.stringify({ teacherModel: "teacher" }) });
  const result = verdict(current, patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".distillation.benchmarkWins")));
});

test("omitting a verified artifact field from a remote-compute row is rejected", () => {
  const current = config();
  const incoming = runRow();
  delete incoming.artifactSha256;
  const result = verdict(current, patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".artifactSha256")));
});

test("omitting a protected run row is rejected", () => {
  const result = verdict(config(), patch([]));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /may not be deleted/.test(item.message)));
});

test("omitting the entire model-training-run object is rejected", () => {
  const result = verdict(config(), patch([], { includeObject: false }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /may not be removed/.test(item.message)));
});

test("duplicate incoming trainingRunId values are rejected as ambiguous", () => {
  const result = verdict(config(), patch([runRow(), runRow({ status: "failed" })]));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /duplicate trainingRunId/.test(item.message)));
});

test("deleting an evidence-free historical row remains allowed", () => {
  const unprotected = {
    trainingRunId: "trainrun-unprotected",
    status: "prepared",
    computeRequest: JSON.stringify({ schema: "growthub-compute-request-v1", policy: { mode: "local" } }),
  };
  const current = config([runRow(), unprotected]);
  const result = verdict(current, patch([runRow()]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("a patch that does not replace dataModel is unaffected", () => {
  const result = verdict(config(), { dashboards: [] });
  assert.equal(result.ok, true);
});
