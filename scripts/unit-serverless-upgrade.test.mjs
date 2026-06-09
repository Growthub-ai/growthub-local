#!/usr/bin/env node
/**
 * Unit coverage for lib/serverless-upgrade.js — the one-time "upgrade to
 * serverless" onboarding derivation (review extension).
 *
 * Run with:  node --test scripts/unit-serverless-upgrade.test.mjs
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
const { deriveServerlessUpgradeState, rowIsServerless } = await import(pathToFileURL(path.join(kitLib, "serverless-upgrade.js")).href);

const wf = (rows) => ({ dataModel: { objects: [{ objectType: "sandbox-environment", rows }] } });

test("no workflows → no onboarding", () => {
  const s = deriveServerlessUpgradeState({});
  assert.equal(s.hasWorkflows, false);
  assert.equal(s.showOnboarding, false);
});

test("workflows all local, not dismissed → showOnboarding true", () => {
  const s = deriveServerlessUpgradeState(wf([{ Name: "a", runLocality: "local" }, { Name: "b" }]));
  assert.equal(s.hasWorkflows, true);
  assert.equal(s.serverlessCount, 0);
  assert.equal(s.allLocal, true);
  assert.equal(s.showOnboarding, true);
});

test("dismissed → onboarding hidden even when all local", () => {
  const s = deriveServerlessUpgradeState(wf([{ Name: "a", runLocality: "local" }]), { dismissed: true });
  assert.equal(s.showOnboarding, false);
  assert.equal(s.dismissed, true);
});

test("has a serverless workflow → no onboarding", () => {
  const s = deriveServerlessUpgradeState(wf([{ Name: "a", runLocality: "serverless" }, { Name: "b", runLocality: "local" }]));
  assert.equal(s.serverlessCount, 1);
  assert.equal(s.showOnboarding, false);
});

test("rowIsServerless", () => {
  assert.equal(rowIsServerless({ runLocality: "serverless" }), true);
  assert.equal(rowIsServerless({ runLocality: "SERVERLESS" }), true);
  assert.equal(rowIsServerless({ runLocality: "local" }), false);
  assert.equal(rowIsServerless(null), false);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => deriveServerlessUpgradeState());
  assert.doesNotThrow(() => deriveServerlessUpgradeState(null, null));
});
