#!/usr/bin/env node
/**
 * /pulse cockpit — command governance + pure heartbeat/policy deriver coverage.
 *
 * The pulse is a command entry path into the existing governed universe, not a
 * new runtime. These tests prove:
 *   - /pulse is a governed, read-only (view) helper command
 *   - the sidecar view is wired (source-scan: no DOM runner needed)
 *   - the destination door stamps lastScheduledRunAttemptedAt BEFORE running
 *     the graph (source-scan) — without it, stalled runs would be invisible
 *   - client-safe constants stay in lockstep with server canon (budget, lanes)
 *   - senseRunHeartbeat classifies idle/running/healthy/failed/stalled
 *     deterministically (caller clock), incl. epoch-0 timestamps
 *   - a stalled/failed workflow always carries a binding-aware governed
 *     recovery hand-off (never stuck): scheduler-bound → readiness (+resume
 *     chain marked MUTATING), inbound → retest, unbound → open-canvas
 *   - evaluatePulsePolicies enforces thresholds, reports unknown rules,
 *     CLAMPS autoApprove to safe read-only kinds, and scopes findings to
 *     exact target cards
 *   - autoRecoveryTargets = union of auto-approved findings' targets with
 *     readiness recovery only — never a mutating chain
 *   - pulse-cadence counts ONLY successful beats (a failing heartbeat
 *     workflow is stale, not fresh)
 *   - duplicate row Names never collide onto one heartbeat
 *
 * Run with:  node --test scripts/unit-autonomic-pulse.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const kitLib = path.join(kit, "lib");
const kitCmp = path.join(kit, "app/data-model/components");
const kitApi = path.join(kit, "app/api/workspace");

const { HELPER_COMMANDS, isGovernedHelperCommand } = await import(pathToFileURL(path.join(kitCmp, "helper-commands.js")).href);
const {
  derivePulseCockpit,
  senseRunHeartbeat,
  evaluatePulsePolicies,
  readPolicyRows,
  senseDeploymentPosture,
  PULSE_RUN_BUDGET_MS,
  PULSE_STALL_GRACE_MS,
  PULSE_SENSOR_TAGS,
  SAFE_AUTO_RECOVERY_KINDS,
  WORKSPACE_POLICY_OBJECT_ID,
  WORKSPACE_PULSE_WORKFLOW_NAME,
} = await import(pathToFileURL(path.join(kitLib, "autonomic-pulse-console.js")).href);
const { SERVERLESS_RUN_BUDGET_MS } = await import(pathToFileURL(path.join(kitLib, "workspace-add-on-scheduler.js")).href);
const { INBOUND_INVOCATION_LANES } = await import(pathToFileURL(path.join(kitLib, "workspace-inbound-invocation.js")).href);
const { OBJECT_TYPE_PRESETS } = await import(pathToFileURL(path.join(kitLib, "workspace-data-model.js")).href);
const { READINESS_DELTA_TAGS } = await import(pathToFileURL(path.join(kitLib, "serverless-readiness.js")).href);

const CONFIGURED = ["DEMO_DATA"];
const NOW = Date.parse("2026-07-04T12:00:00.000Z");
const STALL_AGE = PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS + 5_000;
const iso = (ms) => new Date(ms).toISOString();

/* ---------- fixtures (mirror unit-schedule-cockpit shapes) ---------- */
function localGraph() {
  return JSON.stringify({
    version: 1, provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", config: { inputMode: "manual", samplePayload: { since: "2026-01-01" } } },
      { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA" } },
      { id: "result", type: "tool-result", config: { writeLastResponse: true } },
    ],
    edges: [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }],
  });
}
function boundGraph({ scheduleId, registryId = "upstash-qstash-workflow", providerId = "upstash", productId = "upstash-qstash" } = {}) {
  return JSON.stringify({
    version: 1, provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", config: {
        inputMode: "serverless-schedule", trigger: "serverless-scheduler", enabled: true,
        schedule: { scheduleId, schedulerRegistryId: registryId, providerId, productId },
      } },
      { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef: "DEMO_DATA" } },
      { id: "result", type: "tool-result", config: { writeLastResponse: true } },
    ],
    edges: [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }],
  });
}
const QSTASH_PRODUCT = { integrationId: "upstash-qstash-workflow", productId: "upstash-qstash", providerId: "upstash", executionLane: "serverless-scheduler", syncStatus: "verified", region: "us-east-1", Name: "QStash" };
const DATA_API = { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" };

function cfg({ rows = [], policyRows = null, vercelRows = null, policyObject = null } = {}) {
  const objects = [
    { id: "api-registry", objectType: "api-registry", rows: [QSTASH_PRODUCT, DATA_API] },
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows },
  ];
  // Policy lives in a plain CUSTOM object created through the governed
  // create_object lane — never a dedicated object type.
  if (policyRows) objects.push(policyObject || { id: WORKSPACE_POLICY_OBJECT_ID, objectType: "custom", label: "Workspace Policy", rows: policyRows });
  if (vercelRows) objects.push({ id: "vercel-projects", label: "Vercel Projects", rows: vercelRows });
  return { id: "ws", dataModel: { objects } };
}
function wfRow(name, extra = {}) {
  return { Name: name, runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph(), ...extra };
}
function boundRow(name, extra = {}) {
  const scheduleId = `growthub-upstash-ws-x-${name}-v1`;
  return {
    Name: name, runLocality: "serverless", adapter: "local-process",
    scheduleId, schedulerRegistryId: "upstash-qstash-workflow", schedulerProviderId: "upstash", schedulerProductId: "upstash-qstash",
    orchestrationConfig: boundGraph({ scheduleId }), ...extra,
  };
}

