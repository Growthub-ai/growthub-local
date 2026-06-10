#!/usr/bin/env node
/**
 * Disposable lived-in workspace export + governed /swarm journey smoke.
 *
 * Stands up a temp export of growthub-custom-workspace-starter-v1 pre-seeded
 * as a REAL workspace (dashboard with widgets, completed api-registry smoke,
 * a non-swarm workflow graph row) and proves the governed /swarm journey on
 * top of that baseline through pure-causation checkpoints C1–C7. The operator
 * then lands directly on the human browser pass.
 *
 * Grounding (verified, not invented):
 *   - Export: scripts/export-worker-kit.mjs (reused via child_process; folder
 *     name read from the kit bundle manifest).
 *   - Seed lane: PRE-BOOT direct write of apps/workspace/growthub.config.json
 *     — the lane scripts/e2e-workspace-sandbox-api-probe.mjs proves (lines
 *     192–195); PATCH /api/workspace is the only POST-boot mutation lane
 *     (scripts/awac-workspace-api-probe.mjs lines 254–263) and stays the
 *     app's runtime write path.
 *   - Seed shapes: see scripts/smoke-export-swarm-workspace.seed.mjs header
 *     for per-object probe citations.
 *   - Validator: the EXPORTED apps/workspace/lib/workspace-schema.js.
 *   - Release truth: cli/package.json 0.14.0 on this branch; exported
 *     kit.json version must match the repo kit.json. (Git release tags are
 *     not fetched in shallow CI clones — version assertions use committed
 *     package/kit manifests per docs/RELEASE_DIST_REBUILD_WORKFLOW.md.)
 *
 * Usage (from repo root):
 *   node scripts/smoke-export-swarm-workspace.mjs [--keep|--clean] [--dry-run]
 *
 * Safety: refuses to run inside the repo or instances/; only ever removes the
 * directory it created this run; SIGINT/SIGTERM kill the dev-server child.
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  API_REGISTRY_OBJECT,
  SANDBOX_OBJECT,
  HELPER_SANDBOX_OBJECT,
  SEED_DASHBOARDS,
  SEED_CANVAS_WIDGETS,
  STUB_ADAPTER_SOURCE,
  SWARM_QUERY_PROMPT,
} from "./smoke-export-swarm-workspace.seed.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT_ID = "growthub-custom-workspace-starter-v1";
const BASE_PORT = 3777;
const BASELINE_OBJECT_IDS = [API_REGISTRY_OBJECT.id, SANDBOX_OBJECT.id, HELPER_SANDBOX_OBJECT.id];

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/smoke-export-swarm-workspace.mjs [--keep|--clean] [--dry-run]",
      "",
      "Creates a disposable lived-in workspace export under",
      "  ${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/smoke-swarm-<ts>/",
      "seeds it with the completed prior-smoke baseline, boots next dev, runs",
      "checkpoints C1–C7, and prints the human /swarm browser pass.",
      "",
      "  --keep     keep the temp export on success (default)",
      "  --clean    remove the temp export on success",
      "  --dry-run  print the plan and exit",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const result = { keep: true, dryRun: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--keep") result.keep = true;
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

function countFiles(rootDir) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else count += 1;
    }
  };
  walk(rootDir);
  return count;
}

// Canonical JSON (recursively sorted keys) → sha256. Baseline objects must
// hash byte-identically across checkpoints to prove zero collateral mutation.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function baselineSnapshot(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  const hashes = {};
  let rowCount = 0;
  for (const id of BASELINE_OBJECT_IDS) {
    const object = objects.find((o) => o?.id === id);
    assert(object, `baseline object ${id} missing from workspace config`);
    hashes[id] = hashObject(object);
    rowCount += Array.isArray(object.rows) ? object.rows.length : 0;
  }
  hashes["dashboards"] = hashObject(workspaceConfig.dashboards || []);
  hashes["canvas.widgets"] = hashObject(workspaceConfig.canvas?.widgets || []);
  return { hashes, rowCount };
}

function assertBaselineUnchanged(before, after, context) {
  for (const [key, hash] of Object.entries(before.hashes)) {
    assert(after.hashes[key] === hash, `${context}: baseline "${key}" hash changed (collateral mutation)`);
  }
  assert(after.rowCount === before.rowCount, `${context}: baseline row count changed ${before.rowCount} → ${after.rowCount}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function probeFreePort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`no free port found in ${start}..${start + 99}`);
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
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`server did not become ready within ${maxMs}ms: ${url}`);
}

async function getWorkspaceConfig(base) {
  const res = await fetch(`${base}/api/workspace`, { cache: "no-store" });
  assert(res.ok, `GET /api/workspace failed: ${res.status}`);
  const payload = await res.json();
  assert(payload?.workspaceConfig, "GET /api/workspace returned no workspaceConfig");
  return payload.workspaceConfig;
}

async function postJson(base, route, body) {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function checkpoint(n, fact) {
  console.log(`CHECKPOINT ${n} OK: ${fact}`);
}

function tailLog(logPath, lines = 40) {
  try {
    const text = fs.readFileSync(logPath, "utf8");
    return text.split("\n").slice(-lines).join("\n");
  } catch {
    return "(no log captured)";
  }
}

async function main() {
  const { keep, dryRun } = parseArgs(process.argv);

  const exportsHome = process.env.GROWTHUB_KIT_EXPORTS_HOME?.trim()
    || path.join(process.env.HOME || "/tmp", "growthub-worker-kit-exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(exportsHome, `smoke-swarm-${stamp}`);

  // Safety rails: never inside the repo, never inside instances/, never reuse.
  assert(!isInside(repoRoot, runDir), `refusing to run inside the repo: ${runDir}`);
  assert(!isInside(path.join(repoRoot, "instances"), runDir), "refusing to run inside instances/");
  assert(
    !fs.existsSync(runDir) || fs.readdirSync(runDir).length === 0,
    `refusing to reuse non-empty target: ${runDir}`,
  );

  const kitRoot = path.join(repoRoot, "cli", "assets", "worker-kits", KIT_ID);
  const bundleManifest = readJson(path.join(kitRoot, readJson(path.join(kitRoot, "kit.json")).bundles[0].path));
  const folderName = bundleManifest.export.folderName;
  const exportedKit = path.join(runDir, folderName);
  const appDir = path.join(exportedKit, "apps", "workspace");

  if (dryRun) {
    console.log("[smoke] DRY RUN — plan:");
    console.log(`  1. node scripts/export-worker-kit.mjs ${KIT_ID} --out ${runDir} --qa`);
    console.log(`  2. seed ${path.join(appDir, "growthub.config.json")} pre-boot (e2e-probe lane) with:`);
    console.log("     dashboard 'Ops Overview' + 3 widgets · api-registry-probe (2 rows) ·");
    console.log("     sandbox-probe (probe-local-sbx + registry-workflow graph) · workspace-helper-sandbox (stub agent) ·");
    console.log("     deterministic local-agent-host stub in lib/adapters/sandboxes/adapters/ · NO swarm-workflows row");
    console.log("  3. validate with the exported lib/workspace-schema.js");
    console.log(`  4. npm install + next dev (port probed from ${BASE_PORT}) inside the export only`);
    console.log("  5. checkpoints C1–C7 (export → seed → boot → baseline run → propose-only → governed apply → swarm run)");
    console.log(`  6. ${keep ? "keep" : "remove"} ${runDir} on success; print the human /swarm browser pass`);
    return;
  }

  fs.mkdirSync(runDir, { recursive: true });
  let devChild = null;
  let devPort = 0;
  const killDev = () => {
    if (devChild && !devChild.killed) {
      try { devChild.kill("SIGTERM"); } catch { /* ignore */ }
    }
    // npx wraps next in a grandchild SIGTERM does not always reach — the
    // port-scoped pkill fallback is the pattern the e2e probe proves
    // (scripts/e2e-workspace-sandbox-api-probe.mjs lines 569–573).
    if (devPort > 0) {
      try {
        spawnSync("sh", ["-c", `pkill -f "next dev -p ${devPort}" 2>/dev/null || true`], { stdio: "ignore" });
      } catch { /* ignore */ }
    }
  };
  process.on("SIGINT", () => { killDev(); process.exit(130); });
  process.on("SIGTERM", () => { killDev(); process.exit(143); });

  try {
    // --- C1: export via the canonical exporter -----------------------------
    console.log(`[smoke] exporting ${KIT_ID} → ${runDir}`);
    const exp = spawnSync(process.execPath, [path.join(repoRoot, "scripts/export-worker-kit.mjs"), KIT_ID, "--out", runDir, "--qa"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (exp.status !== 0) {
      console.error(exp.stdout || "");
      console.error(exp.stderr || "");
      throw new Error("export-worker-kit.mjs failed");
    }
    assert(fs.existsSync(path.join(exportedKit, "kit.json")), "exported kit.json missing");
    assert(fs.existsSync(appDir), "exported apps/workspace missing");
    const exportedKitVersion = readJson(path.join(exportedKit, "kit.json")).kit?.version;
    const repoKitVersion = readJson(path.join(kitRoot, "kit.json")).kit?.version;
    assert(exportedKitVersion === repoKitVersion, `export kit version ${exportedKitVersion} != repo ${repoKitVersion}`);
    const cliVersion = readJson(path.join(repoRoot, "cli", "package.json")).version;
    const fileCount = countFiles(exportedKit);
    checkpoint(1, `exporter exit 0; manifest + apps/workspace present; ${fileCount} files; kit v${exportedKitVersion} on cli v${cliVersion}`);

    // --- C2: seed the lived-in baseline pre-boot (e2e-probe lane) ----------
    const cfgPath = path.join(appDir, "growthub.config.json");
    const baseCfg = readJson(cfgPath);
    baseCfg.dashboards = SEED_DASHBOARDS;
    baseCfg.canvas = { ...(baseCfg.canvas || {}), widgets: SEED_CANVAS_WIDGETS };
    baseCfg.dataModel = { objects: [API_REGISTRY_OBJECT, SANDBOX_OBJECT, HELPER_SANDBOX_OBJECT] };
    fs.writeFileSync(cfgPath, `${JSON.stringify(baseCfg, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(appDir, "lib/adapters/sandboxes/adapters/smoke-agent-host-stub.js"), STUB_ADAPTER_SOURCE, "utf8");

    const schemaModule = await import(pathToFileURL(path.join(appDir, "lib", "workspace-schema.js")).href);
    schemaModule.validateWorkspaceConfig({
      dashboards: baseCfg.dashboards,
      canvas: baseCfg.canvas,
      dataModel: baseCfg.dataModel,
    });
    assert(
      !(baseCfg.dataModel.objects || []).some((o) => o.id === "swarm-workflows"),
      "seed must NOT contain a swarm-workflows object — that is the journey's delta",
    );
    const seedSnapshot = baselineSnapshot(baseCfg);
    checkpoint(2, `seed valid (exported validator, 0 errors); baseline rows N=${seedSnapshot.rowCount}; ${SEED_CANVAS_WIDGETS.length} widgets; ${Object.keys(seedSnapshot.hashes).length} baseline hashes recorded`);

    // --- boot: install + next dev scoped to the export ----------------------
    console.log("[smoke] npm install (exported workspace app)…");
    const logPath = path.join(runDir, "dev-server.log");
    const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: appDir,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    });
    fs.appendFileSync(logPath, `${install.stdout || ""}\n${install.stderr || ""}\n`);
    assert(install.status === 0, `npm install failed — see ${logPath}`);

    const port = await probeFreePort(BASE_PORT);
    devPort = port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`[smoke] starting next dev on ${base} (log: ${logPath})`);
    // Server output goes STRAIGHT to the log file descriptor — never a pipe.
    // With --keep this script exits while the server lives on; a piped stdout
    // would lose its reader, fill the pipe buffer, and freeze the server.
    const logFd = fs.openSync(logPath, "a");
    devChild = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: appDir,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port) },
    });
    fs.closeSync(logFd);

    try {
      await waitForHttpReady(`${base}/api/workspace`);
    } catch (err) {
      console.error(`[smoke] dev server failed — last 40 log lines:\n${tailLog(logPath)}`);
      throw err;
    }

    // --- C3: seeded baseline reached the running app intact ----------------
    const bootCfg = await getWorkspaceConfig(base);
    const bootSnapshot = baselineSnapshot(bootCfg);
    assertBaselineUnchanged(seedSnapshot, bootSnapshot, "C3 boot");
    const bootWidgets = bootCfg.canvas?.widgets?.length || 0;
    assert(bootWidgets === SEED_CANVAS_WIDGETS.length, `expected ${SEED_CANVAS_WIDGETS.length} widgets after boot, got ${bootWidgets}`);
    checkpoint(3, `server healthy on :${port}; GET returns seeded baseline intact (N=${bootSnapshot.rowCount} rows, ${bootWidgets} widgets)`);

    // --- C4: baseline regression floor — seeded non-swarm row still runs ---
    const baselineRun = await postJson(base, "/api/workspace/sandbox-run", { objectId: SANDBOX_OBJECT.id, name: "probe-local-sbx" });
    assert(baselineRun.status === 200 && baselineRun.json?.ok === true, `baseline sandbox-run failed: ${baselineRun.status} ${JSON.stringify(baselineRun.json)?.slice(0, 300)}`);
    assert(baselineRun.json.persisted === true, "baseline run must persist a source record");
    assert(String(baselineRun.json.response?.stdout || "").includes("growthub-probe-ok"), "baseline run stdout must echo probe marker");
    const baselineHistory = await fetch(`${base}/api/workspace/sandbox-run?objectId=${SANDBOX_OBJECT.id}&name=probe-local-sbx`).then((r) => r.json());
    assert(baselineHistory.ok && baselineHistory.recordCount >= 1, "baseline run history missing");
    // The run stamps the row (status/lastRunId/lastResponse) — that IS the
    // lived-in state. Re-snapshot: this is the baseline every later
    // checkpoint must leave byte-identical.
    const livedInSnapshot = baselineSnapshot(await getWorkspaceConfig(base));
    checkpoint(4, `seeded non-swarm row ran ok (runId ${baselineRun.json.runId}, persisted, ${baselineHistory.recordCount} record(s)); lived-in baseline re-snapshotted`);

    // --- C5: /swarm query is propose-only on lived-in state ----------------
    const query = await postJson(base, "/api/workspace/helper/query", { intent: "swarm", userPrompt: SWARM_QUERY_PROMPT });
    assert(query.status === 200 && query.json?.ok === true, `helper query failed: ${query.status} ${JSON.stringify(query.json)?.slice(0, 300)}`);
    const proposal = (query.json.proposals || [])[0];
    assert(proposal?.type === "swarm.run.propose", `expected swarm.run.propose, got ${proposal?.type}`);
    const afterQueryCfg = await getWorkspaceConfig(base);
    assertBaselineUnchanged(livedInSnapshot, baselineSnapshot(afterQueryCfg), "C5 query");
    assert(
      !(afterQueryCfg.dataModel?.objects || []).some((o) => o?.id === "swarm-workflows"),
      "query must not create the swarm-workflows object",
    );
    checkpoint(5, `helper query returned swarm.run.propose; baseline rows still N=${livedInSnapshot.rowCount}; hashes unchanged; no swarm-workflows object (query wrote nothing)`);

    // --- C6: governed apply creates exactly the one new row ----------------
    const apply = await postJson(base, "/api/workspace/helper/apply", { proposals: [proposal], reviewedBy: "smoke-export-swarm" });
    assert(apply.status === 200 && apply.json?.ok === true, `helper apply failed: ${apply.status}`);
    assert((apply.json.applied || []).length === 1, `expected 1 applied receipt, got ${(apply.json.applied || []).length}`);
    const artifact = apply.json.applied[0]?.artifact;
    assert(artifact?.surface === "swarm-run" && artifact?.objectId === "swarm-workflows", `receipt artifact malformed: ${JSON.stringify(artifact)}`);
    let afterApplyCfg = await getWorkspaceConfig(base);
    assertBaselineUnchanged(livedInSnapshot, baselineSnapshot(afterApplyCfg), "C6 apply");
    const swarmObject = (afterApplyCfg.dataModel?.objects || []).find((o) => o?.id === "swarm-workflows");
    assert(swarmObject && swarmObject.rows?.length === 1, "apply must create exactly one swarm-workflows row");
    const swarmGraph = JSON.parse(swarmObject.rows[0].orchestrationConfig);
    assert(swarmGraph.executionMode === "agent-swarm-v1" && swarmGraph.provider === "growthub-native", "swarm row graph must be agent-swarm-v1/growthub-native");
    // Duplicate apply de-dupes by Name.
    await postJson(base, "/api/workspace/helper/apply", { proposals: [proposal], reviewedBy: "smoke-export-swarm" });
    afterApplyCfg = await getWorkspaceConfig(base);
    const swarmRowsAfterDupe = (afterApplyCfg.dataModel.objects.find((o) => o.id === "swarm-workflows")?.rows || []).length;
    assert(swarmRowsAfterDupe === 1, `duplicate apply must keep 1 row, got ${swarmRowsAfterDupe}`);
    assertBaselineUnchanged(livedInSnapshot, baselineSnapshot(afterApplyCfg), "C6 duplicate apply");
    checkpoint(6, `apply created N+1 (baseline ${livedInSnapshot.rowCount} + 1 swarm row, executionMode agent-swarm-v1); baseline hashes byte-identical; duplicate apply de-duped`);

    // --- C7: swarm run through the existing sandbox-run --------------------
    const swarmName = swarmObject.rows[0].Name;
    const swarmRun = await postJson(base, "/api/workspace/sandbox-run", { objectId: "swarm-workflows", name: swarmName });
    assert(swarmRun.status === 200 && swarmRun.json?.ok === true, `swarm run failed: ${swarmRun.status} ${JSON.stringify(swarmRun.json)?.slice(0, 400)}`);
    assert(swarmRun.json.persisted === true, "swarm run must persist a source record");
    const swarmHistory = await fetch(`${base}/api/workspace/sandbox-run?objectId=swarm-workflows&name=${encodeURIComponent(swarmName)}`).then((r) => r.json());
    assert(swarmHistory.ok && swarmHistory.recordCount >= 1, "swarm run history missing");
    const consoleModule = await import(pathToFileURL(path.join(appDir, "lib", "orchestration-run-console.js")).href);
    const projection = consoleModule.deriveSwarmRunProjection(swarmHistory.records[0]);
    assert(projection, "swarm record must project");
    const phaseIds = projection.phases.map((p) => p.id);
    assert(phaseIds.includes("plan") && phaseIds.includes("synthesize"), `projection must include plan+synthesize, got ${phaseIds.join(",")}`);
    const dispatchAgents = projection.phases.filter((p) => !["plan", "synthesize"].includes(p.id)).flatMap((p) => p.agents);
    assert(dispatchAgents.length >= 1, "projection must include dispatch agents");
    assert(dispatchAgents.every((a) => a.tokens === null && a.tools === null), "stub reports no telemetry — projection must keep null, never estimate");
    const finalCfg = await getWorkspaceConfig(base);
    assertBaselineUnchanged(livedInSnapshot, baselineSnapshot(finalCfg), "C7 swarm run");
    const baselineHistoryAfter = await fetch(`${base}/api/workspace/sandbox-run?objectId=${SANDBOX_OBJECT.id}&name=probe-local-sbx`).then((r) => r.json());
    assert(baselineHistoryAfter.recordCount === baselineHistory.recordCount, "baseline run history must be untouched by the swarm run");
    checkpoint(7, `swarm ran ok (runId ${swarmRun.json.runId}); persisted + in history; projection phases [${phaseIds.join(", ")}]; telemetry truthfully null; baseline rows + history untouched`);

    // --- operator handoff ---------------------------------------------------
    console.log("");
    console.log("[smoke] ALL CHECKPOINTS GREEN — lived-in export ready.");
    console.log(`  Temp export: ${exportedKit}`);
    console.log(`  App URL:     ${base}`);
    console.log(`  Server log:  ${logPath}`);
    console.log(`  Baseline:    dashboard ✓ ${SEED_CANVAS_WIDGETS.length} widgets · api-registry ✓ ${API_REGISTRY_OBJECT.rows.length} rows · sandbox graph ✓ ran (probe-local-sbx)`);
    console.log("  Helper:      wired to the bundled deterministic agent stub (swap via Setup tab for a real model)");
    console.log("");
    console.log("  Human pass (the REAL test):");
    console.log(`    1. Open ${base}/data-model and open the helper widget (Ask helper)`);
    console.log('    2. Type "/" in the composer — the command menu opens');
    console.log("    3. Pick /swarm (fuzzy: type /swa) and send");
    console.log("    4. Review the swarm.run.propose proposal card");
    console.log("    5. Apply — the ToolCallCard receipt appears");
    console.log("    6. Click Open on the receipt — the Background-tasks cockpit detail opens");
    console.log("    7. Launch the workflow (▶) — watch the card render Running → Finished");
    console.log("       alongside the pre-existing baseline objects (dashboard, registry, workflow)");
    console.log("    8. Drill into an agent transcript; Expand; Esc collapses back");
    console.log("");

    if (!keep) {
      killDev();
      // Give next dev time to stop writing .next before removal; rmSync
      // retries cover the remaining race.
      await sleep(2000);
      fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      console.log(`[smoke] --clean: removed ${runDir}`);
    } else {
      // Keep the server running for the human pass; detach cleanly.
      console.log(`  Stop later:  kill ${devChild.pid}`);
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
