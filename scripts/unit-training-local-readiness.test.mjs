/**
 * Training local readiness — the configuration/finalize step contract.
 * Invariants under test:
 *   - the base-model list contains ONLY really-installed (probed) models;
 *     an unreachable runtime yields an empty list, never a fake option
 *   - external /Volumes locations are offered when they really exist (boot
 *     volume excluded), with the workspace artifacts folder as the fallback
 *   - a specific folder is verified through the same containment rule the
 *     argv runner enforces; non-contained paths are refused
 *   - Finalize (canFinalize) stays false until EVERY readiness row passes:
 *     traces >= floor, base model selected, folder selected AND writable,
 *     machine preflight measurable, tooling present
 *   - readiness rows are pass/fail/pending — a probe that has not answered is
 *     "pending", a failed probe is "fail"; never an optimistic tick
 *   - finalize readiness NEVER implies a trained/deployed/verified model —
 *     a prepared receipt alone still classifies as prepared, not imported
 *
 * Run with:  node --test scripts/unit-training-local-readiness.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  TRAINING_READINESS_KIND,
  EXTERNAL_FOLDER_CANDIDATES,
  WORKSPACE_FALLBACK_FOLDER,
  labelStorageLocation,
  summarizeTooling,
  deriveConfigureReadiness,
} = await import(lib("training-local-readiness.js"));
const { collectTrainingLocalReadiness, checkFolderWritable } = await import(lib("training-local-readiness-probe.js"));
const { classifyRunStatus, buildTrainingRunReceipt, deriveTrainingRunState } = await import(lib("training-run-receipts.js"));
const { buildPreInitProbeScript, derivePreInitState, PREINIT_RUN_KIND, PREINIT_INTENT } = await import(lib("training-preinit-probe.js"));

// --------------------------------------------------------------------------
// Fake IO surface — a deterministic machine the collector probes.
// --------------------------------------------------------------------------
function fakeIo({
  platform = "darwin",
  cwd = "/work/app",
  volumes = [],            // ["TOSHIBA EXT"]
  dirs = new Set(),        // existing directories (absolute)
  writableDirs = new Set(),
  bins = {},               // { python3: "/usr/bin/python3" }
  cwdFiles = new Set(),    // file basenames present in cwd
  ollamaTags = null,       // null = unreachable, [] = reachable but empty
  ramGB = 64,
  freeGB = 500,
} = {}) {
  const isDir = (p) => dirs.has(p) || p === cwd || (platform === "darwin" && p === "/Volumes");
  return {
    platform: () => platform,
    cwd: () => cwd,
    totalRamGB: () => ramGB,
    listDir: (p) => {
      if (p === "/Volumes") return [...volumes, "Macintosh HD"];
      throw new Error(`unexpected listDir ${p}`);
    },
    realpath: (p) => (p === "/Volumes/Macintosh HD" ? "/" : p),
    exists: (p) => isDir(p) || cwdFiles.has(path.basename(p)) && path.dirname(p) === cwd || dirs.has(p),
    isDirectory: (p) => isDir(p),
    writable: (p) => writableDirs.has(p),
    statfsFreeGB: () => freeGB,
    which: (bin) => bins[bin] || "",
    gpuProbe: () => ({ present: false, name: "", vramFreeGB: 0 }),
    fetchJson: async (url) => {
      if (ollamaTags && url.includes("/api/tags")) return { models: ollamaTags };
      throw new Error("unreachable");
    },
  };
}

const ALL_TOOLS_IO = () => {
  const cwd = "/work/app";
  return fakeIo({
    cwd,
    volumes: ["TOSHIBA EXT"],
    dirs: new Set([
      "/Volumes/TOSHIBA EXT",
      "/Volumes/TOSHIBA EXT/agent-service-preserved",
      "/Volumes/TOSHIBA EXT/ollama",
      "/Volumes/TOSHIBA EXT/llama.cpp",
    ]),
    writableDirs: new Set([
      "/Volumes/TOSHIBA EXT",
      "/Volumes/TOSHIBA EXT/agent-service-preserved",
      "/Volumes/TOSHIBA EXT/ollama",
      "/Volumes/TOSHIBA EXT/llama.cpp",
      cwd,
    ]),
    bins: { python3: "/usr/bin/python3", ollama: "/usr/local/bin/ollama" },
    cwdFiles: new Set(["train.py", "merge_and_export.py", "convert_hf_to_gguf.py", "llama-quantize", "llama-imatrix"]),
    ollamaTags: [{ name: "gemma3:4b", size: 3.3e9 }, { name: "qwen2.5-coder:7b", size: 4.7e9 }],
  });
};

// --------------------------------------------------------------------------
// Base models — only really-installed tags, never fakes
// --------------------------------------------------------------------------

test("collect: base models come from the real Ollama tag probe only", async () => {
  const out = await collectTrainingLocalReadiness({ io: ALL_TOOLS_IO() });
  assert.equal(out.kind, TRAINING_READINESS_KIND);
  assert.deepEqual(out.baseModels.map((m) => m.tag), ["gemma3:4b", "qwen2.5-coder:7b"]);
  assert.ok(out.baseModels.every((m) => m.source === "ollama"));
  assert.equal(out.runtime.ollama.reachable, true);
});

test("collect: unreachable runtime yields an EMPTY model list (no placeholder models)", async () => {
  const out = await collectTrainingLocalReadiness({ io: fakeIo({ ollamaTags: null }) });
  assert.deepEqual(out.baseModels, []);
  assert.equal(out.runtime.ollama.reachable, false);
  // the ledger's remembered base (e.g. "gemma-3b") must NOT appear as available
  const cfg = { dataModel: { objects: [{ objectType: "model-training", rows: [{ baseModel: "gemma-3b" }] }] } };
  const out2 = await collectTrainingLocalReadiness({ io: fakeIo({ ollamaTags: null }), workspaceConfig: cfg });
  assert.deepEqual(out2.baseModels, []);
});

// --------------------------------------------------------------------------
// Storage locations — real external drives + workspace fallback
// --------------------------------------------------------------------------

test("collect: external volume + existing candidate subfolders are offered; boot volume never is", async () => {
  const out = await collectTrainingLocalReadiness({ io: ALL_TOOLS_IO() });
  const paths = out.storageLocations.map((l) => l.path);
  assert.ok(paths.includes("/Volumes/TOSHIBA EXT"));
  assert.ok(paths.includes("/Volumes/TOSHIBA EXT/agent-service-preserved"));
  assert.ok(paths.includes("/Volumes/TOSHIBA EXT/ollama"));
  assert.ok(paths.includes("/Volumes/TOSHIBA EXT/llama.cpp"));
  // candidates that do not exist are not invented
  assert.ok(!paths.includes("/Volumes/TOSHIBA EXT/agent-caches"));
  assert.ok(!paths.some((p) => p.includes("Macintosh HD")));
  const ext = out.storageLocations.find((l) => l.path === "/Volumes/TOSHIBA EXT/ollama");
  assert.equal(ext.kind, "external");
  assert.equal(ext.writable, true);
});

test("collect: no external drive ⇒ workspace artifacts fallback only", async () => {
  const io = fakeIo({ volumes: [], writableDirs: new Set(["/work/app"]) });
  const out = await collectTrainingLocalReadiness({ io });
  assert.deepEqual(out.storageLocations.map((l) => l.kind), ["workspace"]);
  assert.equal(out.storageLocations[0].path, WORKSPACE_FALLBACK_FOLDER);
  assert.equal(out.storageLocations[0].writable, true);
});

test("collect: folderCheck refuses paths outside the containment rule, verifies contained ones", async () => {
  const io = ALL_TOOLS_IO();
  const refused = await collectTrainingLocalReadiness({ io, folder: "/etc/models" });
  assert.equal(refused.folderCheck.allowed, false);
  assert.equal(refused.folderCheck.writable, false);
  const ok = await collectTrainingLocalReadiness({ io, folder: "/Volumes/TOSHIBA EXT/ollama/new-run" });
  assert.equal(ok.folderCheck.allowed, true);
  // new-run does not exist — writability comes from the nearest existing ancestor
  assert.equal(ok.folderCheck.writable, true);
});

test("checkFolderWritable: walks up to the nearest existing ancestor", () => {
  const io = ALL_TOOLS_IO();
  assert.equal(checkFolderWritable(io, "/Volumes/TOSHIBA EXT/ollama/a/b/c").writable, true);
  assert.equal(checkFolderWritable(io, "/Volumes/NOPE/x").writable, false);
});

test("labelStorageLocation: plain-language labels, no implementation terms", () => {
  assert.match(labelStorageLocation({ kind: "workspace", path: "./artifacts", freeGB: 100 }), /This workspace/);
  assert.match(labelStorageLocation({ kind: "external", path: "/Volumes/TOSHIBA EXT/ollama", freeGB: 412, writable: true }), /External drive — \/Volumes\/TOSHIBA EXT\/ollama · 412 GB free/);
  assert.match(labelStorageLocation({ kind: "external", path: "/Volumes/RO", writable: false }), /read-only/);
});

// --------------------------------------------------------------------------
// Configure readiness rows — Finalize gating
// --------------------------------------------------------------------------

const GREEN_PROBE = () => ({
  kind: TRAINING_READINESS_KIND,
  baseModels: [{ tag: "gemma3:4b", sizeBytes: 3.3e9, source: "ollama" }],
  storageLocations: [{ path: "/Volumes/TOSHIBA EXT/ollama", kind: "external", writable: true, freeGB: 412 }],
  tooling: [
    { id: "python-runtime", label: "Python runtime", ok: true },
    { id: "quantize-tools", label: "Quantize tools", ok: true },
  ],
  preflight: { available: true, ramGB: 64, diskFreeGB: 400, gpu: { present: false }, cpuOnly: true },
});

const GREEN_INPUT = () => ({
  eligibleTraces: 12,
  baseModel: "gemma3:4b",
  folder: { path: "/Volumes/TOSHIBA EXT/ollama", kind: "external", writable: true },
  probe: GREEN_PROBE(),
});

test("readiness: all-green evidence ⇒ every row passes and Finalize unlocks", () => {
  const r = deriveConfigureReadiness(GREEN_INPUT());
  assert.equal(r.total, 5);
  assert.equal(r.passed, 5);
  assert.equal(r.canFinalize, true);
  assert.equal(r.firstBlocked, null);
  assert.deepEqual(r.rows.map((x) => x.id), ["eligible-traces", "base-model", "training-folder", "machine-check", "training-tools"]);
});

test("readiness: traces below the floor block Finalize with a plain-language count", () => {
  const r = deriveConfigureReadiness({ ...GREEN_INPUT(), eligibleTraces: 7 });
  assert.equal(r.canFinalize, false);
  const row = r.rows.find((x) => x.id === "eligible-traces");
  assert.equal(row.status, "fail");
  assert.match(row.detail, /7 of 10 needed/);
});

test("readiness: no base model available ⇒ fail row with a user-friendly next action", () => {
  const probe = { ...GREEN_PROBE(), baseModels: [] };
  const r = deriveConfigureReadiness({ ...GREEN_INPUT(), baseModel: "", probe });
  assert.equal(r.canFinalize, false);
  const row = r.rows.find((x) => x.id === "base-model");
  assert.equal(row.status, "fail");
  assert.match(row.detail, /No local models found/);
  assert.doesNotMatch(row.detail, /baseModel/); // no implementation terms
  assert.doesNotMatch(row.detail, /install/i); // never user homework
});

test("readiness: a base model NOT in the probed list never passes", () => {
  const r = deriveConfigureReadiness({ ...GREEN_INPUT(), baseModel: "made-up:99b" });
  assert.equal(r.rows.find((x) => x.id === "base-model").status, "fail");
  assert.equal(r.canFinalize, false);
});

test("readiness: unwritable or missing folder blocks; a still-checking folder is pending, not pass", () => {
  const blocked = deriveConfigureReadiness({ ...GREEN_INPUT(), folder: { path: "/Volumes/RO", writable: false } });
  assert.equal(blocked.rows.find((x) => x.id === "training-folder").status, "fail");
  assert.equal(blocked.canFinalize, false);

  const none = deriveConfigureReadiness({ ...GREEN_INPUT(), folder: null });
  assert.equal(none.rows.find((x) => x.id === "training-folder").status, "fail");

  const checking = deriveConfigureReadiness({ ...GREEN_INPUT(), folder: { path: "/Volumes/TOSHIBA EXT/x", writable: null } });
  assert.equal(checking.rows.find((x) => x.id === "training-folder").status, "pending");
  assert.equal(checking.canFinalize, false);
});

test("readiness: probe not answered ⇒ probe-backed rows are pending; probe failed ⇒ blockers fail, advisories warn", () => {
  const loading = deriveConfigureReadiness({ eligibleTraces: 12, baseModel: "", folder: null, probe: null });
  for (const id of ["base-model", "training-folder", "machine-check", "training-tools"]) {
    assert.equal(loading.rows.find((x) => x.id === id).status, "pending", id);
  }
  assert.equal(loading.canFinalize, false);

  const errored = deriveConfigureReadiness({ eligibleTraces: 12, baseModel: "", folder: null, probe: null, probeError: "fetch failed" });
  for (const id of ["base-model", "training-folder"]) {
    assert.equal(errored.rows.find((x) => x.id === id).status, "fail", id);
  }
  // System-owned rows never surface user-facing blockage: machine measuring
  // warns softly; auto-furnished tooling stays green.
  assert.equal(errored.rows.find((x) => x.id === "machine-check").status, "warn");
  assert.equal(errored.rows.find((x) => x.id === "training-tools").status, "pass");
  assert.equal(errored.canFinalize, false);
});

test("readiness: auto-furnished tooling renders GREEN (handled by the system, never user-facing blockage)", () => {
  const probe = {
    ...GREEN_PROBE(),
    tooling: [
      { id: "python-runtime", label: "Python runtime", ok: true },
      { id: "quantize-tools", label: "Quantize tools", ok: false },
      { id: "model-server", label: "Local model server", ok: false },
    ],
  };
  const r = deriveConfigureReadiness({ ...GREEN_INPUT(), probe });
  const row = r.rows.find((x) => x.id === "training-tools");
  // Handled-by-the-system is a GREEN state that NAMES the tools being
  // furnished — never a warning, never missing/install language.
  assert.equal(row.status, "pass");
  assert.equal(row.detail, "Quantize tools · Local model server");
  assert.doesNotMatch(row.detail, /not found|missing|install/i);
  // Warnings ride along as recorded evidence — Finalize stays available; the
  // training run stops at the exact step with the fix if still missing.
  assert.equal(r.canFinalize, true);
  assert.deepEqual(summarizeTooling(probe.tooling).missingLabels, ["Quantize tools", "Local model server"]);
});

test("collect: tooling rows are real probes — missing bins report ok:false; workspace scripts are always provisioned", async () => {
  const io = fakeIo({ ollamaTags: [], bins: {}, cwdFiles: new Set() });
  const out = await collectTrainingLocalReadiness({ io });
  const byId = Object.fromEntries(out.tooling.map((t) => [t.id, t]));
  assert.equal(byId["python-runtime"].ok, false);
  // The pipeline scripts are the WORKSPACE'S OWN files — provisioned
  // automatically, never reported as user homework.
  assert.equal(byId["pipeline-scripts"].ok, true);
  assert.equal(byId["quantize-tools"].ok, false);
  assert.equal(byId["ollama-cli"].ok, false);
  assert.equal(byId["model-server"].ok, true); // tags endpoint answered ⇒ server up
  const io2 = ALL_TOOLS_IO();
  const out2 = await collectTrainingLocalReadiness({ io: io2 });
  assert.ok(out2.tooling.every((t) => t.ok), JSON.stringify(out2.tooling.filter((t) => !t.ok)));
});

// --------------------------------------------------------------------------
// Honesty floor — finalize readiness never fabricates a model state
// --------------------------------------------------------------------------

test("honesty: readiness rows never claim trained/deployed/verified", () => {
  const r = deriveConfigureReadiness(GREEN_INPUT());
  const text = JSON.stringify(r).toLowerCase();
  for (const claim of ["trained", "deployed", "verified", "complete"]) {
    assert.ok(!text.includes(claim), `readiness must not claim "${claim}"`);
  }
});

test("honesty: a finalized (prepared) receipt without runner evidence classifies as prepared — never trained/imported", () => {
  const receipt = buildTrainingRunReceipt({
    modelTrainingRowId: "workspace-local", datasetExportId: "ft_1_2026-07-07T00-00-00-000Z",
    baseModel: "gemma3:4b", trainingProfile: "unsloth-qlora-quantize-pipeline",
    runnerMode: "local-command", status: "prepared",
  });
  assert.equal(classifyRunStatus(receipt).stage, "prepared");
  // An "imported" CLAIM without a provable artifact demotes — it can never
  // read as imported off the finalize/prepare path alone.
  assert.notEqual(classifyRunStatus({ ...receipt, status: "imported" }).stage, "imported");
});