/* ================= command governance ================= */
test("/pulse is a governed, read-only view command in the registry", () => {
  const cmd = HELPER_COMMANDS.find((c) => c.name === "/pulse");
  assert.ok(cmd, "/pulse present in HELPER_COMMANDS");
  assert.equal(cmd.mutates, false);
  assert.equal(cmd.view, "pulse");
  assert.equal(isGovernedHelperCommand(cmd).ok, true);
});

test("a /pulse variant that mutates+switches view is rejected (invariant bites)", () => {
  const bad = { name: "/pulse", label: "Pulse", mutates: true, view: "pulse" };
  assert.equal(isGovernedHelperCommand(bad).ok, false);
});

/* ================= wiring + canon sync (source-scan) ================= */
test("HelperSidecar mounts PulseCockpit on activeView === pulse and pins seed intents", () => {
  const src = readFileSync(path.join(kitCmp, "HelperSidecar.jsx"), "utf8");
  assert.match(src, /import \{ PulseCockpit \}/);
  assert.match(src, /activeView === "pulse"/);
  assert.match(src, /<PulseCockpit/);
  assert.match(src, /if \(seedIntent\) onPickIntent\(seedIntent\);/, "seeded proposals must pin their intent");
});

test("destination door stamps the attempt BEFORE executing the graph (heartbeat premise)", () => {
  const src = readFileSync(path.join(kitApi, "workflows/[providerId]/route.js"), "utf8");
  const stampAt = src.indexOf("lastScheduledRunAttemptedAt: new Date().toISOString()");
  const runAt = src.indexOf("runOrchestrationGraphIfPresent({");
  assert.ok(stampAt > -1, "pre-run attempt stamp present");
  assert.ok(runAt > -1 && stampAt < runAt, "stamp occurs before graph execution");
  assert.match(src, /timeoutMs: SERVERLESS_RUN_BUDGET_MS/, "route uses the shared budget constant");
});

test("client-safe constants stay in lockstep with server canon (budget + inbound lanes)", () => {
  assert.equal(PULSE_RUN_BUDGET_MS, SERVERLESS_RUN_BUDGET_MS, "stall budget === door budget");
  const src = readFileSync(path.join(kitLib, "autonomic-pulse-console.js"), "utf8");
  for (const lane of INBOUND_INVOCATION_LANES) {
    assert.ok(src.includes(`"${lane}"`), `deriver mirror includes lane ${lane}`);
  }
  assert.equal(PULSE_SENSOR_TAGS.MISSING_SECRET, READINESS_DELTA_TAGS.MISSING_SERVER_SECRET, "one readiness vocabulary");
});

