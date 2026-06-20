#!/usr/bin/env node
/**
 * Real HTTP probes for the No-Code Workflow Persistence & Scheduling feature.
 *
 * Reconstructs a governed workspace exactly as it ships — materializes a temp
 * copy of the bundled custom-workspace Next app (the same tree the CLI exports
 * under apps/workspace), runs `next dev`, stands up a local "deployed endpoint"
 * echo server (the destination a real Supabase Edge / QStash schedule would
 * invoke), then drives the full customer journey across every governed surface:
 *
 *   PATCH /api/workspace                      (cadence/provider fields, +/-)
 *   GET   /api/workspace/env-status           (persistence.canSave gate)
 *   POST  /api/workspace/scheduler/provision  (scaffold + register + confirm 200, +/-)
 *   POST  /api/workspace/scheduler/lifecycle  (pause/resume/check-drift/cancel, +/-)
 *   POST  /api/workspace/sandbox-run          (serverless delegation carries cadence)
 *   GET   /api/workspace/agent-outcomes       (governed receipt stream)
 *
 * Positive AND negative probes — production-grade acceptance, not a smoke test.
 *
 * Usage (repo root):
 *   node scripts/e2e-workspace-scheduler-api-probe.mjs
 *   PORT=3998 node scripts/e2e-workspace-scheduler-api-probe.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitWorkspace = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");

const sandboxColumns = [
  "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId",
  "scheduleCadence", "scheduleCron", "scheduleTimezone", "scheduleProvider",
  "scheduleStatus", "schedulePaused", "scheduleNextRunAt", "scheduleLastRunAt", "scheduleLastConfirmedAt",
  "runtime", "adapter", "agentHost", "envRefs", "networkAllow", "allowList", "browserAccess",
  "instructions", "command", "timeoutMs", "status", "lastTested", "lastRunId", "lastSourceId", "lastResponse",
];

function row(overrides = {}) {
  return {
    Name: "digest", lifecycleStatus: "draft", version: "1",
    runLocality: "local", schedulerRegistryId: "",
    scheduleCadence: "manual", scheduleCron: "", scheduleTimezone: "UTC", scheduleProvider: "",
    scheduleStatus: "", schedulePaused: "false", scheduleNextRunAt: "", scheduleLastRunAt: "", scheduleLastConfirmedAt: "",
    runtime: "node", adapter: "local-process", agentHost: "", envRefs: "",
    networkAllow: "false", allowList: "", browserAccess: "false",
    instructions: "", command: "echo ok", timeoutMs: "15000",
    status: "", lastTested: "", lastRunId: "", lastSourceId: "", lastResponse: "",
    ...overrides,
  };
}

function sandboxObject(rows) {
  return {
    id: "workflows-e2e", label: "Workflows", source: "Workflows",
    objectType: "sandbox-environment", icon: "Terminal",
    columns: sandboxColumns, rows, binding: { mode: "manual", source: "Data Model" },
    relations: [], fieldSettings: { hidden: [], order: sandboxColumns },
  };
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const a = s.address(); const p = typeof a === "object" && a ? a.port : 0; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttpReady(url, maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { const res = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (res.ok || res.status === 400 || res.status === 409) return; } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`Server did not become ready within ${maxMs}ms: ${url}`);
}

let passed = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); passed += 1; process.stdout.write(`  ✓ ${msg}\n`); }
const J = async (res) => { try { return await res.json(); } catch { return {}; } };

async function patchConfig(base, objects) {
  return fetch(`${base}/api/workspace`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { objects } }),
  });
}

async function main() {
  const port = process.env.PORT && String(process.env.PORT).trim() ? Number(process.env.PORT) : await pickFreePort();
  const base = `http://127.0.0.1:${port}`;
  const echoPort = await pickFreePort();

  // The "deployed endpoint" — a real HTTP destination that returns 200 for the
  // growthub-sandbox-run-v1 envelope, exactly like a deployed Edge/QStash target.
  let echoHits = 0;
  const echo = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {}; try { parsed = JSON.parse(body || "{}"); } catch { /* */ }
      echoHits += 1;
      if (parsed?.kind === "growthub-sandbox-run-v1") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, exitCode: 0, stdout: "echo endpoint accepted", durationMs: 1 }));
      } else {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "unexpected envelope" }));
      }
    });
  });
  await new Promise((r) => echo.listen(echoPort, "127.0.0.1", r));
  const echoUrl = `http://127.0.0.1:${echoPort}/scheduled`;
  process.stdout.write(`[e2e] echo "deployed endpoint" on ${echoUrl}\n`);

  const profileRoot = process.env.CLI_DEMO_HOME?.trim() ? path.resolve(process.env.CLI_DEMO_HOME.trim()) : path.join(os.tmpdir(), "growthub-cli-demo");
  const demoHome = path.join(profileRoot, "e2e-workspace-scheduler");
  fs.mkdirSync(demoHome, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(demoHome, "ws-copy-"));

  process.stdout.write(`[e2e] exporting starter workspace → ${tmp}\n`);
  fs.cpSync(kitWorkspace, tmp, { recursive: true, filter: (src) => !src.split(path.sep).includes("node_modules") });

  const cfgPath = path.join(tmp, "growthub.config.json");
  const baseCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  baseCfg.dataModel = { objects: [sandboxObject([row()])] };
  fs.writeFileSync(cfgPath, `${JSON.stringify(baseCfg, null, 2)}\n`, "utf8");

  process.stdout.write("[e2e] npm install (workspace app)…\n");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: tmp, stdio: "inherit", env: { ...process.env, CI: "1" } });
  assert(ni.status === 0, "npm install succeeded");

  process.stdout.write(`[e2e] starting next dev on :${port}…\n`);
  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: tmp, stdio: ["ignore", "pipe", "pipe"], detached: true,
    env: {
      ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port),
      // The supabase-edge authRef secret resolves in this runtime (server-side only).
      SUPABASE_EDGE: "edge-shared-secret-probe",
    },
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", (c) => process.stderr.write(c));
  dev.unref();

  let failure = null;
  try {
    await waitForHttpReady(`${base}/api/workspace`);

    process.stdout.write("\n[e2e] === Governance: cadence/provider fields via PATCH ===\n");
    // Positive: serverless workflow with a no-code cadence + provider.
    const okPatch = await patchConfig(base, [sandboxObject([row({
      Name: "digest", runLocality: "serverless", schedulerRegistryId: "digest-scheduler",
      adapter: "serverless", scheduleCadence: "daily", scheduleProvider: "supabase-edge",
    })])]);
    assert(okPatch.status === 200, `PATCH serverless+daily+provider → 200 (got ${okPatch.status})`);

    // Negative: invalid cadence rejected by the schema (governance intact).
    const badCadence = await patchConfig(base, [sandboxObject([row({ Name: "digest", runLocality: "serverless", schedulerRegistryId: "s", scheduleCadence: "hourly" })])]);
    assert(badCadence.status === 400, `PATCH invalid cadence "hourly" → 400 (got ${badCadence.status})`);
    assert(String((await J(badCadence)).error || "").toLowerCase().includes("schedulecadence"), "400 body names scheduleCadence");

    // Negative: invalid provider rejected.
    const badProvider = await patchConfig(base, [sandboxObject([row({ Name: "digest", runLocality: "serverless", schedulerRegistryId: "s", scheduleProvider: "aws-lambda" })])]);
    assert(badProvider.status === 400, `PATCH invalid provider → 400 (got ${badProvider.status})`);

    process.stdout.write("\n[e2e] === env-status persistence gate ===\n");
    const envStatus = await J(await fetch(`${base}/api/workspace/env-status`, { cache: "no-store" }));
    assert(envStatus.persistence && envStatus.persistence.canSave === true, "env-status reports persistence.canSave=true (writable dev runtime)");

    process.stdout.write("\n[e2e] === Provision (negative paths) ===\n");
    // Negative: unknown row → 404.
    const unknownRow = await fetch(`${base}/api/workspace/scheduler/provision`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "workflows-e2e", name: "ghost", provider: "supabase-edge", cadence: "daily" }),
    });
    assert(unknownRow.status === 404, `provision unknown row → 404 (got ${unknownRow.status})`);

    // Negative: recurring cadence without a cron → 400.
    const recurringNoCron = await fetch(`${base}/api/workspace/scheduler/provision`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", provider: "qstash-schedule", cadence: "recurring" }),
    });
    assert(recurringNoCron.status === 400, `provision recurring w/o cron → 400 (got ${recurringNoCron.status})`);

    process.stdout.write("\n[e2e] === Provision (positive: scaffold + register + confirm 200) ===\n");
    const provision = await fetch(`${base}/api/workspace/scheduler/provision`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: "workflows-e2e", name: "digest", provider: "supabase-edge",
        cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler",
      }),
    });
    const provJson = await J(provision);
    assert(provision.status === 200 && provJson.confirmed === true, `provision confirmed a 200 (status ${provision.status}, confirmed ${provJson.confirmed}, mode ${provJson.confirm?.mode})`);
    assert(provJson.scheduleStatus === "scheduled", `scheduleStatus stamped "scheduled" (got ${provJson.scheduleStatus})`);
    assert(echoHits > 0, "the deployed endpoint actually received the verification 200 probe");

    // The externalized artifact file was written to the confined schedulers dir.
    const artifactPath = path.join(tmp, provJson.artifact?.path || "");
    assert(provJson.artifact?.path?.startsWith("lib/adapters/integrations/schedulers/") && fs.existsSync(artifactPath), `scheduler artifact written + confined (${provJson.artifact?.path})`);
    const artifactCode = fs.readFileSync(artifactPath, "utf8");
    assert(artifactCode.includes("growthub-sandbox-run-v1") && !artifactCode.includes("edge-shared-secret-probe"), "artifact accepts the run envelope and never inlines the secret");

    process.stdout.write("\n[e2e] === Config round-trip: row stamped + scheduler row registered ===\n");
    const cfg = await J(await fetch(`${base}/api/workspace`, { cache: "no-store" }));
    const objects = cfg.workspaceConfig?.dataModel?.objects || [];
    const wfRow = (objects.find((o) => o.id === "workflows-e2e")?.rows || []).find((r) => r.Name === "digest");
    assert(wfRow && wfRow.scheduleStatus === "scheduled" && wfRow.runLocality === "serverless", "workflow row persisted scheduled + serverless");
    assert(wfRow.schedulerRegistryId === "digest-scheduler", "workflow bound to the scheduler registry id");
    const schedRow = objects.flatMap((o) => (o.objectType === "api-registry" ? o.rows : [])).find((r) => r.integrationId === "digest-scheduler");
    assert(schedRow && schedRow.connectorKind === "scheduler" && schedRow.status === "connected", "api-registry scheduler row registered + connected");
    assert(!JSON.stringify(schedRow).includes("edge-shared-secret-probe"), "scheduler registry row stores no secret value (authRef only)");

    process.stdout.write("\n[e2e] === Lifecycle: pause / resume / drift-check / reconfirm ===\n");
    const pause = await J(await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "pause" }) }));
    assert(pause.ok && pause.scheduleStatus === "paused", "pause → paused");
    const resume = await J(await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "resume" }) }));
    assert(resume.ok && resume.scheduleStatus === "scheduled", "resume → scheduled");

    // Negative: bad action → 400.
    const badAction = await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "explode" }) });
    assert(badAction.status === 400, `lifecycle bad action → 400 (got ${badAction.status})`);

    // Drift check — clean runtime (auth resolves, same URL) → stays scheduled.
    const checkClean = await J(await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "check", currentBaseUrl: echoUrl }) }));
    assert(checkClean.ok && checkClean.drift && checkClean.drift.drifted === false && checkClean.scheduleStatus === "scheduled", "drift check (clean runtime) → not drifted, still scheduled");

    // Drift check — simulated redeploy (different endpoint URL) → needs-reconfirm.
    const checkDrift = await J(await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "check", currentBaseUrl: "http://127.0.0.1:59999/redeployed" }) }));
    assert(checkDrift.drift.drifted === true && checkDrift.scheduleStatus === "needs-reconfirm", "drift check (redeploy) → drifted, needs-reconfirm");

    // Re-confirm = idempotent re-provision → fresh 200 → scheduled again.
    const reconfirm = await J(await fetch(`${base}/api/workspace/scheduler/provision`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", provider: "supabase-edge", cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler" }),
    }));
    assert(reconfirm.confirmed === true && reconfirm.scheduleStatus === "scheduled", "re-confirm earns a fresh 200 → scheduled");

    process.stdout.write("\n[e2e] === Provision (no destination → honest 'provisioning') ===\n");
    // Non-destructive: read current config and APPEND a second workflow row,
    // preserving the existing api-registry object (the digest-scheduler row).
    const cfgNd = await J(await fetch(`${base}/api/workspace`, { cache: "no-store" }));
    const objsNd = (cfgNd.workspaceConfig?.dataModel?.objects || []).map((o) => {
      if (o.id !== "workflows-e2e") return o;
      const rows = Array.isArray(o.rows) ? o.rows.slice() : [];
      if (!rows.some((r) => r.Name === "weekly-report")) {
        rows.push(row({ Name: "weekly-report", runLocality: "serverless", schedulerRegistryId: "weekly-report-scheduler", adapter: "serverless", scheduleCadence: "weekly", scheduleProvider: "qstash-schedule" }));
      }
      return { ...o, rows };
    });
    const ndPatch = await patchConfig(base, objsNd);
    assert(ndPatch.status === 200, `append second workflow row → 200 (got ${ndPatch.status})`);
    const noDest = await J(await fetch(`${base}/api/workspace/scheduler/provision`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "workflows-e2e", name: "weekly-report", provider: "qstash-schedule", cadence: "weekly", authRef: "QSTASH", integrationId: "weekly-report-scheduler" }),
    }));
    assert(noDest.scheduleStatus === "provisioning" && noDest.confirmed === false, "no deployed URL → scaffolded+registered, scheduleStatus 'provisioning' (honest, not faked)");

    process.stdout.write("\n[e2e] === Serverless run delegates with cadence in the envelope ===\n");
    // Point the digest scheduler registry row's endpoint at the echo server, then run it.
    const cfg2 = await J(await fetch(`${base}/api/workspace`, { cache: "no-store" }));
    const objs2 = (cfg2.workspaceConfig?.dataModel?.objects || []).map((o) => {
      if (o.objectType !== "api-registry") return o;
      return { ...o, rows: o.rows.map((r) => (r.integrationId === "digest-scheduler" ? { ...r, method: "POST", endpoint: echoUrl, baseUrl: "" } : r)) };
    });
    const setEndpoint = await patchConfig(base, objs2);
    assert(setEndpoint.status === 200, `set scheduler endpoint via PATCH → 200 (got ${setEndpoint.status}: ${JSON.stringify(await J(setEndpoint)).slice(0, 200)})`);
    const beforeHits = echoHits;
    const runRes = await J(await fetch(`${base}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest" }) }));
    assert(runRes.ok === true && echoHits > beforeHits, `serverless sandbox-run delegated to the scheduler endpoint and got 200 (ok=${runRes.ok}, hits ${beforeHits}->${echoHits}, err=${runRes.response?.error || runRes.error || "n/a"})`);

    process.stdout.write("\n[e2e] === Governed receipt stream ===\n");
    const outcomes = await J(await fetch(`${base}/api/workspace/agent-outcomes`, { cache: "no-store" }));
    const kinds = JSON.stringify(outcomes).match(/scheduler-provision|scheduler-lifecycle/g) || [];
    assert(kinds.length > 0, "agent-outcomes stream carries scheduler-provision / scheduler-lifecycle receipts");

    process.stdout.write(`\n[e2e] ALL ${passed} ASSERTIONS PASSED ✅\n`);
  } catch (err) {
    failure = err;
    process.stderr.write(`\n[e2e] FAILED: ${err.message}\n`);
  } finally {
    try { process.kill(-dev.pid, "SIGKILL"); } catch { /* */ }
    try { echo.close(); } catch { /* */ }
    if (process.env.KEEP_WS !== "1") { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
  }
  if (failure) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
