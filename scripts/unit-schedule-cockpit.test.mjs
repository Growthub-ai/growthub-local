#!/usr/bin/env node
/**
 * /schedule cockpit — command governance + pure deriver coverage.
 *
 * The cockpit is a command entry path into the existing governed schedule
 * universe, not a new runtime. These tests prove:
 *   - /schedule is a governed, read-only (view) helper command
 *   - the sidecar view is wired (source-scan: no DOM runner needed)
 *   - deriveScheduleCockpit classifies every state from existing workspace truth
 *     (no-provider, scheduled, paused, ready, blocked local-agent, missing
 *     secret, serverless drift, custom provider) and exposes filters/counts
 *
 * Run with:  node --test scripts/unit-schedule-cockpit.test.mjs
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
const { deriveScheduleCockpit } = await import(pathToFileURL(path.join(kitLib, "schedule-cockpit-console.js")).href);

const CONFIGURED = ["DEMO_DATA"]; // env-status resolved ref slugs (no values)

/* ---------- graph fixtures ---------- */
function localGraph({ authRef = "DEMO_DATA", agentLocal = false, missingVar = false } = {}) {
  const nodes = [
    { id: "input", type: "input", config: { inputMode: "manual", samplePayload: missingVar ? {} : { since: "2026-01-01" } } },
  ];
  if (agentLocal) nodes.push({ id: "agent", type: "ai-agent", config: { adapter: "local-agent-host", host: "claude_local" } });
  nodes.push({ id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef, endpoint: "/v1/items?since={{input.since}}" } });
  nodes.push({ id: "result", type: "tool-result", config: { writeLastResponse: true } });
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  return JSON.stringify({ version: 1, provider: "growthub-native", nodes, edges });
}
function boundGraph({ scheduleId, registryId, providerId, productId, authRef = "DEMO_DATA", driftId = null } = {}) {
  return JSON.stringify({
    version: 1, provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", config: {
        inputMode: "serverless-schedule", trigger: "serverless-scheduler", enabled: true,
        schedule: { scheduleId: driftId || scheduleId, schedulerRegistryId: registryId, providerId, productId },
      } },
      { id: "api-request", type: "api-registry-call", config: { registryId: "demo-data-api", authRef } },
      { id: "result", type: "tool-result", config: { writeLastResponse: true } },
    ],
    edges: [{ from: "input", to: "api-request" }, { from: "api-request", to: "result" }],
  });
}

function apiRegistry(rows) {
  return { id: "api-registry", objectType: "api-registry", rows };
}
const QSTASH_PRODUCT = { integrationId: "upstash-qstash-workflow", productId: "upstash-qstash", providerId: "upstash", executionLane: "serverless-scheduler", syncStatus: "verified", region: "us-east-1", Name: "QStash" };
const CUSTOM_PRODUCT = { integrationId: "acme-cron", productId: "acme-cron", providerId: "acme", executionLane: "serverless-scheduler", syncStatus: "verified", Name: "Acme Cron" };
const DATA_API = { integrationId: "demo-data-api", authRef: "DEMO_DATA", syncStatus: "verified", baseUrl: "https://api.demo.test" };

function cfg(rows, products = [QSTASH_PRODUCT]) {
  return { id: "ws", dataModel: { objects: [
    apiRegistry([...products, DATA_API]),
    { id: "sandbox-workflows", objectType: "sandbox-environment", rows },
  ] } };
}
function find(model, name) { return model.workflowCards.find((c) => c.name === name); }

/* ================= command governance ================= */
test("/schedule is a governed, read-only view command in the registry", () => {
  const cmd = HELPER_COMMANDS.find((c) => c.name === "/schedule");
  assert.ok(cmd, "/schedule present in HELPER_COMMANDS");
  assert.equal(cmd.mutates, false);
  assert.equal(cmd.view, "schedule");
  assert.equal(isGovernedHelperCommand(cmd).ok, true);
});

test("a /schedule variant that mutates+switches view is rejected (invariant bites)", () => {
  const bad = { name: "/schedule", label: "Schedule", mutates: true, view: "schedule" };
  assert.equal(isGovernedHelperCommand(bad).ok, false);
});

/* ================= sidecar view wiring (source-scan) ================= */
test("HelperSidecar mounts ScheduleCockpit on activeView === schedule", () => {
  const src = readFileSync(path.join(kitCmp, "HelperSidecar.jsx"), "utf8");
  assert.match(src, /import \{ ScheduleCockpit \}/);
  assert.match(src, /activeView === "schedule"/);
  assert.match(src, /<ScheduleCockpit/);
});