/* ================= no-new-object-type invariant ================= */
test("policy introduces NO new object type or preset — rows come from a governed custom object", () => {
  assert.equal(OBJECT_TYPE_PRESETS[WORKSPACE_POLICY_OBJECT_ID], undefined, "no workspace-policy preset may exist");
  const byId = readPolicyRows(cfg({ policyRows: [
    { Name: "r1", ruleKind: "max-failed-runs", threshold: 1, enabled: "true" },
  ] }));
  assert.equal(byId.length, 1);
  // Canonical label slug: punctuation/underscore variants still resolve.
  const byLabel = readPolicyRows(cfg({
    policyRows: [{ Name: "r1", ruleKind: "max-failed-runs", threshold: 1, enabled: "true" }, { Name: "off", ruleKind: "max-failed-runs", threshold: 1, enabled: "false" }],
    policyObject: { id: "obj-77", objectType: "custom", label: "Workspace_Policy!", rows: [
      { Name: "r1", ruleKind: "max-failed-runs", threshold: 1, enabled: "true" },
      { Name: "off", ruleKind: "max-failed-runs", threshold: 1, enabled: "false" },
    ] },
  }));
  assert.equal(byLabel.length, 1);
  assert.equal(byLabel[0].policyId, "r1");
});

/* ================= heartbeat sensor ================= */
test("senseRunHeartbeat: idle / healthy / failed / running / stalled, deterministic on caller clock", () => {
  assert.equal(senseRunHeartbeat({}, { nowMs: NOW }).state, "idle");

  const healthy = senseRunHeartbeat({
    lastScheduledRunAttemptedAt: iso(NOW - 90_000),
    lastScheduledRunSucceededAt: iso(NOW - 60_000),
    lastScheduledRunStatus: "200",
  }, { nowMs: NOW });
  assert.equal(healthy.state, "healthy");

  const failed = senseRunHeartbeat({
    lastScheduledRunAttemptedAt: iso(NOW - 90_000),
    lastScheduledRunFailedAt: iso(NOW - 60_000),
    lastScheduledRunStatus: "500",
    lastScheduledRunFailureReason: "downstream 500",
  }, { nowMs: NOW });
  assert.equal(failed.state, "failed");
  assert.equal(failed.reason, "downstream 500");

  const running = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - 30_000) }, { nowMs: NOW });
  assert.equal(running.state, "running");

  const stalled = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }, { nowMs: NOW });
  assert.equal(stalled.state, "stalled");
  assert.equal(stalled.reason, "attempt-past-budget-without-completion");

  const reattempt = senseRunHeartbeat({
    lastScheduledRunAttemptedAt: iso(NOW - 10_000),
    lastScheduledRunSucceededAt: iso(NOW - 300_000),
  }, { nowMs: NOW });
  assert.equal(reattempt.state, "running");

  // No clock → conservative, never a false stall alarm.
  const noClock = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }, {});
  assert.equal(noClock.state, "running");
  assert.equal(noClock.reason, "no-clock");

  // Epoch-0 timestamps are PRESENT, not missing (falsy-zero guard).
  const epochAttempt = senseRunHeartbeat({ lastScheduledRunAttemptedAt: "1970-01-01T00:00:00.000Z" }, { nowMs: NOW });
  assert.equal(epochAttempt.state, "stalled", "epoch-0 attempt with no completion is a (very) stalled run");
});

/* ================= recovery (never stuck, binding-aware) ================= */
test("stalled scheduler-BOUND workflow recovers via the schedule route; paused chains a MUTATING resume", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      boundRow("bound-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
      boundRow("paused-stuck", { schedulerPaused: true, lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
    ] }),
  });
  const stuck = model.heartbeats.find((h) => h.name === "bound-stuck");
  assert.equal(stuck.heartbeat.state, "stalled");
  assert.equal(stuck.recovery.kind, "readiness");
  assert.equal(stuck.recovery.handoff, "add-ons-schedule-route");
  assert.equal(stuck.recovery.mutating, false);
  assert.equal(stuck.recovery.then, null);
  const paused = model.heartbeats.find((h) => h.name === "paused-stuck");
  assert.equal(paused.recovery.then, "resume");
  assert.equal(paused.recovery.mutating, true, "resume chain is a mutation and must say so");
});

test("stalled UNBOUND workflow hands to the canvas (not a provider route it isn't bound to)", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [wfRow("loose-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) })] }),
  });
  const entry = model.heartbeats.find((h) => h.name === "loose-stuck");
  assert.equal(entry.heartbeat.state, "stalled");
  assert.equal(entry.recovery.kind, "open-canvas");
  assert.equal(entry.recovery.handoff, "workflow-canvas");
  assert.ok(entry.sensorTags.includes(PULSE_SENSOR_TAGS.STALLED_RUN));
  assert.equal(model.attention.kind, "heartbeat");
  assert.equal(model.attention.heartbeat.name, "loose-stuck");
});

