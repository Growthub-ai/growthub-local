/**
 * Unit tests for deriveOrchestrationNodeStatuses — the GENERAL orchestration
 * per-node status projection (not swarm). Proves it reads the real streamed
 * orchestration.node.* deltas live and settles from the persisted nodeTrace.
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

const { deriveOrchestrationNodeStatuses } = await import(
  pathToFileURL(path.join(kitLib, "orchestration-node-status.js")).href
);

const ev = (type, nodeId) => ({ kind: "growthub-sandbox-run-delta-v1", type, nodeId });

test("empty input → empty map", () => {
  assert.deepEqual(deriveOrchestrationNodeStatuses({}), {});
  assert.deepEqual(deriveOrchestrationNodeStatuses({ events: [], record: null }), {});
});

test("live: started → running, latest event wins", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [
      ev("orchestration.node.started", "n-input"),
      ev("orchestration.node.completed", "n-input"),
      ev("orchestration.node.started", "n-api"),
    ],
  });
  assert.equal(map["n-input"], "completed");
  assert.equal(map["n-api"], "running");
});

test("live: failure + skipped downstream are truthful", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [
      ev("orchestration.node.completed", "n-input"),
      ev("orchestration.node.failed", "n-api"),
      ev("orchestration.node.skipped", "n-transform"),
      ev("orchestration.node.skipped", "n-result"),
    ],
  });
  assert.equal(map["n-input"], "completed");
  assert.equal(map["n-api"], "failed");
  assert.equal(map["n-transform"], "skipped");
  assert.equal(map["n-result"], "skipped");
});

test("non-orchestration delta events are ignored", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [
      { kind: "growthub-sandbox-run-delta-v1", type: "swarm.task.started", nodeId: "x" },
      { kind: "growthub-sandbox-run-delta-v1", type: "sandbox-run.accepted" },
      ev("orchestration.node.completed", "n-api"),
    ],
  });
  assert.deepEqual(map, { "n-api": "completed" });
});

test("settled: falls back to persisted nodeTrace when no events", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [],
    record: { nodeTrace: [
      { id: "n-input", status: "completed" },
      { id: "n-api", status: "failed", error: "HTTP 500" },
      { id: "n-result", status: "skipped" },
    ] },
  });
  assert.deepEqual(map, { "n-input": "completed", "n-api": "failed", "n-result": "skipped" });
});

test("live events take precedence over the persisted trace", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [ev("orchestration.node.running" /* not a real phase */, "n-api")].filter(() => false).concat([ev("orchestration.node.started", "n-api")]),
    record: { nodeTrace: [{ id: "n-api", status: "completed" }] },
  });
  assert.equal(map["n-api"], "running");
});

test("malformed entries never throw", () => {
  const map = deriveOrchestrationNodeStatuses({
    events: [null, 5, "x", {}, { type: "orchestration.node.completed" }, ev("orchestration.node.completed", "ok")],
    record: { nodeTrace: [null, 7, { status: "completed" }] },
  });
  assert.deepEqual(map, { ok: "completed" });
});