/* ================= deriver: no provider ================= */
test("no scheduler product installed -> setup state none + marketplace route", () => {
  const model = deriveScheduleCockpit({ workspaceConfig: cfg([{ Name: "Flow A", runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph() }], []), configuredEnvRefs: CONFIGURED });
  assert.equal(model.schedulerSetupState, "none");
  assert.equal(model.setupRoute, "/settings/add-ons");
  assert.equal(model.installedSchedulerProducts.length, 0);
});

/* ================= deriver: installed + inventory of every state ================= */
test("installed provider: classifies scheduled/paused/ready/blocked/missing-secret/drift/custom across ALL rows", () => {
  const model = deriveScheduleCockpit({
    configuredEnvRefs: CONFIGURED,
    workspaceConfig: cfg([
      { Name: "Ready Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph() },
      { Name: "Scheduled Flow", runLocality: "serverless", adapter: "local-process", scheduleId: "growthub-upstash-ws-x-scheduled-v1", schedulerRegistryId: "upstash-qstash-workflow", schedulerProviderId: "upstash", schedulerProductId: "upstash-qstash", schedulerCron: "0 9 * * *", orchestrationConfig: boundGraph({ scheduleId: "growthub-upstash-ws-x-scheduled-v1", registryId: "upstash-qstash-workflow", providerId: "upstash", productId: "upstash-qstash" }) },
      { Name: "Paused Flow", runLocality: "serverless", adapter: "local-process", schedulerPaused: true, scheduleId: "growthub-upstash-ws-x-paused-v1", schedulerRegistryId: "upstash-qstash-workflow", schedulerProviderId: "upstash", schedulerProductId: "upstash-qstash", orchestrationConfig: boundGraph({ scheduleId: "growthub-upstash-ws-x-paused-v1", registryId: "upstash-qstash-workflow", providerId: "upstash", productId: "upstash-qstash" }) },
      { Name: "Local Agent Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph({ agentLocal: true }) },
      { Name: "Missing Secret Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph({ authRef: "OTHER_API" }) },
      { Name: "Drift Flow", runLocality: "serverless", adapter: "local-process", scheduleId: "growthub-upstash-ws-x-drift-v1", schedulerRegistryId: "upstash-qstash-workflow", orchestrationConfig: boundGraph({ scheduleId: "growthub-upstash-ws-x-drift-v1", registryId: "upstash-qstash-workflow", providerId: "upstash", productId: "upstash-qstash", driftId: "stale-id-mismatch" }) },
      { Name: "Custom Flow", runLocality: "serverless", adapter: "local-process", scheduleId: "growthub-acme-ws-x-custom-v1", schedulerRegistryId: "acme-cron", schedulerProviderId: "acme", schedulerProductId: "acme-cron", orchestrationConfig: boundGraph({ scheduleId: "growthub-acme-ws-x-custom-v1", registryId: "acme-cron", providerId: "acme", productId: "acme-cron" }) },
    ], [QSTASH_PRODUCT, CUSTOM_PRODUCT]),
  });

  assert.equal(model.schedulerSetupState, "installed");
  assert.equal(model.installedSchedulerProducts.length, 2);

  assert.equal(find(model, "Ready Flow").state, "ready");
  assert.equal(find(model, "Scheduled Flow").state, "scheduled");
  assert.equal(find(model, "Paused Flow").state, "paused");

  const agent = find(model, "Local Agent Flow");
  assert.equal(agent.state, "blocked");
  assert.ok(agent.readiness.deltaTags.includes("local-agent-upgrade-required"));
  assert.ok(agent.tags.includes("Local agent upgrade required"));

  const miss = find(model, "Missing Secret Flow");
  assert.equal(miss.state, "blocked");
  assert.ok(miss.readiness.deltaTags.includes("missing-server-secret"));

  assert.equal(find(model, "Drift Flow").state, "drifted");

  const custom = find(model, "Custom Flow");
  assert.equal(custom.provider, "Custom");
  assert.ok(custom.custom === true);

  // Inventory spans ALL rows, not just the current workflow.
  assert.equal(model.counts.total, 7);
  // Filters present and counted.
  assert.ok(model.filters.find((f) => f.id === "all").count === 7);
  assert.ok(model.filters.some((f) => f.id === "missing-secret"));
  // Attention pick prioritises drift/blocked over ready.
  assert.ok(["drifted", "blocked"].includes(model.attention.state));
});

test("every card hands off to existing routes only (artifact = workflow-canvas, governed nextAction kinds)", () => {
  const model = deriveScheduleCockpit({ configuredEnvRefs: CONFIGURED, workspaceConfig: cfg([
    { Name: "Ready Flow", runLocality: "local", adapter: "local-process", orchestrationConfig: localGraph() },
  ]) });
  const card = find(model, "Ready Flow");
  assert.equal(card.artifact.surface, "workflow-canvas");
  assert.ok(["schedule", "manage", "resume", "readiness", "setup-provider"].includes(card.nextAction.kind));
});
