#!/usr/bin/env node
/**
 * Governed Compute Realization — LIVE Runpod provider proof.
 *
 * Executes the governed production transport and the registered Runpod
 * adapter against the REAL Runpod control plane, observing an operator-
 * deployed pod. This is the live counterpart of the faked-transport
 * conformance suite (`unit-compute-runpod.test.mjs`) and fills the
 * "Live Runpod pod allocation" Unexecuted cell in
 * docs/proofs/governed-compute-realization/PROOF-INDEX.md.
 *
 * Honesty rules baked in:
 *   - Observation-only by default: the harness NEVER creates a pod. It
 *     adopts the operator's test pod by id and proves the pod set is
 *     byte-identical before/after (zero paid creates).
 *   - `--release` is an explicit opt-in and performs the adapter's governed
 *     STOP (cancel → POST /pods/{id}/stop) — REVERSIBLE: the volume is kept
 *     and the pod can be restarted from the Runpod console. The harness
 *     never calls the destructive pods-mode terminate (DELETE); terminating
 *     the operator's test pod is an operator decision.
 *   - The credential travels only as an env NAME (RUNPOD_API_KEY); banked
 *     evidence is asserted to be secret-free before it is written.
 *   - All live traffic goes through the SAME governed outbound transport
 *     production uses (DNS-pinned, redirect-refusing, response-bounded) via
 *     the registered adapter wrapper — a direct-egress network is required;
 *     the transport does not (and must not) ride an HTTP CONNECT proxy.
 *
 * Run (live):
 *   RUNPOD_API_KEY=... RUNPOD_LIVE_POD_ID=<pod id> \
 *     node scripts/e2e-compute-runpod-live-proof.mjs --write-evidence [--release]
 *
 * Run (offline self-test of the harness logic, evidence goes to a temp dir
 * and is labeled MOCK — never bank it):
 *   node scripts/e2e-compute-runpod-live-proof.mjs --mock
 *
 * Screenshots (offline, after a live run banked evidence):
 *   node scripts/e2e-compute-runpod-live-proof.mjs --screens
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const MODE_MOCK = process.argv.includes("--mock");
const MODE_SCREENS = process.argv.includes("--screens");
const WRITE_EVIDENCE = process.argv.includes("--write-evidence");
const DO_RELEASE = process.argv.includes("--release");

const proofDir = path.join(repoRoot, "docs/proofs/governed-compute-realization/live-runpod");
// Only a live run with --write-evidence banks into docs/proofs; everything
// else (mock self-test, live dry runs) writes to a discarded temp dir.
const evidenceDir = MODE_MOCK || !WRITE_EVIDENCE
  ? fs.mkdtempSync(path.join(os.tmpdir(), "runpod-live-scratch-"))
  : proofDir;

const { default: runpodAdapter, RUNPOD_ADAPTER_ID, RUNPOD_REST_BASE } = await import(lib("adapters/compute/runpod-compute.js"));
const { getComputeProviderAdapter } = await import(lib("adapters/compute/index.js"));
const { createGovernedComputeFetchJson, COMPUTE_NETWORK_ALLOWLIST_ENV } = await import(lib("compute-network-policy.js"));
const { normalizeComputeBlock } = await import(lib("compute-evidence.js"));

let pass = 0;
const ok = (label, condition) => { assert.ok(condition, label); pass += 1; console.log(`  ✓ ${label}`); };
const banked = [];
const bank = (name, payload) => {
  const body = JSON.stringify(payload, null, 2);
  const key = process.env.RUNPOD_API_KEY || "";
  if (key) assert.equal(body.includes(key), false, `${name}: banked evidence must be secret-free`);
  assert.equal(/Authorization/i.test(body), false, `${name}: banked evidence must not carry auth headers`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, `${name}.json`), `${body}\n`);
  banked.push(name);
  console.log(`  banked: ${name}.json`);
};

// ---------------------------------------------------------------------------
// --screens: offline visualization of BANKED live evidence (golden PNGs)
// ---------------------------------------------------------------------------
if (MODE_SCREENS) {
  const summaryPath = path.join(proofDir, "live-00-summary.json");
  assert.ok(fs.existsSync(summaryPath), "run the live phase with --write-evidence first — no banked summary found");
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.equal(summary.mode, "live", "screens render LIVE evidence only — refuse mock summaries");
  const { spawn } = await import("node:child_process");
  const { chromium } = await import(pathToFileURL(path.join(kitApp, "node_modules/playwright-core/index.mjs")).href)
    .catch(async () => import("playwright-core"));
  const browserCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/opt/pw-browsers/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    chromium.executablePath(),
  ].filter(Boolean);
  const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(browserExecutable, "no Chromium/Chrome executable found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "runpod-live-screens-"));
  const app = path.join(tmp, "workspace");
  fs.cpSync(kitApp, app, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.next`) });
  if (fs.existsSync(path.join(kitApp, "node_modules"))) fs.symlinkSync(path.join(kitApp, "node_modules"), path.join(app, "node_modules"), "dir");

  const cfgFile = path.join(app, "growthub.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
  const objects = Array.isArray(cfg.dataModel?.objects) ? cfg.dataModel.objects : [];
  const runId = "runpod-live-observation";
  objects.push({
    id: "model-training-run",
    objectType: "model-training-run",
    label: "Training runs",
    columns: [],
    rows: [{
      trainingRunId: runId,
      modelTrainingRowId: "workspace-local",
      status: summary.stopped ? "failed" : "running",
      blockedReason: "",
      compute: JSON.stringify(summary.computeBlock),
    }],
  });
  cfg.dataModel = { ...(cfg.dataModel || {}), objects };
  fs.writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(app, "growthub.source-records.json"), "{}\n");

  const port = 3000 + Math.floor(Math.random() * 2000);
  const base = `http://127.0.0.1:${port}`;
  const next = spawn("npx", ["next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: app, detached: true, stdio: "ignore",
    env: { ...process.env, WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true" },
  });
  const waitHttp = async (url) => {
    for (let i = 0; i < 240; i += 1) {
      try { const r = await fetch(url); if (r.ok) return; } catch { /* boot */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`workspace did not boot at ${url}`);
  };
  try {
    await waitHttp(`${base}/api/workspace`);
    const browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--no-proxy-server", "--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    fs.mkdirSync(proofDir, { recursive: true });
    await page.goto(`${base}/data-model`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(proofDir, "01-live-workspace-data-model.png"), fullPage: false });
    console.log("  shot: 01-live-workspace-data-model.png");
    const compute = await (await fetch(`${base}/api/workspace/compute`)).json();
    fs.writeFileSync(path.join(proofDir, "live-04-compute-read-surface.json"), `${JSON.stringify(compute, null, 2)}\n`);
    await page.goto(`${base}/custom-models`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(proofDir, "02-live-custom-models-cockpit.png"), fullPage: false });
    console.log("  shot: 02-live-custom-models-cockpit.png");
    await browser.close();
    console.log("\n✅ live evidence screenshots captured into docs/proofs/governed-compute-realization/live-runpod/");
  } finally {
    try { process.kill(-next.pid, "SIGKILL"); } catch { /* already gone */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Live (or mock self-test) provider proof
// ---------------------------------------------------------------------------
const KEY_ENV = "RUNPOD_API_KEY";
const podId = String(process.env.RUNPOD_LIVE_POD_ID || (MODE_MOCK ? "pod-mock-1" : "")).trim();
if (!MODE_MOCK) {
  assert.ok(String(process.env[KEY_ENV] || "").trim(), `${KEY_ENV} is required for the live proof (env NAME only — never bank the value)`);
  assert.ok(podId, "RUNPOD_LIVE_POD_ID is required — the harness adopts the operator's deployed test pod and never creates one");
  process.env[COMPUTE_NETWORK_ALLOWLIST_ENV] = process.env[COMPUTE_NETWORK_ALLOWLIST_ENV]
    || "rest.runpod.io,api.runpod.io,api.runpod.ai";
}

// Mock transport mirrors the REAL API shapes pinned by the conformance suite,
// so the harness logic is provable offline. Live mode never touches it.
let mockCreates = 0;
const mockPods = [{ id: podId, name: "growthub-live-test", desiredStatus: "RUNNING", lastStatusChange: "t1", costPerHr: 0.34, machine: { gpuType: { id: "NVIDIA GeForce RTX 4090" } } }];
const mockFetch = async (url, init = {}) => {
  const s = String(url);
  const method = init.method || "GET";
  if (method === "POST" && s.endsWith("/pods")) { mockCreates += 1; throw new Error("mock refuses pod creation — observation-only harness"); }
  if (s.includes("graphql")) return { data: { gpuTypes: [{ id: "NVIDIA GeForce RTX 4090", displayName: "RTX 4090", memoryInGb: 24, lowestPrice: { uninterruptablePrice: 0.34, minimumBidPrice: 0.2, stockStatus: "High" } }] } };
  if (s.endsWith("/pods")) return mockPods;
  if (s.includes(`/pods/${podId}/stop`)) { mockPods[0].desiredStatus = "EXITED"; return { id: podId }; }
  if (s.includes(`/pods/${podId}`)) return mockPods[0];
  return {};
};

const governedFetch = MODE_MOCK ? mockFetch : createGovernedComputeFetchJson();
const adapter = MODE_MOCK ? runpodAdapter : (getComputeProviderAdapter(RUNPOD_ADAPTER_ID) || runpodAdapter);
const authHeader = () => ({ Authorization: `Bearer ${process.env[KEY_ENV]}` });
const listPods = async () => {
  const reply = MODE_MOCK ? await mockFetch(`${RUNPOD_REST_BASE}/pods`) : await governedFetch(`${RUNPOD_REST_BASE}/pods`, { headers: authHeader() });
  return Array.isArray(reply) ? reply : Array.isArray(reply?.pods) ? reply.pods : [];
};
const redactPod = (pod) => ({
  id: String(pod?.id || ""),
  name: String(pod?.name || ""),
  desiredStatus: String(pod?.desiredStatus || ""),
  costPerHr: Number(pod?.costPerHr) || 0,
  gpuType: String(pod?.machine?.gpuType?.id || pod?.machine?.gpuTypeId || ""),
});

console.log(`— LIVE Runpod provider proof (${MODE_MOCK ? "MOCK self-test" : "live"}) —`);

// LIVE-1 — the governed production transport reaches the real control plane.
const podsBefore = await listPods();
const target = podsBefore.find((pod) => String(pod?.id) === podId);
ok("LIVE-1: governed transport lists the operator's pods and finds the deployed test pod", Boolean(target));
bank("live-01-pod-inventory", { mode: MODE_MOCK ? "mock" : "live", observedAt: new Date().toISOString(), podCount: podsBefore.length, target: redactPod(target) });

// Shared adapter ctx: env NAME resolution only, real requirements shape.
const requirements = { workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1, minVramPerGpuGB: 16, minCpuCores: 4, minRamGB: 16, minDiskGB: 40, checkpointRequired: false, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 10 };
const ctx = {
  providerConfig: { providerId: "runpod-live", mode: "pods" },
  requirements,
  capacityProfileId: "single-gpu-finetune",
  trainingRunId: "runpod-live-observation",
  idempotencyKeyHash: "0".repeat(64),
  runRef: { trainingRunId: "runpod-live-observation", modelTrainingRowId: "workspace-local", providerId: "runpod-live", capacityProfileId: "single-gpu-finetune", providerResourceId: podId },
  resolveEnv: (name) => (name === KEY_ENV ? (MODE_MOCK ? "mock-credential-value" : String(process.env[KEY_ENV] || "")) : ""),
  envPresent: (name) => name === KEY_ENV && (MODE_MOCK || Boolean(process.env[KEY_ENV])),
  ...(MODE_MOCK ? { fetchJson: mockFetch } : {}),
};

// LIVE-2 — a real quote: GraphQL price/stock through the governed transport.
const quote = await adapter.inspectCapacity(ctx);
ok("LIVE-2: real capacity quote returns per-hour pricing evidence", quote && quote.costBasis?.kind === "per-hour" && Number(quote.costBasis.unitUsd) > 0);
bank("live-02-capacity-quote", { mode: MODE_MOCK ? "mock" : "live", quote });

// LIVE-3 — honest capabilities (no volume config → no checkpoint claims).
const capabilities = adapter.describeCapabilities({ providerId: "runpod-live" });
ok("LIVE-3: capabilities stay honest without a network volume", capabilities.supportsCheckpointing === false && capabilities.maxWorkers === 1);
bank("live-03-capabilities", { mode: MODE_MOCK ? "mock" : "live", capabilities });

// LIVE-4 — adoption without creation: observe the EXISTING pod's lifecycle.
const statusEvents = await adapter.status(ctx);
const observed = statusEvents.map((event) => ({ type: event.type, providerEventId: event.providerEventId, detail: event.detail }));
ok("LIVE-4: the deployed pod maps to a normalized lifecycle event", observed.length > 0 && ["compute-running", "compute-completed", "compute-released"].includes(observed[0].type));

// LIVE-5 — zero paid creates: the pod id set is unchanged by this proof.
// --release performs the adapter's REVERSIBLE governed stop (cancel →
// POST /pods/{id}/stop). It deliberately does NOT call adapter.release(),
// which for pods is a destructive terminate (DELETE) — terminating the
// operator's test pod is an operator decision, not a harness default.
let stopEvents = [];
if (DO_RELEASE) {
  stopEvents = await adapter.cancel(ctx);
  const after = await adapter.status(ctx);
  ok("LIVE-6: governed stop is acknowledged and re-observation shows the pod no longer running (volume persists and still bills until terminated)", stopEvents.some((event) => event.type === "compute-cancelled") && after.every((event) => event.type !== "compute-running"));
}
const podsAfter = await listPods();
const idsBefore = podsBefore.map((pod) => String(pod?.id)).sort().join(",");
const idsAfter = podsAfter.map((pod) => String(pod?.id)).sort().join(",");
ok("LIVE-5: zero pods were created — observation adopted the operator's deployment", idsBefore === idsAfter && (!MODE_MOCK || mockCreates === 0));

// Assemble the normalized compute block the workspace would journal for this
// observation — the exact shape the cockpit derives customer states from.
const computeBlock = normalizeComputeBlock({
  capacityProfileId: "single-gpu-finetune",
  providerRegistryId: "runpod-live",
  selectionMode: "explicit",
  idempotencyKeyHash: ctx.idempotencyKeyHash,
  allocation: {
    allocationId: podId,
    runRef: ctx.runRef,
    status: DO_RELEASE ? "release-pending" : "running",
    idempotencyKeyHash: ctx.idempotencyKeyHash,
    availabilityMode: "on-demand",
    costBasis: { kind: "per-hour", unitUsd: Number(target?.costPerHr) || Number(quote?.costBasis?.unitUsd) || 0, source: "runpod-live" },
    requestedAt: "", allocatedAt: new Date().toISOString(), releasedAt: "",
    // A stopped pod is NOT a confirmed release: the volume persists and
    // bills until the operator terminates it. Stay honest.
    releaseConfirmed: false, allocated: { gpuType: redactPod(target).gpuType, gpuCount: 1, workers: 1, region: "" },
  },
  events: [...statusEvents, ...stopEvents],
  checkpoints: [],
  artifact: null,
  evidenceObservedAt: new Date().toISOString(),
});
bank("live-00-summary", {
  mode: MODE_MOCK ? "mock" : "live",
  observedAt: new Date().toISOString(),
  podId,
  stopped: DO_RELEASE,
  checks: pass,
  observedEvents: observed,
  computeBlock,
});

if (!WRITE_EVIDENCE && !MODE_MOCK) console.log("\n(re-run with --write-evidence to bank the proof set)");
if (MODE_MOCK) { fs.rmSync(evidenceDir, { recursive: true, force: true }); console.log("\n(mock evidence discarded — never banked)"); }
console.log(`\n✅ Runpod ${MODE_MOCK ? "MOCK harness self-test" : "LIVE provider proof"} passed (${pass} checks).`);
