#!/usr/bin/env node
/**
 * Super-admin Model QA lane — self-contained CLONE of the feature-work
 * export runner. The original `export-seed-workspace.mjs` and its seed
 * module stay byte-identical to main; this runner composes the custom-model
 * closed-loop QA workspace via `lib/super-admin-model-qa-seed.mjs`.
 *
 *   1. export growthub-custom-workspace-starter-v1 via export-worker-kit.mjs --qa
 *   2. write seed (pristine feature seed + model QA evidence layered on a
 *      deep copy) — training-traces are IN growthub.config.json on export
 *   3. validate (schema, activation 5/5, cockpit spine 100)
 *   4. npm install + next dev --webpack (skip with --no-dev)
 *
 * Usage:  node scripts/export-seed-workspace-model-qa.mjs [--no-dev]
 * Output: ${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/model-qa-<ts>/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { KIT_ID, validateFeatureWorkspaceSeed } from "./lib/workspace-feature-seed.mjs";
import { buildSuperAdminModelQaSeed } from "./lib/super-admin-model-qa-seed.mjs";

const BASE_PORT = 3777;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootDev = !process.argv.includes("--no-dev");

async function probeFreePort(start) {
  const net = await import("node:net");
  for (let port = start; port < start + 20; port += 1) {
    const free = await new Promise((resolve) => {
      const srv = net.createServer().once("error", () => resolve(false)).once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error("no free port");
}

const exportsHome = process.env.GROWTHUB_KIT_EXPORTS_HOME?.trim() || path.join(os.homedir(), "growthub-worker-kit-exports");
const runDir = path.join(exportsHome, `model-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`);
assert(!runDir.startsWith(repoRoot), "refusing to export inside the repo tree");
fs.mkdirSync(runDir, { recursive: true });

console.log(`[model-qa] exporting ${KIT_ID} → ${runDir}`);
const exp = spawnSync(process.execPath, [path.join(repoRoot, "scripts/export-worker-kit.mjs"), KIT_ID, "--out", runDir, "--qa"], { stdio: "inherit" });
assert(exp.status === 0, "export-worker-kit.mjs failed");
console.log("[model-qa] export OK");

const appDir = path.join(runDir, KIT_ID, "apps", "workspace");
const seed = buildSuperAdminModelQaSeed({});
fs.writeFileSync(path.join(appDir, "growthub.config.json"), `${JSON.stringify(seed.workspaceConfig, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(appDir, "growthub.source-records.json"), `${JSON.stringify(seed.sourceRecords, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(appDir, ".env.local"), seed.envLocal, "utf8");
console.log("[model-qa] seed written — training-traces + model QA evidence in config");

const validation = await validateFeatureWorkspaceSeed(appDir, seed.workspaceConfig, seed.sourceRecords);
console.log(`[model-qa] validation OK — activation ${validation.activationState.completedCount}/${validation.activationState.totalCount}, cockpit score ${validation.cockpit.score}`);

// Immediate-QA assertion: the traces object is present in the exported
// config with curated + below-floor rows, and the closed-loop evidence is
// readable straight from disk.
const written = JSON.parse(fs.readFileSync(path.join(appDir, "growthub.config.json"), "utf8"));
const traces = written.dataModel.objects.find((o) => o.id === "training-traces");
assert(traces && traces.rows.length === 12, "training-traces must ship in config on export");
assert(written.dataModel.objects.some((o) => o.objectType === "model-training"), "model-training row present");
console.log(`[model-qa] immediate-QA check OK — ${traces.rows.length} trace rows in exported config`);

if (!bootDev) {
  console.log("\n[model-qa] Ready (no dev server).");
  console.log(`  App: ${appDir}`);
  console.log("  Run dev: cd <appDir> && npm install && npx next dev --webpack");
  process.exit(0);
}

console.log("[model-qa] npm install…");
const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: appDir, encoding: "utf8" });
assert(install.status === 0, "npm install failed");
const port = await probeFreePort(BASE_PORT);
console.log(`[model-qa] starting next dev --webpack on http://127.0.0.1:${port}`);
const devChild = spawn("npx", ["next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: appDir,
  detached: true,
  stdio: ["ignore", fs.openSync(path.join(runDir, "dev-server.log"), "a"), fs.openSync(path.join(runDir, "dev-server.log"), "a")],
  env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port) },
});
devChild.unref();
for (let i = 0; i < 120; i += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/workspace`);
    if (r.ok) break;
  } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("\n[model-qa] Ready for super-admin QA.");
console.log(`  App URL: http://127.0.0.1:${port}`);
console.log(`  Export:  ${runDir}`);
console.log(`  Stop:    kill ${devChild.pid}`);
