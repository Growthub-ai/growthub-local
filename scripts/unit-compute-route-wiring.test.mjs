import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("real sandbox route owns progressive journal, lifecycle controls, and byte verification", () => {
  const route = read("app/api/workspace/sandbox-run/route.js");
  assert.match(route, /persistComputeReceipt/);
  assert.match(route, /persistCompute:\s*\(computeBlock\)/);
  assert.match(route, /verifyComputeArtifactBytes/);
  assert.match(route, /materialized artifact SHA-256 does not match/);
  assert.match(route, /computeAction/);
  assert.match(route, /checkpointId/);
  assert.match(route, /effectiveAdapterId === "provider-compute" \? await readWorkspaceConfig/);
});

test("training receipt and UI use immutable intent/work spec and remote evidence disables local zombie timeout", () => {
  const modal = read("app/data-model/components/TrainingHandoffModal.jsx");
  assert.match(modal, /buildComputeIntent/);
  assert.match(modal, /buildComputeWorkSpec/);
  assert.match(modal, /computePolicy = JSON\.stringify/);
  assert.match(modal, /remoteCompute\?\.decision \|\| remoteCompute\?\.events/);
  assert.match(modal, /controlProviderCompute\("cancel"\)/);
  assert.match(modal, /controlProviderCompute\("resume"/);
});
