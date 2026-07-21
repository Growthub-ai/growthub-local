import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executionPath = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js");

test("paid provider release is confirmed before canonical evaluation begins", () => {
  const source = fs.readFileSync(executionPath, "utf8");
  const releaseRequest = source.indexOf('events.push(workspaceEvent(io, "compute-release-requested"');
  const releaseCall = source.indexOf("adapter.release(ctx())", releaseRequest);
  const releaseFold = source.indexOf("lifecycle = deriveComputeLifecycle", releaseCall);
  const evaluationCall = source.indexOf("io.evaluateArtifact", releaseFold);
  assert.ok(releaseRequest >= 0 && releaseCall > releaseRequest && releaseFold > releaseCall && evaluationCall > releaseFold,
    "release request, provider release, lifecycle confirmation, then evaluation must remain in that order");
  assert.match(source, /canonical evaluation waits until provider capacity release is confirmed/);
});
