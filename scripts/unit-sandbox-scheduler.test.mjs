#!/usr/bin/env node
/**
 * Unit coverage for Sandbox Scheduler Receiver V1 — roadmap Phase 3.1.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - envelope validation enforces kind/runId/objectId
 *   - normalized envelope never echoes unknown fields
 *   - receipt mirrors the local adapter { ok, stdout, stderr, exitCode } shape
 *   - missing env refs produce an honest non-zero receipt
 *   - deterministic given `now`; never throws on bad input
 *
 * Run with:  node --test scripts/unit-sandbox-scheduler.test.mjs
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

const { ENVELOPE_KIND, validateSandboxRunEnvelope, buildSchedulerReceipt } = await import(
  pathToFileURL(path.join(kitLib, "sandbox-scheduler.js")).href
);

const goodBody = {
  kind: "growthub-sandbox-run-v1",
  runId: "run_123",
  objectId: "flows",
  name: "Nightly Sync",
  ranAt: "2026-01-01T00:00:00.000Z",
  sandbox: {
    runtime: "node",
    adapter: "local-process",
    lifecycleStatus: "live",
    command: "node job.mjs",
    envRefSlugs: ["LEADSHARK"],
    envRefsMissing: [],
    secretValue: "SHOULD-NOT-ECHO",
  },
};

test("scheduler — public API exports", () => {
  assert.equal(ENVELOPE_KIND, "growthub-sandbox-run-v1");
  assert.equal(typeof validateSandboxRunEnvelope, "function");
  assert.equal(typeof buildSchedulerReceipt, "function");
});

test("validate — accepts a well-formed envelope", () => {
  const { ok, errors, envelope } = validateSandboxRunEnvelope(goodBody);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
  assert.equal(envelope.runId, "run_123");
  assert.equal(envelope.runLocality, "serverless");
  assert.equal(envelope.sandbox.lifecycleStatus, "live");
});

test("validate — never echoes unknown fields (no secret passthrough)", () => {
  const { envelope } = validateSandboxRunEnvelope(goodBody);
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes("SHOULD-NOT-ECHO"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope.sandbox, "secretValue"), false);
});

test("validate — rejects wrong kind / missing ids", () => {
  assert.equal(validateSandboxRunEnvelope({}).ok, false);
  assert.equal(validateSandboxRunEnvelope({ kind: "nope", runId: "x", objectId: "y" }).ok, false);
  const noRun = validateSandboxRunEnvelope({ kind: "growthub-sandbox-run-v1", objectId: "y" });
  assert.ok(noRun.errors.includes("runId is required"));
});

test("receipt — uniform success shape, deterministic", () => {
  const { envelope } = validateSandboxRunEnvelope(goodBody);
  const r1 = buildSchedulerReceipt(envelope, { now: 0 });
  const r2 = buildSchedulerReceipt(envelope, { now: 0 });
  assert.deepEqual(r1, r2);
  assert.equal(r1.ok, true);
  assert.equal(r1.exitCode, 0);
  assert.ok(r1.stdout.includes("accepted run run_123"));
  assert.equal(r1.adapterMeta.locality, "serverless");
});

test("receipt — missing env refs => honest non-zero", () => {
  const { envelope } = validateSandboxRunEnvelope({
    ...goodBody,
    sandbox: { ...goodBody.sandbox, envRefsMissing: ["STRIPE"] },
  });
  const r = buildSchedulerReceipt(envelope, { now: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.includes("STRIPE"));
});

test("receipt — never throws on bad input", () => {
  assert.doesNotThrow(() => buildSchedulerReceipt(null));
  assert.equal(buildSchedulerReceipt(undefined).ok, false);
});