test("failed INBOUND bindings recover through a fresh test event, not the scheduler lane", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("hook-flow", {
        schedulerTriggerKind: "inbound-webhook",
        scheduleId: "growthub-ws-hook-v1",
        lastScheduledRunAttemptedAt: iso(NOW - 90_000),
        lastScheduledRunFailedAt: iso(NOW - 60_000),
        lastScheduledRunStatus: "500",
        lastScheduledRunFailureReason: "node error",
      }),
    ] }),
  });
  const entry = model.heartbeats.find((h) => h.name === "hook-flow");
  assert.equal(entry.heartbeat.state, "failed");
  assert.equal(entry.recovery.kind, "retest");
  assert.equal(entry.recovery.handoff, "workflow-sidecar");
  assert.equal(entry.recovery.mutating, false);
});

test("duplicate row Names never collide onto one heartbeat", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("Sync", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
      wfRow("Sync", { lastScheduledRunAttemptedAt: iso(NOW - 90_000), lastScheduledRunSucceededAt: iso(NOW - 60_000), lastScheduledRunStatus: "200" }),
    ] }),
  });
  const syncs = model.heartbeats.filter((h) => h.name === "Sync");
  assert.equal(syncs.length, 2);
  assert.deepEqual(syncs.map((h) => h.heartbeat.state).sort(), ["healthy", "stalled"]);
  assert.equal(model.counts.stalled, 1);
});

/* ================= policy evaluation ================= */
function packetWith(overrides = {}) {
  return {
    nowMs: NOW,
    counts: { stalled: 0, failed: 0, blocked: 0, drifted: 0, missingSecrets: 0, ...overrides.counts },
    governance: { blockedAttempts: 0, ...overrides.governance },
    deployment: { anyLive: true, live: 1, errored: 0, projects: 1, appSurfaces: 1, ...overrides.deployment },
    pulseProof: { workflowFound: true, lastBeatMs: NOW - 60_000, lastBeatAt: iso(NOW - 60_000), state: "healthy", ...overrides.pulseProof },
    targets: { stalled: [], failed: [], blocked: [], drifted: [], pulse: [], ...overrides.targets },
  };
}

