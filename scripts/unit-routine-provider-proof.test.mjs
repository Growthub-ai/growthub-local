import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRoutineProviderProof } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/routine-provider-proof.js";

test("accepts one exact secret-free Runtime v2 proof", () => {
  assert.deepEqual(normalizeRoutineProviderProof({
    providerRunId: "run-1",
    workflowRunId: "workflow-run-1",
    executionContractSha256: "a".repeat(64),
    registrationContractSha256: "b".repeat(64),
    ignored: "not copied",
  }, "run-1"), {
    providerRunId: "run-1",
    workflowRunId: "workflow-run-1",
    executionContractSha256: "a".repeat(64),
    registrationContractSha256: "b".repeat(64),
  });
});

test("rejects mismatched, incomplete, or malformed Runtime v2 proof", () => {
  const proof = {
    providerRunId: "run-1",
    workflowRunId: "workflow-run-1",
    executionContractSha256: "a".repeat(64),
    registrationContractSha256: "b".repeat(64),
  };
  assert.equal(normalizeRoutineProviderProof(proof, "run-2"), null);
  assert.equal(normalizeRoutineProviderProof({ ...proof, workflowRunId: "" }, "run-1"), null);
  assert.equal(normalizeRoutineProviderProof({ ...proof, executionContractSha256: "not-a-hash" }, "run-1"), null);
});
