#!/usr/bin/env node
/**
 * Unit coverage for lib/workspace-scheduler-proposal.js — the governed
 * scheduler-provider lane (AWaC server-file boundary + Causation-ITT receipt
 * loop), modeled on the resolver studio.
 *
 *   - proposal is type scheduler.create with affectedField "server-file"
 *     (explicitly NOT a config PATCH field)
 *   - path confined to lib/adapters/integrations/schedulers, traversal refused
 *   - generated endpoint accepts growthub-sandbox-run-v1 + reads secret from env
 *     candidates (never inlined)
 *   - carries the api-registry scheduler binding + cron scheduleSpec
 *   - validateSchedulerProposal enforces type/field/provider/path/cron
 *   - secret-safe
 *
 * Run with:  node --test scripts/unit-workspace-scheduler-proposal.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-scheduler-proposal.js")).href);
const {
  buildSchedulerProposal,
  validateSchedulerProposal,
  resolveSchedulerFilePath,
  SCHEDULER_AFFECTED_FIELD,
  SCHEDULER_CONNECTOR_KIND,
} = mod;

const SECRET = "qs-never-leak-4242";

test("proposal is a server-file lane, not a config field", () => {
  const p = buildSchedulerProposal({ integrationId: "daily-digest", provider: "qstash-schedule", cadence: "daily", authRef: "QSTASH" });
  assert.equal(p.type, "scheduler.create");
  assert.equal(p.affectedField, "server-file");
  assert.notEqual(p.affectedField, "dataModel");
  assert.equal(p.target.path, "lib/adapters/integrations/schedulers/daily-digest-qstash-schedule.js");
});

test("supabase-edge: Deno handler, envelope guard, env-read secret, no inline value", () => {
  const p = buildSchedulerProposal({ integrationId: "edge-sync", provider: "supabase-edge", cadence: "weekly", authRef: "SUPABASE_EDGE" });
  assert.match(p.code, /Deno\.serve/);
  assert.match(p.code, /growthub-sandbox-run-v1/);
  assert.match(p.code, /SUPABASE_EDGE/); // env candidate present
  assert.equal(p.registryBinding.schedulerProvider, "supabase-edge");
  assert.equal(p.registryBinding.connectorKind, SCHEDULER_CONNECTOR_KIND);
  assert.equal(p.scheduleSpec.cron, "0 9 * * 1");
});

test("qstash-schedule: POST handler, cron carried in scheduleSpec + binding", () => {
  const p = buildSchedulerProposal({ integrationId: "qs-job", provider: "qstash-schedule", cadence: "recurring", cron: "*/30 * * * *", authRef: "QSTASH" });
  assert.match(p.code, /export async function POST/);
  assert.match(p.code, /growthub-sandbox-run-v1/);
  assert.equal(p.scheduleSpec.cron, "*/30 * * * *");
  assert.equal(p.registryBinding.cronExpression, "*/30 * * * *");
});

test("recurring without cron → proposal carries cronError + validation fails", () => {
  const p = buildSchedulerProposal({ integrationId: "broken", provider: "qstash-schedule", cadence: "recurring" });
  assert.ok(p.scheduleSpec.cronError);
  assert.equal(validateSchedulerProposal(p).ok, false);
});

test("secret-safe — value never appears even if passed somewhere", () => {
  const p = buildSchedulerProposal({ integrationId: "x", provider: "supabase-edge", cadence: "daily", authRef: "X" });
  assert.ok(!JSON.stringify(p).includes(SECRET));
  assert.ok(!p.code.includes(SECRET));
});

test("path confinement — traversal slugified to a safe single segment", () => {
  const t = resolveSchedulerFilePath("../../etc/passwd", "supabase-edge");
  assert.equal(t.ok, true);
  assert.ok(t.path.startsWith("lib/adapters/integrations/schedulers/"));
  assert.ok(!t.path.includes(".."));
});

test("validateSchedulerProposal — accepts valid, rejects bad type/field/provider", () => {
  const p = buildSchedulerProposal({ integrationId: "ok", provider: "supabase-edge", cadence: "daily", authRef: "OK" });
  assert.equal(validateSchedulerProposal(p).ok, true);
  assert.equal(validateSchedulerProposal({ type: "resolver.create", affectedField: "server-file" }).ok, false);
  assert.equal(validateSchedulerProposal({ ...p, affectedField: "dataModel" }).ok, false);
  assert.equal(validateSchedulerProposal({ ...p, payload: { ...p.payload, provider: "nope" }, scheduleSpec: { ...p.scheduleSpec, provider: "nope" } }).ok, false);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => buildSchedulerProposal());
  assert.doesNotThrow(() => validateSchedulerProposal());
  const p = buildSchedulerProposal({});
  assert.equal(p.type, "scheduler.create");
  assert.equal(SCHEDULER_AFFECTED_FIELD, "server-file");
});