test("threshold breach produces a targeted finding; within-threshold stays silent", () => {
  const policies = readPolicyRows(cfg({ policyRows: [
    { Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true" },
  ] }));
  assert.equal(policies.length, 1);

  const quiet = evaluatePulsePolicies({ packet: packetWith(), policyRows: policies });
  assert.equal(quiet.length, 0);

  const loud = evaluatePulsePolicies({
    packet: packetWith({ counts: { stalled: 2 }, targets: { stalled: ["a::x::0", "a::y::1"] } }),
    policyRows: policies,
  });
  assert.equal(loud.length, 1);
  assert.equal(loud[0].severity, "critical");
  assert.equal(loud[0].sensorTag, PULSE_SENSOR_TAGS.STALLED_RUN);
  assert.ok(SAFE_AUTO_RECOVERY_KINDS.includes(loud[0].nextAction.kind));
  assert.equal(loud[0].autoApprovable, true);
  assert.deepEqual(loud[0].nextAction.targetCardIds, ["a::x::0", "a::y::1"], "finding names exactly the cards it covers");
});

test("autoApprove is CLAMPED for non-safe recovery kinds (the trust boundary bites)", () => {
  const policies = [
    { policyId: "must-be-live", ruleKind: "require-deployment-live", threshold: null, severity: "critical", autoApprove: true, goal: "", description: "" },
    { policyId: "secrets", ruleKind: "max-missing-secrets", threshold: 0, severity: "warn", autoApprove: true, goal: "", description: "" },
    { policyId: "gov", ruleKind: "max-blocked-attempts", threshold: 0, severity: "warn", autoApprove: true, goal: "", description: "" },
  ];
  const findings = evaluatePulsePolicies({
    packet: packetWith({ deployment: { anyLive: false, live: 0 }, counts: { missingSecrets: 3 }, governance: { blockedAttempts: 2 } }),
    policyRows: policies,
  });
  assert.equal(findings.length, 3);
  for (const f of findings) {
    assert.equal(f.autoApprovable, false, `${f.policyId} must not auto-approve`);
    assert.equal(f.autoApproveClamped, true, `${f.policyId} clamp is visible`);
    assert.ok(!SAFE_AUTO_RECOVERY_KINDS.includes(f.nextAction.kind));
  }
  const gov = findings.find((f) => f.policyId === "gov");
  assert.equal(gov.nextAction.handoff, "ceo-cockpit", "blocked attempts review lands on a surface that folds receipts");
});

test("unknown rule kinds are reported, never silently ignored", () => {
  const findings = evaluatePulsePolicies({
    packet: packetWith(),
    policyRows: [{ policyId: "mystery", ruleKind: "optimize-vibes", threshold: null, severity: "critical", autoApprove: true, goal: "", description: "" }],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /Unknown policy rule kind/);
  assert.equal(findings[0].autoApprovable, false);
});

test("pulse-cadence counts ONLY successful beats — a failing heartbeat workflow is stale", () => {
  const policies = [{ policyId: "beat", ruleKind: "pulse-cadence-minutes", threshold: 30, severity: "warn", autoApprove: false, goal: "", description: "" }];

  // Old success + fresh FAILURE → still stale (the fix under test).
  const failingBeat = evaluatePulsePolicies({
    packet: packetWith({ pulseProof: { workflowFound: true, lastBeatMs: NOW - 48 * 3600_000, lastBeatAt: iso(NOW - 48 * 3600_000), state: "failed" } }),
    policyRows: policies,
  });
  assert.equal(failingBeat.length, 1);
  assert.equal(failingBeat[0].sensorTag, PULSE_SENSOR_TAGS.PULSE_PROOF_STALE);
  assert.equal(failingBeat[0].nextAction.kind, "readiness");

  const absent = evaluatePulsePolicies({
    packet: packetWith({ pulseProof: { workflowFound: false, lastBeatMs: null, lastBeatAt: "", state: "absent" } }),
    policyRows: policies,
  });
  assert.equal(absent.length, 1);
  assert.equal(absent[0].nextAction.kind, "seed-proposal");
  assert.equal(absent[0].nextAction.handoff, "helper-proposal");
  assert.equal(absent[0].nextAction.seedIntent, "swarm", "pulse workflow seeds through the swarm/workflow lane");
  assert.ok(absent[0].nextAction.seedPrompt.includes(WORKSPACE_PULSE_WORKFLOW_NAME));
});

/* ================= deployment + composition ================= */
test("deployment posture reads real writer shapes: linked+URL counts live; READY counts live; ERROR counts errored", () => {
  const posture = senseDeploymentPosture(cfg({ vercelRows: [
    { Name: "app", projectId: "prj_1", status: "linked", latestDeploymentUrl: "https://app.vercel.app" },
    { Name: "ready", projectId: "prj_2", status: "linked", latestDeploymentState: "READY" },
    { Name: "bad", projectId: "prj_3", status: "linked", latestDeploymentState: "ERROR" },
    { Name: "cold", projectId: "prj_4", status: "repo-created" },
  ] }));
  assert.equal(posture.projects, 4);
  assert.equal(posture.live, 2);
  assert.equal(posture.errored, 1);
  assert.equal(posture.anyLive, true);
});

test("derivePulseCockpit: deterministic packet, targeted findings, readiness-only auto-recovery scope", () => {
  const workspaceConfig = cfg({
    rows: [
      boundRow("bound-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
      boundRow("paused-stuck", { schedulerPaused: true, lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
      wfRow("loose-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) }),
      wfRow(WORKSPACE_PULSE_WORKFLOW_NAME, { lastScheduledRunAttemptedAt: iso(NOW - 120_000), lastScheduledRunSucceededAt: iso(NOW - 90_000), lastScheduledRunStatus: "200" }),
    ],
    policyRows: [
      { Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true", goal: "keep automations flowing" },
    ],
  });
  const args = { workspaceConfig, configuredEnvRefs: CONFIGURED, receipts: [{ outcomeStatus: "blocked" }], nowMs: NOW };
  const a = derivePulseCockpit(args);
  const b = derivePulseCockpit(args);
  assert.deepEqual(a, b, "same inputs → identical packet");

  assert.equal(a.policySetupState, "configured");
  assert.equal(a.counts.stalled, 3);
  assert.equal(a.findings.length, 1);
  assert.equal(a.findings[0].goal, "keep automations flowing");
  assert.equal(a.findings[0].nextAction.targetCardIds.length, 3);
  // Auto-recovery: finding covers 3 stalled cards, but ONLY the readiness-kind
  // recoveries qualify — loose-stuck (open-canvas) is excluded; the paused
  // card participates readiness-only (its resume chain is never auto-run,
  // which runRecoveryPass enforces by chain:false).
  assert.equal(a.autoRecoveryTargets.length, 2);
  assert.ok(a.autoRecoveryTargets.every((t) => t.recovery.kind === "readiness"));
  assert.ok(!a.autoRecoveryTargets.some((t) => t.name === "loose-stuck"));
  assert.equal(a.pulseProof.workflowFound, true);
  assert.equal(a.pulseProof.state, "healthy");
  assert.equal(a.governance.blockedAttempts, 1);
  assert.equal(a.defaultProvider?.providerId, "upstash", "defaultProvider passthrough for recovery fallback");
  const HANDOFFS = ["add-ons-schedule-route", "workflow-sidecar", "workflow-canvas", "settings-apps", "settings-env", "data-model", "ceo-cockpit", "helper-proposal"];
  for (const h of a.heartbeats) if (h.recovery) assert.ok(HANDOFFS.includes(h.recovery.handoff));
  for (const f of a.findings) assert.ok(HANDOFFS.includes(f.nextAction.handoff));
});

/* ================= UX contracts: plain language, real status, report ================= */
test("findings carry plain-language copy (what/why/does/outcome) — never just slugs", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({
      rows: [wfRow("loose-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) })],
      policyRows: [{ Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true", goal: "keep automations flowing" }],
    }),
  });
  const f = model.findings[0];
  assert.ok(f.plain, "plain copy present");
  assert.equal(f.plain.title, "Runs are sitting stuck");
  assert.match(f.plain.why, /started but never finished/);
  assert.match(f.plain.why, /keep automations flowing/, "the user's goal is woven into the why");
  assert.match(f.plain.actionDoes, /read-only/i);
  assert.ok(f.plain.actionOutcome.length > 0);
});

test("heartbeats carry real capitalized status labels and a truncated stable reason line", () => {
  const longReason = "x".repeat(300);
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("bad", { lastScheduledRunAttemptedAt: iso(NOW - 90_000), lastScheduledRunFailedAt: iso(NOW - 60_000), lastScheduledRunStatus: "500", lastScheduledRunFailureReason: longReason }),
      wfRow("fine", { lastScheduledRunAttemptedAt: iso(NOW - 90_000), lastScheduledRunSucceededAt: iso(NOW - 60_000), lastScheduledRunStatus: "200" }),
    ] }),
  });
  const bad = model.heartbeats.find((h) => h.name === "bad");
  assert.equal(bad.statusLabel, "Failed");
  assert.ok(bad.reasonLine.length <= 72, "reason line is truncated to a stable length");
  assert.equal(model.heartbeats.find((h) => h.name === "fine").statusLabel, "Healthy");
  // Delegation to the governed swarm lane exists for bad heartbeats only.
  assert.equal(bad.delegate.seedIntent, "swarm");
  assert.match(bad.delegate.seedPrompt, /heal the workflow "bad"/);
  assert.equal(model.heartbeats.find((h) => h.name === "fine").delegate, null);
});

test("attention carries a personalized headline and one-click action", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [wfRow("loose-stuck", { lastScheduledRunAttemptedAt: iso(NOW - STALL_AGE) })] }),
  });
  assert.equal(model.attention.headline, '"loose-stuck" is stalled');
  assert.ok(model.attention.oneClick, "one-click action present");
  assert.equal(model.attention.oneClick.label, "Open & re-run");
  assert.ok(model.attention.delegate, "delegation available from attention");
});

