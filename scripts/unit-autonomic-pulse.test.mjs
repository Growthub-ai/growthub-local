#!/usr/bin/env node
/**
 * /pulse cockpit — command governance + pure heartbeat/policy deriver coverage.
 *
 * The pulse is a command entry path into the existing governed universe, not a
 * new runtime. These tests prove:
 *   - /pulse is a governed, read-only (view) helper command
 *   - the sidecar view is wired (source-scan: no DOM runner needed)
 *   - senseRunHeartbeat classifies idle/running/healthy/failed/stalled from the
 *     governed lastScheduledRun* proof columns, deterministically (caller clock)
 *   - a stalled run always carries a governed recovery hand-off (never stuck)
 *   - evaluatePulsePolicies enforces thresholds, reports unknown rules, and
 *     CLAMPS autoApprove to safe read-only recovery kinds (the invariant bites)
 *   - derivePulseCockpit composes fleet + heartbeats + deployment + policy into
 *     one deterministic condition packet
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
const { OBJECT_TYPE_PRESETS } = await import(pathToFileURL(path.join(kitLib, "workspace-data-model.js")).href);

const CONFIGURED = ["DEMO_DATA"];
const NOW = Date.parse("2026-07-04T12:00:00.000Z");
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
const QSTASH_PRODUCT = { integrationId: "upstash-qstash-workflow", productId: "upstash-qstash", providerId: "upstash", executionLane: "serverless-scheduler", syncStatus: "verified", Name: "QStash" };
const DATA_API = { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" };

function cfg({ rows = [], policyRows = null, vercelRows = null } = {}) {
  const objects = [
    { id: "api-registry", objectType: "api-registry", rows: [QSTASH_PRODUCT, DATA_API] },
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows },
  ];
  // Policy lives in a plain CUSTOM object the user creates through the
  // existing governed create_object lane — never a dedicated object type.
  if (policyRows) objects.push({ id: WORKSPACE_POLICY_OBJECT_ID, objectType: "custom", label: "Workspace Policy", rows: policyRows });
  if (vercelRows) objects.push({ id: "vercel-projects", label: "Vercel Projects", rows: vercelRows });
  return { id: "ws", dataModel: { objects } };
}
function wfRow(name, extra = {}) {
  return { Name: name, runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph(), ...extra };
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

/* ================= sidecar view wiring (source-scan) ================= */
test("HelperSidecar mounts PulseCockpit on activeView === pulse", () => {
  const src = readFileSync(path.join(kitCmp, "HelperSidecar.jsx"), "utf8");
  assert.match(src, /import \{ PulseCockpit \}/);
  assert.match(src, /activeView === "pulse"/);
  assert.match(src, /<PulseCockpit/);
});

/* ================= no-new-object-type invariant ================= */
test("policy introduces NO new object type or preset — rows come from a governed custom object", () => {
  // The contract law: capabilities are projections over existing state.
  assert.equal(OBJECT_TYPE_PRESETS[WORKSPACE_POLICY_OBJECT_ID], undefined, "no workspace-policy preset may exist");
  // readPolicyRows resolves the user-created custom object by conventional id…
  const byId = readPolicyRows(cfg({ policyRows: [
    { Name: "r1", ruleKind: "max-failed-runs", threshold: 1, enabled: "true" },
  ] }));
  assert.equal(byId.length, 1);
  // …or by label, and ignores disabled rows.
  const byLabel = readPolicyRows({ id: "ws", dataModel: { objects: [
    { id: "obj-77", objectType: "custom", label: "Workspace Policy", rows: [
      { Name: "r1", ruleKind: "max-failed-runs", threshold: 1, enabled: "true" },
      { Name: "off", ruleKind: "max-failed-runs", threshold: 1, enabled: "false" },
    ] },
  ] } });
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

  // In flight: attempted within budget+grace, no completion since.
  const running = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - 30_000) }, { nowMs: NOW });
  assert.equal(running.state, "running");

  // Stalled: attempted past budget+grace with no completion — the watchdog case.
  const stallAge = PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS + 5_000;
  const stalled = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - stallAge) }, { nowMs: NOW });
  assert.equal(stalled.state, "stalled");
  assert.equal(stalled.reason, "attempt-past-budget-without-completion");

  // A NEW attempt after an old success re-enters running (attempt > completion).
  const reattempt = senseRunHeartbeat({
    lastScheduledRunAttemptedAt: iso(NOW - 10_000),
    lastScheduledRunSucceededAt: iso(NOW - 300_000),
  }, { nowMs: NOW });
  assert.equal(reattempt.state, "running");

  // Without a clock the sensor stays conservative — never a false stall alarm.
  const noClock = senseRunHeartbeat({ lastScheduledRunAttemptedAt: iso(NOW - stallAge) }, {});
  assert.equal(noClock.state, "running");
  assert.equal(noClock.reason, "no-clock");
});

