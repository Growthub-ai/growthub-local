#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-provisioning-flow.js — the honest "set it up
 * for me" cockpit derivation. Verifies the distinct state model (endpoint
 * verification != provider schedule), the durable hasSchedule concept, and the
 * can* affordances that the sandbox drawer renders verbatim (findings 1, 3, 13).
 *
 * Because the drawer's visible lifecycle controls are a PURE function of these
 * flags, this suite also pins the customer-facing recoverability contract.
 *
 * Run with:  node --test scripts/unit-scheduler-provisioning-flow.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { deriveSchedulerProvisioningState } = await import(pathToFileURL(path.join(kitLib, "scheduler-provisioning-flow.js")).href);

const byId = (state) => Object.fromEntries(state.steps.map((s) => [s.id, s.status]));
const cfgWith = (authRef = "QSTASH") => ({ dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "sched", authRef, status: "connected", endpoint: "https://x/api" }] }] } });

test("fresh workflow → provider active, provision blocked, no schedule", () => {
  const s = deriveSchedulerProvisioningState({ sandboxRow: {} });
  assert.equal(byId(s).provider, "active");
  assert.equal(byId(s).provision, "blocked");
  assert.equal(s.hasSchedule, false);
  assert.equal(s.trustedLive, false);
  assert.equal(s.score, 0);
});

test("provider + cadence + auth (candidate) ready → provision active", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: cfgWith("QSTASH"),
    configuredEnvRefs: ["QSTASH_TOKEN"], // resolves via candidate (finding 4)
    canSave: true,
  });
  assert.equal(byId(s).auth, "complete");
  assert.equal(s.authResolvedVia, "QSTASH_TOKEN");
  assert.equal(byId(s).provision, "active");
  assert.equal(s.nextAction.id, "provision-scheduler");
  assert.equal(s.canProvision, true);
});

test("HONEST: endpoint-confirmed is NOT scheduled (qstash w/o provider schedule)", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "endpoint-confirmed", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: ["QSTASH"], canSave: true,
  });
  assert.equal(s.provisioned, false);
  assert.equal(s.trustedLive, false);
  assert.equal(s.hasSchedule, true);            // schedule-bearing → controls stay
  assert.equal(s.endpointConfirmed, true);
  assert.equal(s.providerScheduleCreated, false);
  assert.match(s.headline, /create the provider schedule/i);
});

test("scheduled WITH provider schedule id → trusted live, complete, 100, bound", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "scheduled", scheduleProviderScheduleId: "scd_1", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: ["QSTASH"], canSave: true,
  });
  assert.equal(s.trustedLive, true);
  assert.equal(s.complete, true);
  assert.equal(s.score, 100);
  assert.equal(s.providerScheduleCreated, true);
  assert.equal(byId(s).bound, "complete");
});

test("supabase external: endpoint-confirmed needs external attestation, not auto-scheduled", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "weekly", scheduleStatus: "endpoint-confirmed", schedulerRegistryId: "sched", runLocality: "serverless" },
    workspaceConfig: cfgWith("SUPABASE_EDGE"), configuredEnvRefs: ["SUPABASE_EDGE"], canSave: true,
  });
  assert.equal(s.createsProviderSchedule, false);
  assert.equal(s.schedulingMode, "external");
  assert.equal(s.trustedLive, false);
  assert.match(s.steps.find((x) => x.id === "provision").description, /Supabase|external/i);
});

test("RECOVERABILITY: paused keeps resume/verify/cancel (finding 3)", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "paused", schedulePaused: "true", scheduleProviderScheduleId: "scd_1", schedulerRegistryId: "sched" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: ["QSTASH"], canSave: true,
  });
  assert.equal(s.hasSchedule, true);
  assert.equal(s.canResume, true);
  assert.equal(s.canCancel, true);
  assert.equal(s.canVerify, true);
  assert.equal(s.canPause, false); // already paused
});

test("RECOVERABILITY: needs-reconfirm shows reconfirm + cancel", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "needs-reconfirm", scheduleProviderScheduleId: "scd_1", schedulerRegistryId: "sched" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: ["QSTASH"], canSave: true,
  });
  assert.equal(s.canReconfirm, true);
  assert.equal(s.canCancel, true);
  assert.equal(byId(s).reconfirm, "active");
  assert.equal(s.nextAction.id, "reconfirm-scheduler");
  assert.match(s.headline, /re-confirm/i);
});

test("RECOVERABILITY: failed shows retry (reprovision) + cancel", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", scheduleStatus: "failed", schedulerRegistryId: "sched" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: ["QSTASH"], canSave: true,
  });
  assert.equal(s.failed, true);
  assert.equal(s.canReprovision, true);
  assert.equal(s.canCancel, true);
});

test("RECOVERABILITY: scaffolded (no destination) shows re-provision + cancel", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "daily", scheduleStatus: "scaffolded", schedulerRegistryId: "sched" },
    workspaceConfig: cfgWith("SUPABASE_EDGE"), configuredEnvRefs: ["SUPABASE_EDGE"], canSave: true,
  });
  assert.equal(s.hasSchedule, true);
  assert.equal(s.canReprovision, true);
  assert.equal(s.canCancel, true);
});

test("read-only runtime → provision blocked with guidance", () => {
  const s = deriveSchedulerProvisioningState({ sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "weekly" }, canSave: false });
  assert.equal(byId(s).provision, "blocked");
});

test("auth missing → cockpit pending with exact candidate guidance (finding 4)", () => {
  const s = deriveSchedulerProvisioningState({
    sandboxRow: { scheduleProvider: "qstash-schedule", scheduleCadence: "daily", schedulerRegistryId: "sched" },
    workspaceConfig: cfgWith("QSTASH"), configuredEnvRefs: [], canSave: true,
  });
  assert.equal(byId(s).auth, "pending");
  assert.match(s.steps.find((x) => x.id === "auth").description, /QSTASH \/ QSTASH_API_KEY \/ QSTASH_TOKEN/);
});

test("recurring without cron → cadence blocked", () => {
  const s = deriveSchedulerProvisioningState({ sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "recurring" }, canSave: true });
  assert.equal(byId(s).cadence, "blocked");
  assert.ok(s.cronError);
});

test("secret-safe + never throws", () => {
  assert.doesNotThrow(() => deriveSchedulerProvisioningState());
  const s = deriveSchedulerProvisioningState({ sandboxRow: { scheduleProvider: "supabase-edge", scheduleCadence: "daily" } });
  assert.ok(!JSON.stringify(s).toLowerCase().includes("secret value"));
});
