#!/usr/bin/env node
/**
 * Export + seed a disposable feature-work workspace (agnostic — no swarm lane).
 *
 *   1. export growthub-custom-workspace-starter-v1 via export-worker-kit.mjs
 *   2. pre-boot seed growthub.config.json + growthub.source-records.json + .env.local
 *   3. validate schema + activation (5/5) + api-registry cockpit spine
 *   4. npm install + next dev --webpack (skip with --no-dev)
 *
 * Usage (repo root):
 *   node scripts/export-seed-workspace.mjs [--no-dev] [--keep|--clean] [--dry-run]
 *
 * Docs: scripts/export-seed-workspace.md
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  KIT_ID,
  buildFeatureWorkspaceSeed,
  validateFeatureWorkspaceSeed,
} from "./lib/workspace-feature-seed.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PORT = 3777;

function usage() {
  console.log([
    "Usage:",
    "  node scripts/export-seed-workspace.mjs [--no-dev] [--keep|--clean] [--dry-run]",
    "",
    "Exports + seeds a super-admin-ready workspace under",
    "  ${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/feature-work-<ts>/",
    "",
    "  --no-dev   export + seed + validate only (no next dev)",
    "  --keep     keep export on success (default)",
    "  --clean    remove export on success",
    "  --dry-run  print plan and exit",
  ].join("\n"));
}

function parseArgs(argv) {
  const result = { keep: true, dryRun: false, bootDev: true };
  for (const arg of argv.slice(2)) {
    if (arg === "--no-dev") result.bootDev = false;
    else if (arg === "--keep") result.keep = true;
    else if (arg === "--clean") result.keep = false;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isInside(parentDir, childDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childDir));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function probeFreePort(start) {
  for (let port = start; port < start + 100; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port in ${start}..${start + 99}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttpReady(url, maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000), cache: "no-store" });
      if (res.ok) return;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`server not ready within ${maxMs}ms: ${url}`);
}

function tailLog(logPath, lines = 40) {
  try {
    return fs.readFileSync(logPath, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

async function main() {
  const { keep, dryRun, bootDev } = parseArgs(process.argv);

  const exportsHome = process.env.GROWTHUB_KIT_EXPORTS_HOME?.trim()
    || path.join(process.env.HOME || "/tmp", "growthub-worker-kit-exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(exportsHome, `feature-work-${stamp}`);

  assert(!isInside(repoRoot, runDir), `refusing to run inside repo: ${runDir}`);
  assert(!isInside(path.join(repoRoot, "instances"), runDir), "refusing to run inside instances/");

  const kitRoot = path.join(repoRoot, "cli", "assets", "worker-kits", KIT_ID);
  const bundleManifest = readJson(path.join(kitRoot, readJson(path.join(kitRoot, "kit.json")).bundles[0].path));
  const folderName = bundleManifest.export.folderName;
  const exportedKit = path.join(runDir, folderName);
  const appDir = path.join(exportedKit, "apps", "workspace");

  if (dryRun) {
    console.log("[feature-work] DRY RUN");
    console.log(`  1. export ${KIT_ID} → ${runDir}`);
    console.log("  2. seed config + source-records + .env.local (activation 5/5 + api-registry cockpit)");
    console.log(`  3. validate via exported lib/* derivation modules`);
    console.log(`  4. ${bootDev ? "npm install + next dev --webpack" : "skip dev (--no-dev)"}`);
    return;
  }

  fs.mkdirSync(runDir, { recursive: true });
  let devChild = null;
  let devPort = 0;
  const killDev = () => {
    if (devChild && !devChild.killed) {
      try { devChild.kill("SIGTERM"); } catch { /* ignore */ }
    }
    if (devPort > 0) {
      spawnSync("sh", ["-c", `pkill -f "next dev.*-p ${devPort}" 2>/dev/null || true`], { stdio: "ignore" });
    }
  };
  process.on("SIGINT", () => { killDev(); process.exit(130); });
  process.on("SIGTERM", () => { killDev(); process.exit(143); });

  try {
    console.log(`[feature-work] exporting ${KIT_ID} → ${runDir}`);
    const exp = spawnSync(process.execPath, [path.join(repoRoot, "scripts/export-worker-kit.mjs"), KIT_ID, "--out", runDir, "--qa"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (exp.status !== 0) {
      console.error(exp.stdout || "");
      console.error(exp.stderr || "");
      throw new Error("export-worker-kit.mjs failed");
    }
    assert(fs.existsSync(appDir), "exported apps/workspace missing");
    console.log("[feature-work] export OK");

    const baseCfg = readJson(path.join(appDir, "growthub.config.json"));
    const seed = buildFeatureWorkspaceSeed(baseCfg);
    fs.writeFileSync(path.join(appDir, "growthub.config.json"), `${JSON.stringify(seed.workspaceConfig, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(appDir, "growthub.source-records.json"), `${JSON.stringify(seed.sourceRecords, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(appDir, ".env.local"), seed.envLocal, "utf8");
    console.log("[feature-work] seed written");

    const validation = await validateFeatureWorkspaceSeed(appDir, seed.workspaceConfig, seed.sourceRecords);
    console.log(`[feature-work] validation OK — activation ${validation.activationState.completedCount}/${validation.activationState.totalCount}, cockpit score ${validation.cockpit.score}`);

    if (!bootDev) {
      console.log("");
      console.log("[feature-work] Ready (no dev server).");
      console.log(`  Export: ${exportedKit}`);
      console.log(`  App:    ${appDir}`);
      console.log("  Run dev: cd <appDir> && npm install && npx next dev --webpack");
      return;
    }

    const logPath = path.join(runDir, "dev-server.log");
    console.log("[feature-work] npm install…");
    const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: appDir,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    });
    fs.writeFileSync(logPath, `${install.stdout || ""}\n${install.stderr || ""}\n`);
    assert(install.status === 0, `npm install failed — see ${logPath}`);

    const port = await probeFreePort(BASE_PORT);
    devPort = port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`[feature-work] starting next dev --webpack on ${base}`);
    const logFd = fs.openSync(logPath, "a");
    devChild = spawn("npx", ["next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: appDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port) },
    });
    fs.closeSync(logFd);

    try {
      await waitForHttpReady(`${base}/api/workspace`);
    } catch (err) {
      console.error(`[feature-work] dev failed — log tail:\n${tailLog(logPath)}`);
      throw err;
    }

    console.log("");
    console.log("[feature-work] Ready for feature testing.");
    console.log(`  Export:  ${exportedKit}`);
    console.log(`  App URL: ${base}`);
    console.log(`  Log:     ${logPath}`);
    console.log(`  State:   activation complete · api-registry cockpit spine complete · baseline sandbox ran`);
    console.log(`  Stop:    kill ${devChild.pid}`);

    if (!keep) {
      killDev();
      await sleep(2000);
      fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      console.log(`[feature-work] --clean removed ${runDir}`);
    } else {
      devChild.unref();
    }
  } catch (err) {
    killDev();
    throw err;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
