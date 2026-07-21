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

const VERSION_ROW = {
  Name: "workspace-local-v1",
  status: "prepared",
  lastExportId: "export-1",
  baseModel: "gemma3:4b",
  localModel: "workspace-tuned-v1",
  apiRegistryId: "workspace-local-model",
  lastExportSummary: JSON.stringify({ recordCount: 42, path: "data/export-1.jsonl", registryId: "workspace-local-model", version: 1 }),
  computePolicy: JSON.stringify({ mode: "cloud", excludeLocal: true }),
};

const SEALED_COMPUTE = JSON.stringify({
  schema: "growthub-compute-evidence-v1",
  authority: {
    schema: "growthub-compute-authority-v1",
    authorityHash: "a".repeat(64),
    keyId: "wsk-deadbeefdeadbeef",
    seal: "b".repeat(64),
    trainingRowBinding: {
      rowName: VERSION_ROW.Name,
      lastExportId: VERSION_ROW.lastExportId,
      baseModel: VERSION_ROW.baseModel,
    },
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
  datasetExportId: VERSION_ROW.lastExportId,
  baseModel: VERSION_ROW.baseModel,
  outputModelTag: VERSION_ROW.localModel,
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

function config(rows = [runRow()], versionRows = [VERSION_ROW]) {
  return {
    dataModel: {
      objects: [
        {
          id: "model-training",
          objectType: "model-training",
          rows: versionRows,
        },
        {
          id: "model-training-run",
          objectType: "model-training-run",
          rows,
        },
      ],
    },
  };
}

function patch(rows, {
  includeRunObject = true,
  includeVersionObject = true,
  versionRows = [VERSION_ROW],
} = {}) {
  const objects = [];
  if (includeVersionObject) {
    objects.push({ id: "model-training", objectType: "model-training", rows: versionRows });
  }
  if (includeRunObject) {
    objects.push({ id: "model-training-run", objectType: "model-training-run", rows });
  }
  return { dataModel: { objects } };
}

function verdict(current, incoming) {
  return evaluateTrainingEvidencePatchCompleteness(current, incoming);
}

function paths(result) {
  return result.violations.map((item) => item.path);
}

test("byte-identical protected evidence and authority-bound version row survive replacement PATCH", () => {
  const result = verdict(config(), patch([runRow()]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("omitting compute from an existing protected row is rejected", () => {
  const incoming = runRow();
  delete incoming.compute;
  const result = verdict(config(), patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".compute")));
});

test("changing computeRequest after server authority is sealed is rejected", () => {
  const incoming = runRow({
    computeRequest: JSON.stringify({
      schema: "growthub-compute-request-v1",
      policy: { mode: "cloud", excludeLocal: true },
      providerRegistryId: "attacker-selected-provider",
      outputModelTag: "attacker-output",
    }),
  });
  const result = verdict(config(), patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".computeRequest")));
});

test("omitting the authority-bound model-training version object is rejected", () => {
  const result = verdict(config(), patch([runRow()], { includeVersionObject: false }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /may not be deleted, duplicated, or renamed/.test(item.message)));
});

test("changing a protected field on the authority-bound version row is rejected", () => {
  const changed = { ...VERSION_ROW, baseModel: "attacker-base:70b" };
  const result = verdict(config(), patch([runRow()], { versionRows: [changed] }));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".baseModel")));
});

test("duplicating the authority-bound version row is rejected as ambiguous", () => {
  const duplicate = { ...VERSION_ROW, Name: "workspace-local-v2" };
  const result = verdict(config(), patch([runRow()], { versionRows: [VERSION_ROW, duplicate] }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /expected exactly one match/.test(item.message)));
});

test("omitting benchmarkWins from distillation is rejected", () => {
  const incoming = runRow({ distillation: JSON.stringify({ teacherModel: "teacher" }) });
  const result = verdict(config(), patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".distillation.benchmarkWins")));
});

test("omitting a verified artifact field from a remote-compute row is rejected", () => {
  const incoming = runRow();
  delete incoming.artifactSha256;
  const result = verdict(config(), patch([incoming]));
  assert.equal(result.ok, false);
  assert.ok(paths(result).some((value) => value.endsWith(".artifactSha256")));
});

test("omitting a protected run row is rejected", () => {
  const result = verdict(config(), patch([]));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /may not be deleted/.test(item.message)));
});

test("omitting the entire model-training-run object is rejected", () => {
  const result = verdict(config(), patch([], { includeRunObject: false }));
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
