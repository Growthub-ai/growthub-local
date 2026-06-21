#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-drift.js — the hardened "can this schedule
 * still be trusted?" derivation. Deterministic URL normalization (no substring
 * matching), last-confirmed-evidence comparison, provider-schedule evidence.
 * Pure, secret-safe, never throws. (Findings 5 + 1.)
 *
 * Run with:  node --test scripts/unit-scheduler-drift.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { deriveSchedulerDriftState } = await import(pathToFileURL(path.join(kitLib, "scheduler-drift.js")).href);

// A fully-provisioned QStash schedule with provider evidence + a confirmed URL.
const scheduled = {
  scheduleStatus: "scheduled",
  schedulerRegistryId: "sched",
  scheduleProvider: "qstash-schedule",
  scheduleProviderScheduleId: "scd_abc123",
  scheduleLastConfirmedEndpointUrl: "https://app.example.com/api/scheduled",
};
const schedulerRow = { integrationId: "sched", authRef: "QSTASH", baseUrl: "https://app.example.com/api/scheduled" };
const healthy = { sandboxRow: scheduled, schedulerRow, persistenceMode: "filesystem", configuredEnvRefs: ["QSTASH"] };

test("unprovisioned row → not applicable, not drifted", () => {
  const d = deriveSchedulerDriftState({ sandboxRow: { scheduleStatus: "" } });
  assert.equal(d.applicable, false);
  assert.equal(d.drifted, false);
});

test("scheduled + healthy runtime + provider evidence → verified, no drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "https://app.example.com/api/scheduled" });
  assert.equal(d.applicable, true);
  assert.equal(d.drifted, false, JSON.stringify(d.reasons));
  assert.equal(d.recommendedAction, "none");
});

test("trailing-slash difference on the SAME url → no drift (normalized)", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "https://app.example.com/api/scheduled/" });
  assert.equal(d.drifted, false, JSON.stringify(d.reasons));
});

test("different host → drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "https://evil.example.net/api/scheduled" });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /redeploy|changed/i);
});

test("different path → drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "https://app.example.com/api/other" });
  assert.equal(d.drifted, true);
});

test("same host, different query token → NO drift (documented: query ignored)", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "https://app.example.com/api/scheduled?token=zzz" });
  assert.equal(d.drifted, false, JSON.stringify(d.reasons));
});

test("malformed currentBaseUrl → actionable invalid-url drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, currentBaseUrl: "not a url" });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /malformed/i);
});

test("registry row endpoint edited after confirm → drift", () => {
  const edited = { ...schedulerRow, endpoint: "https://app.example.com/api/EDITED", baseUrl: "" };
  const d = deriveSchedulerDriftState({ sandboxRow: scheduled, schedulerRow: edited, persistenceMode: "filesystem", configuredEnvRefs: ["QSTASH"] });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /edited since/i);
});

test("read-only runtime → drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, persistenceMode: "read-only" });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /read-only/i);
});

test("auth no longer resolves → drift (candidate-aware)", () => {
  const d = deriveSchedulerDriftState({ ...healthy, configuredEnvRefs: [] });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /QSTASH no longer resolves/i);
});

test("auth resolves via candidate (QSTASH_TOKEN) → no auth drift", () => {
  const d = deriveSchedulerDriftState({ ...healthy, configuredEnvRefs: ["QSTASH_TOKEN"], currentBaseUrl: "https://app.example.com/api/scheduled" });
  assert.equal(d.drifted, false, JSON.stringify(d.reasons));
});

test("provider-schedule provider with NO providerScheduleId → drift", () => {
  const noEvidence = { ...scheduled, scheduleProviderScheduleId: "" };
  const d = deriveSchedulerDriftState({ sandboxRow: noEvidence, schedulerRow, persistenceMode: "filesystem", configuredEnvRefs: ["QSTASH"] });
  assert.equal(d.drifted, true);
  assert.match(d.reasons.join(" "), /provider schedule id/i);
});

test("never throws + secret-safe", () => {
  assert.doesNotThrow(() => deriveSchedulerDriftState());
  const d = deriveSchedulerDriftState({ ...healthy, configuredEnvRefs: [] });
  assert.ok(!JSON.stringify(d).toLowerCase().includes("secret value"));
});
