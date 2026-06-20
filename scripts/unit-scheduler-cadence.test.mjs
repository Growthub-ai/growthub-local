#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-cadence.js — the no-code cadence vocabulary
 * and its deterministic cron mapping. Pure, dependency-free.
 *
 * Run with:  node --test scripts/unit-scheduler-cadence.test.mjs
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
const { KNOWN_SCHEDULE_CADENCES, normalizeCadence, isValidCron, cadenceToCron, describeCadence } =
  await import(pathToFileURL(path.join(kitLib, "scheduler-cadence.js")).href);

test("named cadences map to canonical cron; manual has no cron", () => {
  assert.equal(cadenceToCron("manual").cron, null);
  assert.equal(cadenceToCron("manual").requiresInvocation, true);
  assert.equal(cadenceToCron("daily").cron, "0 9 * * *");
  assert.equal(cadenceToCron("weekly").cron, "0 9 * * 1");
  assert.equal(cadenceToCron("monthly").cron, "0 9 1 * *");
});

test("recurring requires a valid explicit cron", () => {
  assert.match(cadenceToCron("recurring").error, /requires an explicit cron/);
  assert.match(cadenceToCron("recurring", { cron: "not a cron" }).error, /invalid cron/);
  assert.equal(cadenceToCron("recurring", { cron: "*/15 * * * *" }).cron, "*/15 * * * *");
  assert.equal(cadenceToCron("recurring", { cron: "0 */6 * * *" }).error, null);
});

test("explicit valid cron overrides a named cadence; invalid override errors", () => {
  assert.equal(cadenceToCron("daily", { cron: "30 7 * * *" }).cron, "30 7 * * *");
  assert.match(cadenceToCron("daily", { cron: "99 99 99 99 99 99" }).error, /invalid cron/);
});

test("isValidCron — 5 fields only, real tokens", () => {
  assert.equal(isValidCron("0 9 * * *"), true);
  assert.equal(isValidCron("*/5 * * * *"), true);
  assert.equal(isValidCron("0 9 * *"), false); // 4 fields
  assert.equal(isValidCron("0 9 * * * *"), false); // 6 fields
  assert.equal(isValidCron("hello"), false);
});

test("normalizeCadence defaults unknown to manual", () => {
  assert.equal(normalizeCadence("DAILY"), "daily");
  assert.equal(normalizeCadence("bogus"), "manual");
  assert.equal(normalizeCadence(""), "manual");
  assert.deepEqual([...KNOWN_SCHEDULE_CADENCES], ["manual", "daily", "weekly", "monthly", "recurring"]);
});

test("describeCadence is human + never throws", () => {
  assert.match(describeCadence("daily"), /every day/i);
  assert.match(describeCadence("manual"), /only when invoked/i);
  assert.doesNotThrow(() => describeCadence(undefined));
});
