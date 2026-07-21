import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("real sandbox route owns the journal, authority, governed network, lifecycle controls, and streamed artifact verification", () => {
  const route = read("app/api/workspace/sandbox-run/route.js");
  assert.match(route, /persistComputeReceipt/);
  assert.match(route, /persistCompute:\s*\(computeBlock\)/);
  assert.match(route, /createGovernedComputeFetchJson/);
  assert.match(route, /governedComputeFetchJson/);
  assert.match(route, /verifyGovernedComputeArtifact/);
  assert.doesNotMatch(route, /Buffer\.from\(await res\.arrayBuffer\(\)\)/, "artifacts must not be buffered without a ceiling");
  assert.doesNotMatch(route, /async function verifyComputeArtifactBytes/, "the unsafe route-local artifact verifier was removed");
  assert.match(route, /computeAction/);
  assert.match(route, /checkpointId/);
  assert.match(route, /effectiveAdapterId === "provider-compute" \? await readWorkspaceConfig/);
  assert.match(route, /compileComputeAuthority/);
  assert.match(route, /verifyComputeAuthorityAgainstWorkspace/);
  assert.match(route, /compileAuthority: async/);
  assert.match(route, /verifyAuthority: async/);
  assert.match(route, /refusing to journal a stale authority/);
});

test("execution seam is monotonic, continuation-safe, and isolates provider scores from promotion", () => {
  const execution = read("lib/compute-execution.js");
  assert.match(execution, /mergeComputeBlocks/);
  assert.match(execution, /remote-state-unverified/);
  assert.match(execution, /MAX_POLLS_PER_INVOCATION/);
  assert.match(execution, /active allocation conflict/);
  assert.match(execution, /workspace-canonical/);
  assert.match(execution, /evaluationResults:\s*_untrustedEvaluation/);
  assert.match(execution, /resume attempt allocation/);
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

test("PATCH and completeness policies protect model-training evidence as server-owned", () => {
  const policy = read("lib/workspace-patch-policy.js");
  const completeness = read("lib/workspace-training-evidence-policy.js");
  assert.match(policy, /training_evidence_field/);
  assert.match(policy, /checkTrainingRunRow/);
  assert.match(policy, /TRAINING_EVIDENCE_ROW_FIELDS/);
  assert.match(completeness, /computeRequest/);
  assert.match(completeness, /model-training-run contains server-owned evidence/);
  assert.match(completeness, /authority-bound model-training version row/);
});
