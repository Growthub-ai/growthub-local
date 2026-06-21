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
const { KNOWN_SCHEDULE_CADENCES, normalizeCadence, isValidCron, cadenceToCron, describeCadence, isValidTimezone, cronApproxMinIntervalSeconds } =
  await import(pathToFileURL(path.join(kitLib, "scheduler-cadence.js")).href);

test("cron RANGE checks reject impossible values (finding 8)", () => {
  assert.equal(isValidCron("99 99 99 99 99"), false);
  assert.equal(isValidCron("0 9 * * *"), true);
  assert.equal(isValidCron("60 9 * * *"), false); // minute max 59
  assert.equal(isValidCron("0 24 * * *"), false); // hour max 23
  assert.equal(isValidCron("0 9 32 * *"), false); // dom max 31
  assert.equal(isValidCron("0 9 * 13 *"), false); // month max 12
  assert.equal(isValidCron("0 9 * * 8"), false);  // dow max 7
  assert.equal(isValidCron("0 9 * * 7"), true);   // 7 = Sunday ok
  assert.equal(isValidCron("0 0 0 0 0"), false);  // dom/month min 1
});

test("cron lists / ranges / steps validated against ranges", () => {
  assert.equal(isValidCron("0,30 9 * * *"), true);
  assert.equal(isValidCron("0-59/5 * * * *"), true);
  assert.equal(isValidCron("0,99 9 * * *"), false);
  assert.equal(isValidCron("10-5 9 * * *"), false); // inverted range
});

test("6/7-field (seconds/year) cron rejected on purpose", () => {
  assert.equal(isValidCron("0 0 9 * * *"), false);
  assert.equal(isValidCron("0 9 * * * 2026"), false);
});

test("minimum-interval guard rejects sub-5-minute schedules", () => {
  assert.equal(cronApproxMinIntervalSeconds("* * * * *"), 60);
  assert.equal(cronApproxMinIntervalSeconds("*/5 * * * *"), 300);
  assert.match(cadenceToCron("recurring", { cron: "* * * * *" }).error, /minimum interval/i);
  assert.match(cadenceToCron("recurring", { cron: "*/1 * * * *" }).error, /minimum interval/i);
  assert.equal(cadenceToCron("recurring", { cron: "*/15 * * * *" }).error, null);
});

test("timezone validation (IANA via Intl)", () => {
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone(""), true);
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("Mars/Phobos"), false);
  assert.match(cadenceToCron("daily", { timezone: "Mars/Phobos" }).error, /invalid timezone/i);
  assert.equal(cadenceToCron("daily", { timezone: "America/New_York" }).error, null);
});

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
