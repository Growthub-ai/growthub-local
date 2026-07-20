#!/usr/bin/env node
/**
 * Canonical inference-certification command — the ONE entrypoint local runs
 * and CI both use (`npm run test:inference-certification`).
 *
 * The governed inference control plane enforces JSON Schema with the real
 * AJV validator, resolved lazily at the schema boundary
 * (apps/workspace/lib/adapters/inference/contracts.js). A fresh clone has no
 * node_modules anywhere, so this runner first provisions the exact pinned
 * validator set from the committed manifest + lockfile in
 * scripts/certification-deps (npm ci, lifecycle scripts disabled), then runs
 * every certification suite with NODE_PATH pointing at that scoped install.
 *
 * Guarantees:
 * - deterministic: `npm ci` installs only what package-lock.json pins;
 * - hermetic: no pre-existing node_modules is required or consulted first;
 * - honest: a provisioning failure or a failing suite exits non-zero — there
 *   is no skip lane, no `|| true`, and no test-only validator imitation.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const depsDir = path.join(repoRoot, "scripts", "certification-deps");
const depsNodeModules = path.join(depsDir, "node_modules");

const SUITES = [
  "scripts/unit-inference-control-plane.test.mjs",
  "scripts/unit-inference-evidentiary-backbone.test.mjs",
  "scripts/unit-inference-route-wiring.test.mjs",
];

function fail(message) {
  console.error(`\n[inference-certification] ${message}`);
  process.exit(1);
}

function pinnedVersions() {
  const manifest = JSON.parse(readFileSync(path.join(depsDir, "package.json"), "utf8"));
  return manifest.dependencies || {};
}

function installedVersion(name) {
  const packageJson = path.join(depsNodeModules, name, "package.json");
  if (!existsSync(packageJson)) return "";
  try { return String(JSON.parse(readFileSync(packageJson, "utf8")).version || ""); } catch { return ""; }
}

function provisioned() {
  return Object.entries(pinnedVersions()).every(([name, version]) => installedVersion(name) === version);
}

function provision() {
  console.log("[inference-certification] provisioning pinned validator deps (npm ci, scripts disabled)…");
  const result = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: depsDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`npm ci failed in scripts/certification-deps (exit ${result.status}); the certification suites cannot run without the real AJV validator`);
  }
  if (!provisioned()) {
    fail("npm ci completed but the installed validator versions do not match scripts/certification-deps/package.json — refusing to run against an unpinned validator");
  }
}

if (process.argv.includes("--reinstall") || !provisioned()) provision();

const nodePath = [depsNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
let failures = 0;
for (const suite of SUITES) {
  const suitePath = path.join(repoRoot, suite);
  if (!existsSync(suitePath)) {
    // A listed suite that does not exist is a broken gate, not a skip.
    console.error(`[inference-certification] FAIL ${suite}: suite file is missing`);
    failures += 1;
    continue;
  }
  console.log(`\n[inference-certification] node --test ${suite}`);
  const run = spawnSync(process.execPath, ["--test", suitePath], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: nodePath },
  });
  if (run.status !== 0) {
    console.error(`[inference-certification] FAIL ${suite} (exit ${run.status})`);
    failures += 1;
  }
}

if (failures > 0) fail(`${failures} certification suite(s) failed`);
console.log("\n[inference-certification] all suites passed");