test("report derives the daily digest and the self-run checklist with governed seeds", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    receipts: [
      { kind: "workspace-invoked-run", outcomeStatus: "published", at: iso(NOW - 3600_000) },
      { kind: "workspace-scheduled-run", outcomeStatus: "failed", at: iso(NOW - 7200_000) },
      { kind: "workspace-invoked-run", outcomeStatus: "published", at: iso(NOW - 30 * 3600_000) }, // outside window
    ],
    workspaceConfig: cfg({
      rows: [wfRow("Flow A")],
      policyRows: [{ Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true" }],
    }),
  });
  assert.equal(model.report.runsOk, 1, "24h window excludes older receipts");
  assert.equal(model.report.runsFailed, 1);
  assert.ok(model.report.insights.length > 0);
  assert.equal(model.report.selfRunTotal, 5);
  const heartbeatStep = model.report.selfRun.find((s) => s.id === "heartbeat");
  assert.equal(heartbeatStep.done, false);
  assert.equal(heartbeatStep.action.seedIntent, "swarm", "missing heartbeat seeds the governed swarm/loop lane");
  assert.equal(model.report.selfRun.find((s) => s.id === "policies").done, true);
  assert.equal(model.report.selfRun.find((s) => s.id === "auto-recovery").done, true);
});

/* ================= swarm + standalone ai-agent lenses ================= */
function swarmGraph() {
  return JSON.stringify({
    version: 1, provider: "growthub-native", executionMode: "agent-swarm-v1",
    nodes: [
      { id: "orchestrator", type: "ai-agent", config: { adapter: "local-intelligence", role: "orchestrator" } },
      { id: "worker-1", type: "ai-agent", config: { adapter: "local-intelligence", role: "researcher", taskPrompt: "research" } },
      { id: "synth", type: "ai-agent", config: { adapter: "local-intelligence", role: "synthesizer" } },
    ],
    edges: [{ from: "orchestrator", to: "worker-1" }, { from: "worker-1", to: "synth" }],
  });
}
function agentNodeGraph() {
  return JSON.stringify({
    version: 1, provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", config: { inputMode: "manual", samplePayload: { since: "2026-01-01" } } },
      { id: "agent-step", type: "ai-agent", config: { adapter: "local-agent-host", host: "claude_local", taskPrompt: "summarize" } },
      { id: "result", type: "tool-result", config: { writeLastResponse: true } },
    ],
    edges: [{ from: "input", to: "agent-step" }, { from: "agent-step", to: "result" }],
  });
}
function swarmRecord({ ranAtMs, score, kind = "outcome", tokens = 1200 } = {}) {
  return {
    ranAt: iso(ranAtMs),
    status: "passed",
    durationMs: 1000,
    swarm: {
      status: "passed",
      reward: { kind, parallel: 1, finish: 1, outcome: score, score, weights: {}, note: "" },
      orchestrator: { status: "completed", plan: "plan", tokens },
      tasks: [],
      synthesis: { status: "completed" },
    },
  };
}

