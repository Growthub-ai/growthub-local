#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-drift.js — the "can this schedule still be
 * trusted?" derivation. Pure, deterministic, secret-safe, never throws.
 *
 * Run with:  node --test scripts/unit-scheduler-drift.test.mjs
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
const { deriveSchedulerDriftState } = await import(pathToFileURL(path.join(kitLib, "scheduler-drift.js")).href);

const scheduled = { scheduleStatus: "scheduled", schedulerRegistryId: "sched", scheduleProvider: "qstash-schedule" };
const schedulerRow = { integrationId: "sched", authRef: "QSTASH", baseUrl: "https://app.example.com/api/scheduled" };

test("unprovisioned row → not applicable, not drifted", () => {
  const d = deriveSchedulerDriftState({ sandboxRow: { scheduleStatus: "" } });
  assert.equal(d.applicable, false);
  assert.equal(d.drifted, false);
});

test("scheduled + healthy runtime → verified, no drift", () => {
  const d = deriveSchedulerDriftState({
    sandboxRow: scheduled, schedulerRow,
    persistenceMode: "filesystem",
    configuredEnvRefs: ["QSTASH"],
    currentBaseUrl: "https://app.example.com/api/scheduled",
  });
  assert.equal(d.applicable, true);
  assert.equal(d.drifted, false);
  assert.equal(d.recommendedAction, "none");
});

test("read-only runtime → drift", () => {
  const d = deriveSchedulerDriftState({ sandboxRow: scheduled, schedulerRow, persistenceMode: "read-only", configuredEnvRefs: ["QSTASH"] });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /read-only/i);
  assert.equal(d.recommendedAction, "reconfirm");
});

test("auth no longer resolves → drift", () => {
  const d = deriveSchedulerDriftState({ sandboxRow: scheduled, schedulerRow, persistenceMode: "filesystem", configuredEnvRefs: [] });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /QSTASH no longer resolves/i);
});

test("endpoint URL changed (redeploy) → drift", () => {
  const d = deriveSchedulerDriftState({
    sandboxRow: scheduled, schedulerRow,
    persistenceMode: "filesystem",
    configuredEnvRefs: ["QSTASH"],
    currentBaseUrl: "https://new-deploy.vercel.app/api/scheduled",
  });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /endpoint URL changed|redeploy/i);
});

test("needs-reconfirm row clearing to healthy → no drift (re-verifiable)", () => {
  const d = deriveSchedulerDriftState({
    sandboxRow: { ...scheduled, scheduleStatus: "needs-reconfirm" }, schedulerRow,
    persistenceMode: "filesystem", configuredEnvRefs: ["QSTASH"],
  });
  assert.equal(d.applicable, true);
  assert.equal(d.drifted, false);
});

test("never throws + secret-safe", () => {
  assert.doesNotThrow(() => deriveSchedulerDriftState());
  const d = deriveSchedulerDriftState({ sandboxRow: scheduled, schedulerRow, configuredEnvRefs: [] });
  assert.ok(!JSON.stringify(d).toLowerCase().includes("secret value"));
});