test("a stalled workflow always carries a governed recovery hand-off (never stuck)", () => {
  const stallAge = PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS + 5_000;
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("Stuck Flow", { lastScheduledRunAttemptedAt: iso(NOW - stallAge) }),
      wfRow("Fine Flow", { lastScheduledRunAttemptedAt: iso(NOW - 90_000), lastScheduledRunSucceededAt: iso(NOW - 60_000), lastScheduledRunStatus: "200" }),
    ] }),
  });
  const stuck = model.heartbeats.find((h) => h.name === "Stuck Flow");
  assert.equal(stuck.heartbeat.state, "stalled");
  assert.ok(stuck.recovery, "recovery present");
  assert.equal(stuck.recovery.kind, "readiness");
  assert.equal(stuck.recovery.handoff, "add-ons-schedule-route");
  assert.ok(stuck.sensorTags.includes(PULSE_SENSOR_TAGS.STALLED_RUN));
  // The stalled heartbeat wins the attention slot.
  assert.equal(model.attention.kind, "heartbeat");
  assert.equal(model.attention.heartbeat.name, "Stuck Flow");
  assert.equal(model.counts.stalled, 1);
  assert.equal(model.counts.healthy, 1);
});

test("a paused stalled workflow chains resume after the readiness rescan", () => {
  const stallAge = PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS + 5_000;
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("Paused Stuck", { schedulerPaused: true, lastScheduledRunAttemptedAt: iso(NOW - stallAge) }),
    ] }),
  });
  const entry = model.heartbeats.find((h) => h.name === "Paused Stuck");
  assert.equal(entry.heartbeat.state, "stalled");
  assert.equal(entry.recovery.then, "resume");
});

test("failed inbound bindings recover through a fresh test event, not the scheduler lane", () => {
  const model = derivePulseCockpit({
    configuredEnvRefs: CONFIGURED,
    nowMs: NOW,
    workspaceConfig: cfg({ rows: [
      wfRow("Hook Flow", {
        schedulerTriggerKind: "inbound-webhook",
        lastScheduledRunAttemptedAt: iso(NOW - 90_000),
        lastScheduledRunFailedAt: iso(NOW - 60_000),
        lastScheduledRunStatus: "500",
        lastScheduledRunFailureReason: "node error",
      }),
    ] }),
  });
  const entry = model.heartbeats.find((h) => h.name === "Hook Flow");
  assert.equal(entry.heartbeat.state, "failed");
  assert.equal(entry.recovery.kind, "retest");
  assert.equal(entry.recovery.handoff, "workflow-sidecar");
});

/* ================= policy evaluation ================= */
function packetWith(overrides = {}) {
  return {
    nowMs: NOW,
    counts: { stalled: 0, failed: 0, blocked: 0, drifted: 0, missingSecrets: 0, ...overrides.counts },
    governance: { blockedAttempts: 0, ...overrides.governance },
    deployment: { anyLive: true, live: 1, errored: 0, projects: 1, appSurfaces: 1, ...overrides.deployment },
    pulseProof: { workflowFound: true, lastBeatMs: NOW - 60_000, lastBeatAt: iso(NOW - 60_000), state: "healthy", ...overrides.pulseProof },
  };
}

