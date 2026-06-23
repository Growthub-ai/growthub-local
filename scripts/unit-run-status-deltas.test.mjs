/**
 * Unit tests for the run-status-deltas projection (P4 — live run status).
 *
 * Guards the evidence-only contract: no fabricated per-step success, terminal
 * phase from exitCode/error only, secrets redacted, bounded, never throws,
 * and legacy/old run records still project cleanly.
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

const { deriveRunStatusDeltas, classifyEventState } = await import(
  pathToFileURL(path.join(kitLib, "run-status-deltas.js")).href
);

test("empty / nullish input → safe idle delta", () => {
  for (const input of [null, undefined, "", "   ", 42, [], {}]) {
    const d = deriveRunStatusDeltas(input);
    assert.equal(d.phase, "idle");
    assert.equal(d.derivedFrom, "none");
    assert.deepEqual(d.steps, []);
    assert.equal(d.ok, false);
  }
});

test("malformed JSON string does not throw and degrades to idle", () => {
  const d = deriveRunStatusDeltas("{not valid json");
  assert.equal(d.phase, "idle");
  assert.equal(d.derivedFrom, "none");
});

test("succeeded: exitCode 0, no error → succeeded + log-derived terminal step", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0, ranAt: "2026-06-23T10:00:00Z", stdout: "hello\ndone", durationMs: 1200 });
  assert.equal(d.phase, "succeeded");
  assert.equal(d.ok, true);
  assert.equal(d.derivedFrom, "logs");
  const labels = d.steps.map((s) => s.label);
  assert.ok(labels.includes("Run started"));
  assert.ok(labels.includes("Completed"));
  const completed = d.steps.find((s) => s.label === "Completed");
  assert.equal(completed.state, "ok");
});

test("failed: non-zero exit → failed, terminal step is bad", () => {
  const d = deriveRunStatusDeltas({ exitCode: 1, stdout: "boom", ranAt: "x" });
  assert.equal(d.phase, "failed");
  assert.equal(d.ok, false);
  assert.equal(d.steps.find((s) => s.label === "Failed").state, "bad");
});

test("failed: error string with exit 0 still fails (error wins)", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0, error: "kaboom" });
  assert.equal(d.phase, "failed");
  assert.equal(d.ok, false);
});

test("running: evidence of start but no terminal exitCode/error", () => {
  const d = deriveRunStatusDeltas({ ranAt: "2026-06-23T10:00:00Z", stdout: "working...", status: "running" });
  assert.equal(d.phase, "running");
  // Latest log line surfaces as a non-terminal 'running' step, never 'ok'.
  const logStep = d.steps.find((s) => s.label === "Logs");
  assert.ok(logStep);
  assert.equal(logStep.state, "running");
  assert.ok(!d.steps.some((s) => s.label === "Completed"));
});

test("arbitrary log line is NEVER promoted to a trusted step success", () => {
  const d = deriveRunStatusDeltas({ stdout: "Step 3 completed successfully\nAll steps OK", status: "running" });
  // No exitCode → not succeeded; the 'Logs' step must not be 'ok'.
  assert.notEqual(d.phase, "succeeded");
  for (const step of d.steps) {
    if (step.label === "Logs") assert.notEqual(step.state, "ok");
  }
});

test("structured events take precedence and are trusted per declared status", () => {
  const d = deriveRunStatusDeltas({
    exitCode: 0,
    events: [
      { label: "Fetch", status: "completed" },
      { label: "Classify", status: "running" },
      { label: "Persist", status: "failed", message: "db down" },
    ],
  });
  assert.equal(d.derivedFrom, "events");
  assert.equal(d.steps.length, 3);
  assert.equal(d.steps[0].state, "ok");
  assert.equal(d.steps[1].state, "running");
  assert.equal(d.steps[2].state, "bad");
});

test("secret-shaped strings are redacted in notes/logs", () => {
  const d = deriveRunStatusDeltas({
    status: "running",
    ranAt: "t",
    stdout: "connecting with api_key=sk-abcdefghijklmnopqrstuvwxyz0123456789",
  });
  const joined = JSON.stringify(d.steps);
  assert.ok(joined.includes("[redacted]"));
  assert.ok(!joined.includes("sk-abcdefghijklmnopqrstuvwxyz0123456789"));
});

test("long log lines are bounded", () => {
  const d = deriveRunStatusDeltas({ status: "running", ranAt: "t", stdout: "a".repeat(5000) });
  const logStep = d.steps.find((s) => s.label === "Logs");
  assert.ok(logStep);
  assert.ok(logStep.note.length <= 240);
});

test("malformed events entries are skipped without throwing", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0, events: [null, 5, "x", { label: "Real", status: "completed" }] });
  assert.equal(d.derivedFrom, "events");
  assert.equal(d.steps.length, 1);
  assert.equal(d.steps[0].label, "Real");
});

test("JSON string envelope is parsed (legacy lastResponse stored as string)", () => {
  const d = deriveRunStatusDeltas(JSON.stringify({ exitCode: 0, ranAt: "t", stdout: "ok" }));
  assert.equal(d.phase, "succeeded");
});

test("legacy record with only exitCode (no ranAt/stdout) still projects", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0 });
  assert.equal(d.phase, "succeeded");
  assert.ok(d.steps.some((s) => s.label === "Completed"));
});

test("classifyEventState mapping", () => {
  assert.equal(classifyEventState("completed"), "ok");
  assert.equal(classifyEventState("FAILED"), "bad");
  assert.equal(classifyEventState("in_progress"), "running");
  assert.equal(classifyEventState("queued"), "waiting");
  assert.equal(classifyEventState(""), "waiting");
});

test("event count is bounded to a sane maximum", () => {
  const events = Array.from({ length: 200 }, (_, i) => ({ label: `s${i}`, status: "completed" }));
  const d = deriveRunStatusDeltas({ exitCode: 0, events });
  assert.ok(d.steps.length <= 50);
});
