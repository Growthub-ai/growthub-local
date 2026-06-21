#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-artifact-guard.js — provenance + drift guard
 * for generated scheduler artifacts (finding 12). Pure, never throws.
 *
 * Run with:  node --test scripts/unit-scheduler-artifact-guard.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { buildSchedulerProposal } = await import(pathToFileURL(path.join(kitLib, "workspace-scheduler-proposal.js")).href);
const { auditSchedulerArtifacts } = await import(pathToFileURL(path.join(kitLib, "scheduler-artifact-guard.js")).href);

function wfConfig(row) {
  return { dataModel: { objects: [{ id: "wf", objectType: "sandbox-environment", rows: [{ Name: "digest", ...row }] }] } };
}
function genArtifact({ integrationId, provider, cadence, cron }) {
  const p = buildSchedulerProposal({ integrationId, provider, cadence, cron, objectId: "wf", rowName: "digest", generatedAt: "t" });
  return { filename: p.target.filename, source: p.code };
}

test("clean starter with no scheduler files passes", () => {
  const res = auditSchedulerArtifacts({ workspaceConfig: { dataModel: { objects: [] } }, artifacts: [] });
  assert.equal(res.ok, true);
});

test("generated artifact matching a governed row → generated, ok", () => {
  const cfg = wfConfig({ schedulerRegistryId: "digest-scheduler", scheduleProvider: "qstash-schedule", scheduleCron: "0 9 * * *", scheduleStatus: "scheduled" });
  const art = genArtifact({ integrationId: "digest-scheduler", provider: "qstash-schedule", cadence: "daily", cron: "0 9 * * *" });
  const res = auditSchedulerArtifacts({ workspaceConfig: cfg, artifacts: [art] });
  assert.equal(res.ok, true);
  assert.equal(res.findings.find((f) => f.filename === art.filename).status, "generated");
});

test("generated file with no workflow row → orphan (guard fails)", () => {
  const art = genArtifact({ integrationId: "ghost-scheduler", provider: "qstash-schedule", cadence: "daily", cron: "0 9 * * *" });
  const res = auditSchedulerArtifacts({ workspaceConfig: { dataModel: { objects: [] } }, artifacts: [art] });
  assert.equal(res.ok, false);
  assert.equal(res.problems[0].status, "orphan");
});

test("cron changed in row but artifact stale → stale (guard fails)", () => {
  const cfg = wfConfig({ schedulerRegistryId: "digest-scheduler", scheduleProvider: "qstash-schedule", scheduleCron: "0 18 * * *", scheduleStatus: "scheduled" });
  const art = genArtifact({ integrationId: "digest-scheduler", provider: "qstash-schedule", cadence: "daily", cron: "0 9 * * *" });
  const res = auditSchedulerArtifacts({ workspaceConfig: cfg, artifacts: [art] });
  assert.equal(res.ok, false);
  assert.equal(res.problems[0].status, "stale");
});

test("hand-edited banner (removed) → hand-edited (guard fails)", () => {
  const cfg = wfConfig({ schedulerRegistryId: "digest-scheduler", scheduleProvider: "qstash-schedule", scheduleCron: "0 9 * * *", scheduleStatus: "scheduled" });
  const art = genArtifact({ integrationId: "digest-scheduler", provider: "qstash-schedule", cadence: "daily", cron: "0 9 * * *" });
  const tampered = { filename: art.filename, source: art.source.split("\n").filter((l) => !l.includes("growthub:scheduler-artifact")).join("\n") };
  const res = auditSchedulerArtifacts({ workspaceConfig: cfg, artifacts: [tampered] });
  assert.equal(res.ok, false);
  assert.equal(res.problems[0].status, "hand-edited");
});

test("provisioned workflow with missing artifact → missing-artifact (guard fails)", () => {
  const cfg = wfConfig({ schedulerRegistryId: "digest-scheduler", scheduleProvider: "qstash-schedule", scheduleCron: "0 9 * * *", scheduleStatus: "scheduled" });
  const res = auditSchedulerArtifacts({ workspaceConfig: cfg, artifacts: [] });
  assert.equal(res.ok, false);
  assert.equal(res.problems[0].status, "missing-artifact");
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => auditSchedulerArtifacts());
});