test("threshold breach produces a finding; within-threshold stays silent", () => {
  const policies = readPolicyRows(cfg({ policyRows: [
    { Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true" },
  ] }));
  assert.equal(policies.length, 1);

  const quiet = evaluatePulsePolicies({ packet: packetWith(), policyRows: policies });
  assert.equal(quiet.length, 0);

  const loud = evaluatePulsePolicies({ packet: packetWith({ counts: { stalled: 2 } }), policyRows: policies });
  assert.equal(loud.length, 1);
  assert.equal(loud[0].severity, "critical");
  assert.equal(loud[0].sensorTag, PULSE_SENSOR_TAGS.STALLED_RUN);
  // readiness recovery is SAFE → autoApprove honored.
  assert.ok(SAFE_AUTO_RECOVERY_KINDS.includes(loud[0].nextAction.kind));
  assert.equal(loud[0].autoApprovable, true);
});

test("autoApprove is CLAMPED for non-safe recovery kinds (the trust boundary bites)", () => {
  const policies = [
    { policyId: "must-be-live", ruleKind: "require-deployment-live", threshold: null, severity: "critical", autoApprove: true, goal: "", description: "" },
    { policyId: "secrets", ruleKind: "max-missing-secrets", threshold: 0, severity: "warn", autoApprove: true, goal: "", description: "" },
  ];
  const findings = evaluatePulsePolicies({
    packet: packetWith({ deployment: { anyLive: false, live: 0 }, counts: { missingSecrets: 3 } }),
    policyRows: policies,
  });
  assert.equal(findings.length, 2);
  for (const f of findings) {
    assert.equal(f.autoApprovable, false, `${f.policyId} must not auto-approve`);
    assert.equal(f.autoApproveClamped, true, `${f.policyId} clamp is visible`);
    assert.ok(!SAFE_AUTO_RECOVERY_KINDS.includes(f.nextAction.kind));
  }
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

test("pulse-cadence rule flags a silent heartbeat and a missing pulse workflow (watchdog-of-watchdog)", () => {
  const policies = [{ policyId: "beat", ruleKind: "pulse-cadence-minutes", threshold: 30, severity: "warn", autoApprove: false, goal: "", description: "" }];

  const silent = evaluatePulsePolicies({
    packet: packetWith({ pulseProof: { lastBeatMs: NOW - 31 * 60_000, lastBeatAt: iso(NOW - 31 * 60_000) } }),
    policyRows: policies,
  });
  assert.equal(silent.length, 1);
  assert.equal(silent[0].sensorTag, PULSE_SENSOR_TAGS.PULSE_PROOF_STALE);
  assert.equal(silent[0].nextAction.kind, "readiness");

  const absent = evaluatePulsePolicies({
    packet: packetWith({ pulseProof: { workflowFound: false, lastBeatMs: null, lastBeatAt: "" } }),
    policyRows: policies,
  });
  assert.equal(absent.length, 1);
  assert.equal(absent[0].nextAction.kind, "seed-proposal");
  assert.equal(absent[0].nextAction.handoff, "helper-proposal");
});

/* ================= deployment + composition ================= */
test("deployment posture reads governed vercel-projects rows", () => {
  const posture = senseDeploymentPosture(cfg({ vercelRows: [
    { Name: "app", projectId: "prj_1", status: "live", latestDeploymentState: "READY" },
    { Name: "bad", projectId: "prj_2", status: "linked", latestDeploymentState: "ERROR" },
  ] }));
  assert.equal(posture.projects, 2);
  assert.equal(posture.live, 1);
  assert.equal(posture.errored, 1);
  assert.equal(posture.anyLive, true);
});

test("derivePulseCockpit is deterministic and composes fleet + policy + pulse proof", () => {
  const stallAge = PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS + 5_000;
  const workspaceConfig = cfg({
    rows: [
      wfRow("Stuck Flow", { lastScheduledRunAttemptedAt: iso(NOW - stallAge) }),
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
  assert.equal(a.counts.stalled, 1);
  assert.equal(a.findings.length, 1);
  assert.equal(a.findings[0].goal, "keep automations flowing");
  assert.equal(a.autoApprovable.length, 1);
  assert.equal(a.pulseProof.workflowFound, true);
  assert.equal(a.pulseProof.state, "healthy");
  assert.equal(a.governance.blockedAttempts, 1);
  assert.equal(a.mcp.handoffTool, "next_actions");
  // Findings/recoveries only hand off to existing governed surfaces.
  const HANDOFFS = ["add-ons-schedule-route", "workflow-sidecar", "settings-apps", "settings-env", "data-model", "agent-outcomes", "helper-proposal"];
  for (const h of a.heartbeats) if (h.recovery) assert.ok(HANDOFFS.includes(h.recovery.handoff));
  for (const f of a.findings) assert.ok(HANDOFFS.includes(f.nextAction.handoff));
});

test("no policies → sensing still runs, setup state names the gap", () => {
  const model = derivePulseCockpit({ workspaceConfig: cfg({ rows: [wfRow("Flow A")] }), configuredEnvRefs: CONFIGURED, nowMs: NOW });
  assert.equal(model.policySetupState, "none");
  assert.equal(model.findings.length, 0);
  assert.equal(model.heartbeats.length, 1);
  assert.equal(model.heartbeats[0].heartbeat.state, "idle");
});
