#!/usr/bin/env node
/**
 * Self-contained clean custom-model QA workspace exporter.
 *
 * This intentionally does not import scripts/export-seed-workspace.mjs or the
 * legacy feature seed. It exports the worker kit, then writes a clean Data
 * Model for future custom-model training QA:
 *
 * - 12 eligible governed reasoning traces
 * - 1 eligible model-training ledger row
 * - 0 pre-created training runs
 * - 0 runner receipts
 * - 0 source records
 * - no probe scheduler/API/sandbox seed content
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PORT = 3777;
const KIT_ID = "growthub-custom-workspace-starter-v1";
const SEED_TIMESTAMP = "2026-07-07T00:00:00.000Z";
const FORBIDDEN = /probe-scheduler|api-registry-probe|sandbox-probe|probe-local-sbx|probe-untrusted|registry-workflow|baseline sandbox|cockpit spine/i;

const traceColumns = ["Name", "sessionDate", "inputPrompt", "agentOutput", "qualityScore", "reason", "redactionStatus", "provenance", "exported"];
const modelColumns = [
  "Name", "status", "baseModel", "localModel", "modelVersion", "apiRegistryId", "deployedEndpoint",
  "lastSandboxObjectId", "lastSandboxRunId", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description",
];

const traceBlueprints = [
  ["patch-preflight", "Use PATCH preflight before mutating workspace config.", "Confirmed the mutation belongs to the governed dataModel lane and must pass preflight before PATCH."],
  ["data-model-readback", "Read the Data Model and identify custom-model training rows.", "Verified training-traces owns the trace corpus and model-training owns model version state."],
  ["helper-custom-models", "Open the helper custom-model path.", "Confirmed /custom-models is the visible command for the model path."],
  ["trace-curation", "Curate governed reasoning traces into a fine-tuning dataset.", "Selected high-quality rows with prompt, response, provenance, redaction status, and score metadata."],
  ["dataset-export", "Export curated traces to a JSONL dataset receipt.", "Prepared dataset-ready lineage for the runtime to attach to the model-training ledger."],
  ["training-run-receipt", "Create a run receipt only when one-click training is invoked.", "Kept the seed clean with no pre-created run receipt before the user trigger."],
  ["runner-preflight", "Run RAM, GPU, disk, and toolchain preflight.", "Defined the first runner stamp before distill, fine-tune, convert, quantize, and serve."],
  ["runner-reconciliation", "Reconcile sandbox runner response into training state.", "Mapped runner progress and final artifacts back into the Data Model without fabricating deployment."],
  ["artifact-proof", "Require artifact proof before trained or verified state.", "Defined artifact path, checksum, endpoint registry row, and invocation receipt as proof."],
  ["endpoint-verification", "Verify the localized Ollama endpoint responds as the tuned model.", "Required endpoint authority and model tag agreement before verification."],
  ["workflow-smoke", "Run the trained model through workflow smoke.", "Bound invocation receipts back to workflow proof."],
  ["qa-retrospective", "Record QA customer reality without hiding blockers.", "Seed proves readiness only; real training and invocation must come from the button path."],
];

function usage() {
  console.log([
    "Usage:",
    "  node scripts/export-seed-workspace-custom-model-qa.mjs [--no-dev] [--keep|--clean] [--dry-run]",
    "",
    "Exports a separate clean custom-model QA workspace under",
    "  ${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/custom-model-qa-<ts>/",
  ].join("\n"));
}

function parseArgs(argv) {
  const out = { keep: true, dryRun: false, bootDev: true };
  for (const arg of argv.slice(2)) {
    if (arg === "--no-dev") out.bootDev = false;
    else if (arg === "--keep") out.keep = true;
    else if (arg === "--clean") out.keep = false;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function containsForbidden(value) {
  return FORBIDDEN.test(JSON.stringify(value));
}

function isInside(parentDir, childDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childDir));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stripProbeSeedObjects(objects = []) {
  return objects
    .filter((object) => !containsForbidden({
      id: object?.id,
      label: object?.label,
      source: object?.source,
      objectType: object?.objectType,
    }))
    .map((object) => {
      const next = clone(object);
      if (Array.isArray(next.rows)) next.rows = next.rows.filter((row) => !containsForbidden(row));
      return next;
    })
    .filter((object) => !containsForbidden(object));
}

function buildTrainingTracesObject() {
  return {
    id: "training-traces",
    label: "Training Traces",
    source: "Training Traces",
    objectType: "training-traces",
    icon: "Terminal",
    columns: traceColumns,
    rows: traceBlueprints.map(([slug, inputPrompt, agentOutput], index) => ({
      Name: `qa-reasoning-trace-${String(index + 1).padStart(2, "0")}`,
      sessionDate: SEED_TIMESTAMP,
      inputPrompt,
      agentOutput,
      qualityScore: "5",
      reason: `governed-custom-model-qa:${slug}`,
      redactionStatus: "clear",
      provenance: "clean-custom-model-qa-export",
      exported: "",
    })),
    binding: { mode: "manual", source: "Training Traces" },
    relations: [],
    fieldSettings: { hidden: [], order: traceColumns },
  };
}

function buildModelTrainingObject() {
  return {
    id: "model-training",
    label: "Model Training",
    source: "Model Training",
    objectType: "model-training",
    icon: "Terminal",
    columns: modelColumns,
    rows: [{
      Name: "workspace-local",
      status: "eligible",
      baseModel: "gemma3",
      localModel: "",
      modelVersion: "",
      apiRegistryId: "",
      deployedEndpoint: "",
      lastSandboxObjectId: "",
      lastSandboxRunId: "",
      lastExportAt: "",
      lastExportId: "",
      lastSourceId: "",
      lastExportSummary: JSON.stringify({
        traceObjectId: "training-traces",
        eligibleTraces: traceBlueprints.length,
        minimumTraces: 10,
        target: "Ollama (local)",
        note: "Clean seed only. One-click training must create the first run receipt.",
      }),
      description: "Clean custom-model QA seed. No trained model, run receipt, endpoint proof, or deployed status is pre-attested.",
    }],
    binding: { mode: "manual", source: "Model Training" },
    relations: [],
    fieldSettings: { hidden: [], order: modelColumns },
  };
}

function buildCleanSeed(baseConfig = {}) {
  const workspaceConfig = clone(baseConfig);
  workspaceConfig.dataModel = workspaceConfig.dataModel || {};
  const retainedObjects = stripProbeSeedObjects(workspaceConfig.dataModel.objects || [])
    .filter((object) => ![
      "training-traces",
      "model-training",
      "model-training-run",
      "model-training-runner",
      "custom-model-registry",
    ].includes(object?.id));

  workspaceConfig.dataModel.objects = [
    ...retainedObjects,
    buildTrainingTracesObject(),
    buildModelTrainingObject(),
  ];

  return {
    workspaceConfig,
    sourceRecords: {},
    envLocal: "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true\nNEXT_PUBLIC_GROWTHUB_LOCAL_SEED=custom-model-qa-clean\n",
  };
}

function validateSeed(appDir, workspaceConfig, sourceRecords) {
  assert(fs.existsSync(path.join(appDir, "lib", "training-ledger.js")), "exported training ledger module missing");
  assert(!containsForbidden(workspaceConfig), "clean seed still contains legacy probe scheduler/API/sandbox content");
  assert(!containsForbidden(sourceRecords), "source records still contain legacy probe content");

  const objects = workspaceConfig?.dataModel?.objects || [];
  const traces = objects.find((object) => object?.id === "training-traces");
  const training = objects.find((object) => object?.id === "model-training");
  const runs = objects.find((object) => object?.id === "model-training-run");
  const runners = objects.find((object) => object?.id === "model-training-runner");
  const apiRegistry = objects.find((object) => object?.id === "api-registry" || object?.objectType === "api-registry");
  const customModelRows = (apiRegistry?.rows || []).filter((row) => row?.kind === "custom-model" || row?.connectorKind === "custom-model");

  assert(traces?.rows?.length === 12, `training-traces must include exactly 12 rows (saw ${traces?.rows?.length || 0})`);
  assert(traces.rows.every((row) => Number(row.qualityScore) >= 4), "all seeded traces must be eligible quality");
  assert(training?.rows?.length === 1, "model-training must start with one clean ledger row");
  assert(training.rows[0].status === "eligible", "model-training row must start eligible");
  assert(!training.rows[0].apiRegistryId, "model-training row must not pre-bind API Registry");
  assert(!training.rows[0].lastSandboxRunId, "model-training row must not pre-bind run receipt");
  assert(!runs?.rows?.length, "clean seed must not pre-create model-training-run rows");
  assert(!runners?.rows?.length, "clean seed must not pre-create model-training-runner rows");
  assert(customModelRows.length === 0, "clean seed must not pre-create custom model API Registry rows");
  assert(Object.keys(sourceRecords || {}).length === 0, "clean seed must not pre-create source records");

  return {
    traceRows: traces.rows.length,
    eligibleRows: traces.rows.filter((row) => Number(row.qualityScore) >= 4).length,
    runRows: runs?.rows?.length || 0,
    runnerRows: runners?.rows?.length || 0,
    sourceRecordKeys: Object.keys(sourceRecords || {}).length,
  };
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function main() {
  const { keep, dryRun, bootDev } = parseArgs(process.argv);
  const exportsHome = process.env.GROWTHUB_KIT_EXPORTS_HOME?.trim()
    || path.join(process.env.HOME || "/tmp", "growthub-worker-kit-exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(exportsHome, `custom-model-qa-${stamp}`);

  assert(!isInside(repoRoot, runDir), `refusing to run inside repo: ${runDir}`);
  assert(!isInside(path.join(repoRoot, "instances"), runDir), "refusing to run inside instances/");

  const kitRoot = path.join(repoRoot, "cli", "assets", "worker-kits", KIT_ID);
  const kitJson = readJson(path.join(kitRoot, "kit.json"));
  const bundleManifest = readJson(path.join(kitRoot, kitJson.bundles[0].path));
  const exportedKit = path.join(runDir, bundleManifest.export.folderName);
  const appDir = path.join(exportedKit, "apps", "workspace");

  if (dryRun) {
    console.log("[custom-model-qa] DRY RUN");
    console.log(`  1. export ${KIT_ID} -> ${runDir}`);
    console.log("  2. write clean custom-model Data Model seed");
    console.log("  3. validate 12 traces, 0 runs, 0 source records, no probe seed");
    console.log(`  4. ${bootDev ? "npm install + next dev --webpack" : "skip dev (--no-dev)"}`);
    return;
  }

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

  try {
    fs.mkdirSync(runDir, { recursive: true });
    console.log(`[custom-model-qa] exporting ${KIT_ID} -> ${runDir}`);
    const exp = spawnSync(process.execPath, [path.join(repoRoot, "scripts/export-worker-kit.mjs"), KIT_ID, "--out", runDir, "--qa"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (exp.status !== 0) {
      console.error(exp.stdout || "");
      console.error(exp.stderr || "");
      throw new Error("export-worker-kit.mjs failed");
    }

    const seed = buildCleanSeed(readJson(path.join(appDir, "growthub.config.json")));
    fs.writeFileSync(path.join(appDir, "growthub.config.json"), `${JSON.stringify(seed.workspaceConfig, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(appDir, "growthub.source-records.json"), `${JSON.stringify(seed.sourceRecords, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(appDir, ".env.local"), seed.envLocal, "utf8");

    const validation = validateSeed(appDir, seed.workspaceConfig, seed.sourceRecords);
    console.log(`[custom-model-qa] validation OK - traces ${validation.eligibleRows}/${validation.traceRows}, run rows ${validation.runRows}, runner rows ${validation.runnerRows}, source records ${validation.sourceRecordKeys}`);

    if (!bootDev) {
      console.log("");
      console.log("[custom-model-qa] Ready (no dev server).");
      console.log(`  Export: ${exportedKit}`);
      console.log(`  App:    ${appDir}`);
      console.log("  State:  clean custom-model QA seed; no probe scheduler/API/sandbox seed; no pre-created training run");
      if (!keep) {
        fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        console.log(`[custom-model-qa] --clean removed ${runDir}`);
      }
      return;
    }

    const logPath = path.join(runDir, "dev-server.log");
    const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: appDir,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    });
    fs.writeFileSync(logPath, `${install.stdout || ""}\n${install.stderr || ""}\n`);
    assert(install.status === 0, `npm install failed - see ${logPath}`);

    const port = await probeFreePort(BASE_PORT);
    devPort = port;
    const base = `http://127.0.0.1:${port}`;
    const logFd = fs.openSync(logPath, "a");
    devChild = spawn("npx", ["next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: appDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port) },
    });
    fs.closeSync(logFd);
    await waitForHttpReady(`${base}/api/workspace`);

    console.log("");
    console.log("[custom-model-qa] Ready for custom-model QA.");
    console.log(`  Export:  ${exportedKit}`);
    console.log(`  App:     ${appDir}`);
    console.log(`  App URL: ${base}`);
    console.log(`  Log:     ${logPath}`);
    console.log(`  Stop:    kill ${devChild.pid}`);

    if (!keep) {
      killDev();
      await sleep(2000);
      fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      console.log(`[custom-model-qa] --clean removed ${runDir}`);
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
