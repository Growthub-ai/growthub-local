import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("real sandbox route owns progressive journal, lifecycle controls, byte verification, and the server authority seam", () => {
  const route = read("app/api/workspace/sandbox-run/route.js");
  assert.match(route, /persistComputeReceipt/);
  assert.match(route, /persistCompute:\s*\(computeBlock\)/);
  assert.match(route, /verifyComputeArtifactBytes/);
  assert.match(route, /materialized artifact SHA-256 does not match/);
  assert.match(route, /computeAction/);
  assert.match(route, /checkpointId/);
  assert.match(route, /effectiveAdapterId === "provider-compute" \? await readWorkspaceConfig/);
  // Server-owned authority: the route injects the compiler + the ONE
  // production verification function from lib/compute-authority.js into the
  // execution seam, re-reading CURRENT config for both (no stale snapshot),
  // and refuses to journal a stale authority beside a changed request.
  assert.match(route, /compileComputeAuthority/);
  assert.match(route, /verifyComputeAuthorityAgainstWorkspace/);
  assert.match(route, /compileAuthority: async/);
  assert.match(route, /verifyAuthority: async/);
  assert.match(route, /refusing to journal a stale authority/);
});

test("the browser persists only the customer compute request — never intent/work-spec authority", () => {
  const modal = read("app/data-model/components/TrainingHandoffModal.jsx");
  assert.match(modal, /buildComputeRequest/);
  assert.match(modal, /computeRequest/);
  assert.doesNotMatch(modal, /buildComputeIntent/, "the browser no longer authors compute intents");
  assert.doesNotMatch(modal, /buildComputeWorkSpec/, "the browser no longer authors work specs");
  assert.doesNotMatch(modal, /intentHash/, "no browser-minted authority hashes");
  assert.doesNotMatch(modal, /workSpecHash/, "no browser-minted work-spec hashes");
  assert.match(modal, /computePolicy = JSON\.stringify/);
  assert.match(modal, /remoteCompute\?\.decision \|\| remoteCompute\?\.events/);
  assert.match(modal, /controlProviderCompute\("cancel"\)/);
  assert.match(modal, /controlProviderCompute\("resume"/);
});

test("the PATCH policy protects model-training-run evidence as server-owned", () => {
  const policy = read("lib/workspace-patch-policy.js");
  assert.match(policy, /training_evidence_field/);
  assert.match(policy, /checkTrainingRunRow/);
  assert.match(policy, /TRAINING_EVIDENCE_ROW_FIELDS/);
});
