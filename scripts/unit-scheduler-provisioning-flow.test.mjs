#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-provisioning-flow.js — the "set it up for me"
 * cockpit derivation (same step shape as api-registry-creation-flow). Pure,
 * deterministic, secret-safe, never throws.
 *
 * Run with:  node --test scripts/unit-scheduler-provisioning-flow.test.mjs
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
const { deriveSchedulerProvisioningState } = await import(pathToFileURL(path.join(kitLib, "scheduler-provisioning-flow.js")).href);

const byId = (state) => Object.fromEntries(state.steps.map((s) => [s.id, s.status]));

test("fresh workflow → provider active, provision blocked, score 0", () => {
  const s = deriveSchedulerProvisioningState({ sandboxRow: {} });
  const status = byId(s);
  assert.equal(status.provider, "active");
  assert.equal(status.provision, "blocked");
  assert.equal(s.provisioned, false);
  assert.equal(s.score, 0);
});

test("provider + cadence + auth ready → provision active with 'Set it up for me'", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "sched", authRef: "QSTASH", status: "connected" }] }] } },
    configuredEnvRefs: ["QSTASH"],
    canSave: true,
  });
  const status = byId(s);
  assert.equal(status.provider, "complete");
  assert.equal(status.cadence, "complete");
  assert.equal(status.auth, "complete");
  assert.equal(status.provision, "active");
  assert.equal(s.nextAction.id, "provision-scheduler");
});

test("read-only runtime → provision blocked with guidance", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "weekly" },
    canSave: false,
  });
  assert.equal(byId(s).provision, "blocked");
});

test("scheduled status → provisioned complete, 100, bound", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "scheduled", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "sched", authRef: "QSTASH", status: "connected" }] }] } },
    configuredEnvRefs: ["QSTASH"],
    canSave: true,
  });
  assert.equal(s.provisioned, true);
  assert.equal(s.complete, true);
  assert.equal(s.score, 100);
  assert.equal(byId(s).bound, "complete");
});

test("needs-reconfirm → reconfirm step active, not complete, headline reflects drift", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "needs-reconfirm", schedulerRegistryId: "sched" },
    configuredEnvRefs: ["QSTASH"],
    workspaceConfig: { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "sched", authRef: "QSTASH" }] }] } },
    canSave: true,
  });
  assert.equal(byId(s).reconfirm, "active");
  assert.equal(s.complete, false);
  assert.equal(s.nextAction.id, "reconfirm-scheduler");
  assert.match(s.headline, /re-confirm/i);
});

test("recurring without cron → cadence blocked", () => {
  const s = deriveSchedulerProvisioningState({ sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "recurring" }, canSave: true });
  assert.equal(byId(s).cadence, "blocked");
  assert.ok(s.cronError);
});

test("secret-safe + never throws", () => {
  assert.doesNotThrow(() => deriveSchedulerProvisioningState());
  const s = deriveSchedulerProvisioningState({ sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "daily" } });
  assert.ok(!JSON.stringify(s).toLowerCase().includes("secret"));
});
