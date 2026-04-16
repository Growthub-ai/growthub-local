#!/usr/bin/env node
// ---------------------------------------------------------------------------
// check-kit-sync.mjs — kernel gate for the Fork Sync CLI surface.
//
// Verifies the cli/src/kits/sync tree exports the commitments the rest of the
// repo (CLI command layer, docs, interactive discovery) relies on.  Mirrors
// the pattern of check-cli-package.mjs and check-worker-kits.mjs so there is
// one place to confirm the fork sync kernel did not drift.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

for (const required of [
  "cli/src/kits/sync/index.ts",
  "cli/src/kits/sync/service.ts",
  "cli/src/kits/sync/drift.ts",
  "cli/src/kits/sync/merger.ts",
  "cli/src/kits/sync/job-runner.ts",
  "cli/src/kits/sync/types.ts",
  "cli/src/__tests__/kit-sync.test.ts",
  "cli/vitest.sync.config.ts",
]) {
  assert(existsSync(path.join(root, required)), `Missing fork sync artifact: ${required}`);
}

const barrel = readText("cli/src/kits/sync/index.ts");
for (const exported of [
  "initForkSync",
  "planForkSync",
  "startSyncJob",
  "getJobStatus",
  "listJobs",
  "listRegisteredForks",
  "readJobReport",
  "executeSyncJob",
  "mergePackageJson",
  "computeDriftSummary",
]) {
  assert(barrel.includes(exported), `Fork sync barrel missing export: ${exported}`);
}

const kitCommand = readText("cli/src/commands/kit.ts");
for (const requiredToken of [
  "registerKitSyncCommands",
  "registerKitDiscoverCommand",
  '.command("sync")',
  '.command("init")',
  '.command("list")',
  '.command("plan")',
  '.command("start")',
  '.command("status")',
  '.command("jobs")',
  '.command("report")',
  '.command("discover")',
  "Fork sync and self-heal",
]) {
  assert(kitCommand.includes(requiredToken), `kit command missing token: ${requiredToken}`);
}

const service = readText("cli/src/kits/service.ts");
for (const helper of [
  "export function getBundledKitSource",
  "export function copyBundledKitSource",
  "export function listBundledKitIds",
]) {
  assert(service.includes(helper), `kits/service.ts missing bundled source helper: ${helper}`);
}

const syncService = readText("cli/src/kits/sync/service.ts");
for (const behaviour of [
  "resolveSyncRoot",
  "resolveBaselineRoot",
  "createWorktreeBranch",
  "applyDriftToFork",
  "writeReport",
  "spawn(process.execPath",
  "GROWTHUB_SYNC_FORK_ID",
]) {
  assert(syncService.includes(behaviour), `kits/sync/service.ts missing behaviour: ${behaviour}`);
}

const runner = readText("cli/src/kits/sync/job-runner.ts");
assert(runner.includes("executeSyncJob"), "job-runner.ts must call executeSyncJob");
assert(runner.includes("GROWTHUB_SYNC_JOB_ID"), "job-runner.ts must honour GROWTHUB_SYNC_JOB_ID");

const cliReadme = readText("cli/README.md");
for (const token of [
  "growthub kit sync init",
  "growthub kit sync plan",
  "growthub kit sync start",
  "growthub kit sync status",
  "growthub kit discover",
]) {
  assert(cliReadme.includes(token), `cli/README.md missing fork sync documentation: ${token}`);
}

const workerKitsDoc = readText("docs/WORKER_KITS.md");
assert(workerKitsDoc.includes("Fork Sync"), "docs/WORKER_KITS.md must document Fork Sync");

console.log("kit-sync-check passed");