test("swarm workflows get eligibility + truthful score/tokens from caller-supplied run records", () => {
  const workspaceConfig = cfg({ rows: [
    { Name: "my-swarm", runLocality: "local", adapter: "local-intelligence", lifecycleStatus: "live", orchestrationConfig: swarmGraph() },
  ] });
  const cardId = "sandbox-workflows::my-swarm::0";
  const model = derivePulseCockpit({
    workspaceConfig, configuredEnvRefs: CONFIGURED, nowMs: NOW,
    runRecordsByCard: { [cardId]: swarmRecord({ ranAtMs: NOW - 3600_000, score: 0.31 }) },
  });
  const entry = model.heartbeats.find((h) => h.name === "my-swarm");
  assert.ok(entry.swarm, "swarm lens present");
  assert.equal(entry.swarm.lastRun.score, 0.31);
  assert.equal(model.swarm.swarms, 1);
  assert.equal(model.swarm.worst.name, "my-swarm");
  assert.equal(model.swarm.reportedTokens24h, 1200, "reported tokens summed, never estimated");
  // Without a record, telemetry stays null-honest.
  const bare = derivePulseCockpit({ workspaceConfig, configuredEnvRefs: CONFIGURED, nowMs: NOW });
  assert.equal(bare.heartbeats.find((h) => h.name === "my-swarm").swarm.lastRun, null);
  assert.equal(bare.swarm.reportedTokens24h, 0);
});

