/**
 * Unit tests for deriveOrchestrationNodeRunStatuses — the per-node Workflow
 * Canvas status projection. Proves it is tied to the real run record, handles
 * success + failure + in-flight, settles on completion, and never fabricates
 * per-node frontier during an in-flight run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const { deriveOrchestrationNodeRunStatuses } = await import(
  pathToFileURL(path.join(kitLib, "orchestration-run-console.js")).href
);

// input → api-registry-call → transform → tool-result
const PIPELINE = [
  { id: "n-input", type: "input" },
  { id: "n-api", type: "api-registry-call" },
  { id: "n-transform", type: "transform-filter" },
  { id: "n-result", type: "tool-result" },
];

test("no nodes → empty map", () => {
  assert.deepEqual(deriveOrchestrationNodeRunStatuses([], { exitCode: 0 }), {});
});

test("no record and not running → no chips", () => {
  assert.deepEqual(deriveOrchestrationNodeRunStatuses(PIPELINE, null, {}), {});
});

test("terminal success → every node completed", () => {
  const map = deriveOrchestrationNodeRunStatuses(PIPELINE, { exitCode: 0 }, {});
  assert.deepEqual(map, {
    "n-input": "completed",
    "n-api": "completed",
    "n-transform": "completed",
    "n-result": "completed",
  });
});

test("HTTP failure → input completed, api failed, downstream waiting", () => {
  const map = deriveOrchestrationNodeRunStatuses(
    PIPELINE,
    { exitCode: 1, error: "HTTP 500", adapterMeta: { httpStatus: 500 } },
    {}
  );
  assert.equal(map["n-input"], "completed");
  assert.equal(map["n-api"], "failed");
  assert.equal(map["n-transform"], "waiting");
  assert.equal(map["n-result"], "waiting");
});

test("error-only failure (exit 0 + error) attributes failure, not success", () => {
  const map = deriveOrchestrationNodeRunStatuses(PIPELINE, { exitCode: 0, error: "boom" }, {});
  assert.equal(map["n-api"], "failed");
  assert.ok(!Object.values(map).includes("completed") || map["n-input"] === "completed");
});

test("canceled run is treated as a failure projection", () => {
  const map = deriveOrchestrationNodeRunStatuses(
    PIPELINE,
    { adapterMeta: { aborted: true } },
    {}
  );
  assert.equal(map["n-api"], "failed");
});

test("in-flight (running, no terminal record) → every node running, no fabricated frontier", () => {
  const map = deriveOrchestrationNodeRunStatuses(PIPELINE, null, { running: true });
  assert.deepEqual(Object.values(map), ["running", "running", "running", "running"]);
});

test("in-flight settles to terminal once the record is terminal", () => {
  // running flag still true but a terminal record exists → terminal truth wins.
  const map = deriveOrchestrationNodeRunStatuses(PIPELINE, { exitCode: 0 }, { running: true });
  assert.deepEqual(Object.values(map), ["completed", "completed", "completed", "completed"]);
});

test("pipeline without an api node attributes failure to the terminal node", () => {
  const nodes = [{ id: "a", type: "input" }, { id: "b", type: "tool-result" }];
  const map = deriveOrchestrationNodeRunStatuses(nodes, { exitCode: 2, error: "x" }, {});
  assert.equal(map["a"], "completed");
  assert.equal(map["b"], "failed");
});
