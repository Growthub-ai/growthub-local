#!/usr/bin/env node
/**
 * Unit coverage for deriveRunStatusDeltas — truthful run hydration.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - empty / non-object input returns a safe idle envelope, never throws
 *   - legacy lastResponse shape (stdout + exitCode) derives completed
 *   - stdout/stderr only (no exit evidence) is NEVER reported as completed
 *   - structured events are surfaced; malformed entries are dropped
 *   - failed runs derive from exitCode / error only
 *   - an arbitrary stdout line never becomes a trusted step success
 *   - secret-shaped strings are redacted and length-bounded
 *   - { lastResponse } wrappers and canceled runs are handled
 *
 * Run with:  node --test scripts/unit-run-status-deltas.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { deriveRunStatusDeltas, runStatusLabel } = await import(
  pathToFileURL(path.join(kitLib, "run-status-deltas.js")).href
);

test("empty / garbage input returns a safe idle envelope and never throws", () => {
  for (const input of [null, undefined, 42, "x", [], {}]) {
    assert.doesNotThrow(() => deriveRunStatusDeltas(input));
  }
  assert.equal(deriveRunStatusDeltas(null).status, "idle");
  assert.equal(deriveRunStatusDeltas({}).status, "unknown");
  assert.equal(deriveRunStatusDeltas(null).events.length, 0);
});

test("legacy lastResponse shape (stdout + exitCode 0) derives completed", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0, stdout: "fetched 12 rows\ndone", durationMs: 1200, ranAt: "2026-06-01T00:00:00Z" });
  assert.equal(d.status, "completed");
  assert.equal(d.ok, true);
  assert.equal(d.statusSource, "exit-code");
  assert.equal(d.latestLog.stream, "stdout");
  assert.equal(d.latestLog.text, "done");
  assert.equal(d.durationMs, 1200);
});

test("stdout/stderr only (no exit evidence) is never reported completed", () => {
  const d = deriveRunStatusDeltas({ stdout: "working...", stderr: "" });
  assert.notEqual(d.status, "completed");
  assert.equal(d.ok, false);
  assert.equal(d.statusSource, "none");
  assert.ok(d.latestLog); // still surfaces the latest line
});

test("explicit running flag yields running; lifecycle running too", () => {
  assert.equal(deriveRunStatusDeltas({ running: true, stdout: "x" }).status, "running");
  assert.equal(deriveRunStatusDeltas({ lifecycleStatus: "in_progress" }).status, "running");
});

test("failed status derives from exitCode / error only", () => {
  assert.equal(deriveRunStatusDeltas({ exitCode: 1, stderr: "boom" }).status, "failed");
  assert.equal(deriveRunStatusDeltas({ error: "network down" }).status, "failed");
  const d = deriveRunStatusDeltas({ exitCode: 2, stdout: "all done!", stderr: "fatal: nope" });
  // stdout literally says "all done!" but exitCode proves failure
  assert.equal(d.status, "failed");
  assert.equal(d.latestLog.stream, "stderr"); // failures prefer stderr
});

test("an arbitrary stdout line never becomes a trusted step", () => {
  const d = deriveRunStatusDeltas({ exitCode: 0, stdout: "Step 3 completed\nStep 4 completed" });
  // logs are surfaced as a preview, never as structured steps
  assert.equal(d.steps.length, 0);
  assert.equal(d.events.length, 0);
});

test("structured events are surfaced; malformed entries dropped", () => {
  const d = deriveRunStatusDeltas({
    exitCode: 0,
    events: [
      { label: "Fetch source", status: "completed", at: "t1" },
      { name: "Transform", status: "running" },
      { status: "completed" },          // no label → dropped
      null,                              // malformed → dropped
      "nope",                            // malformed → dropped
      { label: "Weird", status: "exploded" } // unknown status → coerced to info
    ]
  });
  assert.equal(d.events.length, 3);
  assert.equal(d.events[0].label, "Fetch source");
  assert.equal(d.events[0].status, "completed");
  assert.equal(d.events[1].label, "Transform");
  assert.equal(d.events[2].status, "info"); // coerced
});

test("secret-shaped strings are redacted and length-bounded", () => {
  const d = deriveRunStatusDeltas({ exitCode: 1, stderr: `auth failed Bearer abc123secrettoken trailing` });
  assert.ok(d.latestLog.text.includes("Bearer [redacted]"));
  assert.ok(!d.latestLog.text.includes("abc123secrettoken"));

  const long = "x".repeat(1000);
  const d2 = deriveRunStatusDeltas({ exitCode: 0, stdout: long });
  assert.ok(d2.latestLog.text.length <= 240);
  assert.ok(d2.latestLog.text.endsWith("…"));
});

test("{ lastResponse } wrapper is unwrapped", () => {
  const d = deriveRunStatusDeltas({ lastResponse: { exitCode: 0, stdout: "ok" } });
  assert.equal(d.status, "completed");
});

test("canceled runs are recognised", () => {
  assert.equal(deriveRunStatusDeltas({ lifecycleStatus: "canceled" }).status, "canceled");
  assert.equal(deriveRunStatusDeltas({ canceled: true }).status, "canceled");
});

test("receiptWritten only when ok and there is real output evidence", () => {
  assert.equal(deriveRunStatusDeltas({ exitCode: 0, output: "result" }).receiptWritten, true);
  assert.equal(deriveRunStatusDeltas({ exitCode: 0, runId: "run-1" }).receiptWritten, true);
  assert.equal(deriveRunStatusDeltas({ exitCode: 0 }).receiptWritten, false); // ok but no evidence
  assert.equal(deriveRunStatusDeltas({ exitCode: 1, output: "x", runId: "r" }).receiptWritten, false); // failed
});

test("runStatusLabel maps every status to human copy", () => {
  for (const s of ["idle", "unknown", "running", "completed", "failed", "canceled"]) {
    assert.equal(typeof runStatusLabel(s), "string");
  }
  assert.equal(runStatusLabel("garbage"), "Awaiting result");
});
