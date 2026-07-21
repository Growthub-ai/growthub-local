import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (name) => pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
  name,
)).href;

const {
  compileComputeAuthority,
  verifyComputeAuthorityAgainstWorkspace,
  verifyComputeAuthoritySeal,
} = await import(lib("compute-authority.js"));

const RUN_ID = "trainrun-production-authority";
const REQUEST = {
  schema: "growthub-compute-request-v1",
  policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 25 } },
  selectionMode: "explicit",
  providerRegistryId: "remote-provider",
  capacityProfileId: "single-gpu-finetune",
  trainingProfileId: "unsloth-qlora-quantize-pipeline",
  baseModel: "gemma3:4b",
  datasetExportId: "export-production-authority",
  datasetPath: "data/export-production-authority.jsonl",
  outputModelTag: "workspace-tuned-production",
  artifactPath: "artifacts/workspace-tuned-production",
};

function workspaceConfig() {
  return {
    dataModel: {
      objects: [
        {
          id: "model-training",
          objectType: "model-training",
          rows: [{
            Name: "workspace-local-v1",
            baseModel: REQUEST.baseModel,
            localModel: REQUEST.outputModelTag,
            apiRegistryId: "",
            lastExportId: REQUEST.datasetExportId,
            lastExportSummary: JSON.stringify({ recordCount: 10, path: REQUEST.datasetPath, version: 1 }),
          }],
        },
        {
          id: "model-training-run",
          objectType: "model-training-run",
          rows: [{
            trainingRunId: RUN_ID,
            modelTrainingRowId: "workspace-local",
            datasetExportId: REQUEST.datasetExportId,
            baseModel: REQUEST.baseModel,
            trainingProfile: REQUEST.trainingProfileId,
            status: "running",
            preflight: { ramGB: 16, diskFreeGB: 200, gpu: { present: false, vramFreeGB: 0 } },
            computeRequest: JSON.stringify(REQUEST),
          }],
        },
      ],
    },
  };
}

test("production remote authority compilation fails closed without a durable configured key", () => {
  const result = compileComputeAuthority({
    workspaceConfig: workspaceConfig(),
    trainingRunId: RUN_ID,
    env: { NODE_ENV: "production" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "authority-key-missing");
  assert.match(result.reason, /GROWTHUB_COMPUTE_AUTHORITY_KEY|GROWTHUB_WORKSPACE_SIGNING_KEY/);
});

test("production may compile under the shared workspace signing root using a compute-specific derived subkey", () => {
  const env = { NODE_ENV: "production", GROWTHUB_WORKSPACE_SIGNING_KEY: "workspace-root-key" };
  const result = compileComputeAuthority({ workspaceConfig: workspaceConfig(), trainingRunId: RUN_ID, env });
  assert.equal(result.ok, true, result.reason);
  assert.match(result.authority.keyId, /^wsk-[0-9a-f]{16}$/);
  assert.equal(verifyComputeAuthoritySeal(result.authority, env).ok, true);
});

test("an authority sealed under a development boot key is refused in production", () => {
  const dev = compileComputeAuthority({ workspaceConfig: workspaceConfig(), trainingRunId: RUN_ID, env: {} });
  assert.equal(dev.ok, true);
  assert.match(dev.authority.keyId, /^boot-/);
  const production = verifyComputeAuthoritySeal(dev.authority, { NODE_ENV: "production" });
  assert.equal(production.ok, false);
  assert.equal(production.reasonCode, "authority-key-missing");
});

test("seal verification happens before persisted dataset metadata is reused", () => {
  const env = { NODE_ENV: "production", GROWTHUB_COMPUTE_AUTHORITY_KEY: "dedicated-production-key" };
  const compiled = compileComputeAuthority({
    workspaceConfig: workspaceConfig(),
    trainingRunId: RUN_ID,
    datasetManifest: { corpusSha256: "a".repeat(64), sizeBytes: 42 },
    env,
  });
  assert.equal(compiled.ok, true);
  const forged = {
    ...compiled.authority,
    dataset: { exportId: REQUEST.datasetExportId, corpusSha256: "f".repeat(64), sizeBytes: Number.MAX_SAFE_INTEGER },
  };
  const verdict = verifyComputeAuthorityAgainstWorkspace({
    workspaceConfig: workspaceConfig(),
    trainingRunId: RUN_ID,
    authority: forged,
    env,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasonCode, "seal-invalid");
  // The recompile still runs (the key-rotation reseal path needs its content
  // identity), but ONLY from caller-trusted inputs: the forged persisted
  // manifest never enters it, and the content therefore does not match.
  assert.ok(verdict.recompiled, "current truth recompiles from trusted server inputs");
  assert.equal(verdict.recompiled.dataset.corpusSha256, "", "unverified persisted metadata never enters recompilation");
  assert.equal(verdict.recompiled.dataset.binding, "metadata-only");
  assert.equal(verdict.contentMatches, false, "a manifest-forged authority can never read as content-identical");
});
