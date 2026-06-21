#!/usr/bin/env node
/**
 * Unit coverage for the sandbox serverless/scheduling/persistence journey
 * (lib/sandbox-serverless-flow.js) + adapter env-readiness
 * (lib/env-status.js listPersistenceAdapterReadiness). Powers the same cockpit
 * interface for the scheduler-registry / serverless lane (review extension).
 *
 * Run with:  node --test scripts/unit-sandbox-serverless-flow.test.mjs
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
const { deriveSandboxServerlessState } = await import(pathToFileURL(path.join(kitLib, "sandbox-serverless-flow.js")).href);
const { listPersistenceAdapterReadiness } = await import(pathToFileURL(path.join(kitLib, "env-status.js")).href);

const byId = (state) => Object.fromEntries(state.steps.map((s) => [s.id, s.status]));

test("local workflow → no scheduler/persistence steps, run optional", () => {
  const s = deriveSandboxServerlessState({ sandboxRow: { runLocality: "local", adapter: "local-process" } });
  const ids = s.steps.map((x) => x.id);
  assert.ok(ids.includes("locality"));
  assert.ok(ids.includes("adapter"));
  assert.ok(!ids.includes("scheduler"));
  assert.equal(s.isServerless, false);
});

test("serverless without scheduler → scheduler step active, next action link", () => {
  const s = deriveSandboxServerlessState({ sandboxRow: { runLocality: "serverless", adapter: "serverless" } });
  const status = byId(s);
  assert.equal(status.scheduler, "active");
  assert.equal(s.nextAction.id, "link-scheduler");
  assert.equal(s.complete, false);
});

test("serverless + healthy scheduler + auth + durable store → complete, 100", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "qstash-sched", authRef: "QSTASH", status: "connected" }] },
  ] } };
  const s = deriveSandboxServerlessState({
    sandboxRow: { runLocality: "serverless", adapter: "serverless", schedulerRegistryId: "qstash-sched" },
    workspaceConfig: cfg,
    configuredEnvRefs: ["QSTASH"],
    persistenceAdapters: [{ id: "qstash-kv", label: "Qstash KV", mode: "kv", requiredEnv: ["QSTASH_KV_REST_URL"], configured: true, missingEnv: [] }],
  });
  const status = byId(s);
  assert.equal(status.scheduler, "complete");
  assert.equal(status["scheduler-auth"], "complete");
  assert.equal(status.persistence, "complete");
  assert.equal(s.complete, true);
  assert.equal(s.score, 100);
});

test("serverless + scheduler missing auth → scheduler-auth pending with settings action", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "qstash-sched", authRef: "QSTASH", status: "connected" }] },
  ] } };
  const s = deriveSandboxServerlessState({
    sandboxRow: { runLocality: "serverless", adapter: "serverless", schedulerRegistryId: "qstash-sched" },
    workspaceConfig: cfg,
    configuredEnvRefs: [],
    persistenceAdapters: [{ id: "provider-managed", label: "Provider Managed", mode: "external", requiredEnv: [], configured: true, missingEnv: [] }],
  });
  const status = byId(s);
  assert.equal(status["scheduler-auth"], "pending");
});

test("listPersistenceAdapterReadiness — real descriptors, env-injected", () => {
  const ready = listPersistenceAdapterReadiness({ QSTASH_KV_REST_URL: "u", QSTASH_KV_REST_TOKEN: "t" });
  const qstash = ready.find((a) => a.id === "qstash-kv");
  const postgres = ready.find((a) => a.id === "postgres");
  const provider = ready.find((a) => a.id === "provider-managed");
  assert.equal(qstash.configured, true);
  assert.equal(postgres.configured, false);
  assert.deepEqual(postgres.missingEnv, ["DATABASE_URL"]);
  assert.equal(provider.configured, true); // no env required
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => deriveSandboxServerlessState());
  assert.doesNotThrow(() => listPersistenceAdapterReadiness(undefined));
  assert.ok(Array.isArray(deriveSandboxServerlessState({}).steps));
});