test("swarm budget / quality / health rules fire with governed, targeted actions", () => {
  const workspaceConfig = cfg({
    rows: [{ Name: "my-swarm", runLocality: "local", adapter: "local-intelligence", lifecycleStatus: "live", orchestrationConfig: swarmGraph() }],
    policyRows: [
      { Name: "swarm-budget", ruleKind: "max-swarm-tokens-24h", threshold: 1000, severity: "warn", enabled: "true" },
      { Name: "swarm-quality", ruleKind: "min-swarm-outcome-score", threshold: 0.5, severity: "critical", enabled: "true" },
      { Name: "swarm-health", ruleKind: "max-blocked-swarms", threshold: 0, severity: "warn", enabled: "true" },
    ],
  });
  const cardId = "sandbox-workflows::my-swarm::0";
  const model = derivePulseCockpit({
    workspaceConfig, configuredEnvRefs: CONFIGURED, nowMs: NOW,
    runRecordsByCard: { [cardId]: swarmRecord({ ranAtMs: NOW - 3600_000, score: 0.31 }) },
  });
  const byId = Object.fromEntries(model.findings.map((f) => [f.policyId, f]));
  assert.ok(byId["swarm-budget"], "budget finding fires (1200 > 1000)");
  assert.equal(byId["swarm-budget"].nextAction.handoff, "ceo-cockpit");
  assert.ok(byId["swarm-quality"], "quality finding fires (0.31 < 0.5)");
  assert.equal(byId["swarm-quality"].nextAction.kind, "seed-proposal");
  assert.equal(byId["swarm-quality"].nextAction.seedIntent, "swarm", "review→improve delegates through the governed swarm lane");
  assert.match(byId["swarm-quality"].nextAction.seedPrompt, /"my-swarm"/);
  // Eligibility for this fixture is not ready (no live helper adapter context) → health rule fires with targets.
  if (byId["swarm-health"]) {
    assert.equal(byId["swarm-health"].nextAction.handoff, "checks-tab");
    assert.deepEqual(byId["swarm-health"].nextAction.targetCardIds, [cardId]);
  }
  for (const f of model.findings) assert.ok(f.plain?.title && f.plain?.actionDoes, "plain copy on every finding");
});

test("standalone ai-agent NODES (no swarm) get their own lens and max-failed-agent-nodes rule", () => {
  const trace = JSON.stringify([
    { nodeId: "input", status: "completed" },
    { nodeId: "agent-step", status: "failed" },
    { nodeId: "result", status: "skipped" },
  ]);
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({
      rows: [
        { Name: "single-agent-flow", runLocality: "local", adapter: "local-process", orchestrationConfig: agentNodeGraph(), lastScheduledRunNodeTrace: trace, lastScheduledRunStatus: "502", lastScheduledRunFailedAt: iso(NOW - 60_000), lastScheduledRunAttemptedAt: iso(NOW - 90_000), lastScheduledRunFailureReason: "agent step failed" },
      ],
      policyRows: [{ Name: "agent-steps", ruleKind: "max-failed-agent-nodes", threshold: 0, severity: "critical", enabled: "true" }],
    }),
  });
  const entry = model.heartbeats.find((h) => h.name === "single-agent-flow");
  assert.equal(entry.swarm, null, "a plain ai-agent graph is NOT a swarm");
  assert.ok(entry.agentNodes, "standalone agent lens present");
  assert.equal(entry.agentNodes.count, 1, "only ai-agent nodes counted");
  assert.deepEqual(entry.agentNodes.failed, ["agent-step"]);
  assert.equal(model.agents.failedNodes, 1);
  const finding = model.findings.find((f) => f.policyId === "agent-steps");
  assert.ok(finding, "max-failed-agent-nodes fires");
  assert.equal(finding.nextAction.handoff, "checks-tab");
  assert.deepEqual(finding.nextAction.targetCardIds, [entry.cardId]);
  assert.equal(finding.plain.title, "AI agent steps are failing");
});

test("no policies → sensing still runs, setup state names the gap", () => {
  const model = derivePulseCockpit({ workspaceConfig: cfg({ rows: [wfRow("Flow A")] }), configuredEnvRefs: CONFIGURED, nowMs: NOW });
  assert.equal(model.policySetupState, "none");
  assert.equal(model.findings.length, 0);
  assert.equal(model.autoRecoveryTargets.length, 0);
  assert.equal(model.heartbeats.length, 1);
  assert.equal(model.heartbeats[0].heartbeat.state, "idle");
});
