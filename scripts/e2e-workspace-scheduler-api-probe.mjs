#!/usr/bin/env node
/**
 * Real HTTP probes for No-Code Workflow Persistence & Scheduling — HARDENED.
 *
 * Reconstructs a governed workspace exactly as it ships, runs `next dev`, stands
 * up a local "deployed endpoint" echo server, and drives the full journey with
 * the HONEST production semantics from the adversarial hardening pass:
 *
 *   - endpoint-confirmed (200) is NOT "scheduled" (findings 1, 13)
 *   - supabase-edge reaches "scheduled" only via explicit external attestation
 *   - qstash-schedule without a QSTASH token stays endpoint-confirmed + says why
 *   - cron range / min-interval rejection (finding 8)
 *   - provider-aware lifecycle: pause/resume/cancel report provider vs local-only (2)
 *   - drift uses URL normalization (finding 5); reconfirm earns it back
 *   - generated artifact carries a provenance banner + honest security (7, 12)
 *   - idempotency: re-provision does not duplicate registry rows (finding 10)
 *
 * Usage:  node scripts/e2e-workspace-scheduler-api-probe.mjs   (PORT=… optional)
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
  "scheduleStatus", "schedulePaused", "scheduleTrustedLive", "scheduleProviderScheduleId",
  "scheduleConfirmationMode", "scheduleConfirmationHttpStatus", "scheduleEndpointUrl",
  "scheduleEndpointConfirmedAt", "scheduleLastConfirmedEndpointUrl", "scheduleProviderScheduleCreatedAt",
  "scheduleNextRunAt", "scheduleLastRunAt", "scheduleLastConfirmedAt",
  "runtime", "adapter", "agentHost", "envRefs", "networkAllow", "allowList", "browserAccess",
  "instructions", "command", "timeoutMs", "status", "lastTested", "lastRunId", "lastSourceId", "lastResponse",
];

function row(overrides = {}) {
  return {
    Name: "digest", lifecycleStatus: "draft", version: "1", runLocality: "local", schedulerRegistryId: "",
    scheduleCadence: "manual", scheduleCron: "", scheduleTimezone: "UTC", scheduleProvider: "",
    scheduleStatus: "", schedulePaused: "false", scheduleTrustedLive: "false", scheduleProviderScheduleId: "",
    scheduleConfirmationMode: "", scheduleConfirmationHttpStatus: "", scheduleEndpointUrl: "",
    scheduleEndpointConfirmedAt: "", scheduleLastConfirmedEndpointUrl: "", scheduleProviderScheduleCreatedAt: "",
    scheduleNextRunAt: "", scheduleLastRunAt: "", scheduleLastConfirmedAt: "",
    runtime: "node", adapter: "local-process", agentHost: "", envRefs: "",
    networkAllow: "false", allowList: "", browserAccess: "false",
    instructions: "", command: "echo ok", timeoutMs: "15000",
    status: "", lastTested: "", lastRunId: "", lastSourceId: "", lastResponse: "",
    ...overrides,
  };
}

function sandboxObject(rows) {
  return { id: "workflows-e2e", label: "Workflows", source: "Workflows", objectType: "sandbox-environment", icon: "Terminal", columns: sandboxColumns, rows, binding: { mode: "manual", source: "Data Model" }, relations: [], fieldSettings: { hidden: [], order: sandboxColumns } };
}

function pickFreePort() {
  return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const a = s.address(); const p = typeof a === "object" && a ? a.port : 0; s.close(() => resolve(p)); }); s.on("error", reject); });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForHttpReady(url, maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { const res = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (res.ok || res.status === 400 || res.status === 409) return; } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`Server not ready within ${maxMs}ms: ${url}`);
}
let passed = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); passed += 1; process.stdout.write(`  ✓ ${msg}\n`); }
const J = async (res) => { try { return await res.json(); } catch { return {}; } };
async function patchConfig(base, objects) { return fetch(`${base}/api/workspace`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataModel: { objects } }) }); }
async function provision(base, body) { return J(await fetch(`${base}/api/workspace/scheduler/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); }
async function lifecycle(base, body) { return J(await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); }
async function getCfg(base) { return J(await fetch(`${base}/api/workspace`, { cache: "no-store" })); }
const wfRow = (cfg, name = "digest") => (cfg.workspaceConfig?.dataModel?.objects?.find((o) => o.id === "workflows-e2e")?.rows || []).find((r) => r.Name === name);
const regRows = (cfg) => (cfg.workspaceConfig?.dataModel?.objects || []).flatMap((o) => (o.objectType === "api-registry" ? o.rows : []));

async function main() {
  const port = process.env.PORT?.trim() ? Number(process.env.PORT) : await pickFreePort();
  const base = `http://127.0.0.1:${port}`;
  const echoPort = await pickFreePort();

  let echoHits = 0;
  const echo = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {}; try { parsed = JSON.parse(body || "{}"); } catch { /* */ }
      echoHits += 1;
      if (parsed?.kind === "growthub-sandbox-run-v1") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, exitCode: 0, stdout: "echo accepted", durationMs: 1 })); }
      else { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "unexpected envelope" })); }
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

  process.stdout.write("[e2e] npm install…\n");
  assert(spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: tmp, stdio: "inherit", env: { ...process.env, CI: "1" } }).status === 0, "npm install succeeded");

  process.stdout.write(`[e2e] next dev on :${port}…\n`);
  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: tmp, stdio: ["ignore", "pipe", "pipe"], detached: true,
    env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port), SUPABASE_EDGE: "edge-shared-secret-probe" },
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", (c) => process.stderr.write(c));
  dev.unref();

  let failure = null;
  try {
    await waitForHttpReady(`${base}/api/workspace`);

    process.stdout.write("\n[e2e] === Governance (cadence/provider PATCH, ±) ===\n");
    assert((await patchConfig(base, [sandboxObject([row({ runLocality: "serverless", schedulerRegistryId: "digest-scheduler", adapter: "serverless", scheduleCadence: "daily", scheduleProvider: "supabase-edge" })])])).status === 200, "PATCH serverless+daily+provider → 200");
    assert((await patchConfig(base, [sandboxObject([row({ runLocality: "serverless", schedulerRegistryId: "s", scheduleCadence: "hourly" })])])).status === 400, "PATCH invalid cadence → 400");
    assert((await patchConfig(base, [sandboxObject([row({ runLocality: "serverless", schedulerRegistryId: "s", scheduleProvider: "aws-lambda" })])])).status === 400, "PATCH invalid provider → 400");

    process.stdout.write("\n[e2e] === env-status persistence gate ===\n");
    assert((await J(await fetch(`${base}/api/workspace/env-status`, { cache: "no-store" }))).persistence?.canSave === true, "env-status persistence.canSave=true");

    process.stdout.write("\n[e2e] === Provision negatives (404, no-cron, bad cron range) ===\n");
    assert((await fetch(`${base}/api/workspace/scheduler/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "ghost", provider: "supabase-edge", cadence: "daily" }) })).status === 404, "provision unknown row → 404");
    assert((await fetch(`${base}/api/workspace/scheduler/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", provider: "qstash-schedule", cadence: "recurring" }) })).status === 400, "provision recurring w/o cron → 400");
    assert((await fetch(`${base}/api/workspace/scheduler/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", provider: "qstash-schedule", cadence: "recurring", cron: "99 99 99 99 99" }) })).status === 400, "provision impossible cron → 400");
    assert((await fetch(`${base}/api/workspace/scheduler/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", provider: "qstash-schedule", cadence: "recurring", cron: "* * * * *" }) })).status === 400, "provision sub-min-interval cron → 400");

    process.stdout.write("\n[e2e] === HONEST: supabase endpoint-verify is NOT scheduled ===\n");
    const epc = await provision(base, { objectId: "workflows-e2e", name: "digest", provider: "supabase-edge", cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler" });
    assert(epc.scheduleStatus === "endpoint-confirmed" && epc.ok === false && epc.trustedLive === false, `supabase + 200 → endpoint-confirmed, not trusted (got ${epc.scheduleStatus}/${epc.ok})`);
    assert(epc.endpointConfirmed === true && epc.createsProviderSchedule === false, "endpoint confirmed; provider does not create schedule");
    assert(echoHits > 0, "deployed endpoint received the verification probe");

    process.stdout.write("\n[e2e] === HONEST: qstash without token stays endpoint-confirmed + says why ===\n");
    const qnt = await provision(base, { objectId: "workflows-e2e", name: "digest", provider: "qstash-schedule", cadence: "daily", destinationUrl: echoUrl, authRef: "QSTASH", integrationId: "digest-scheduler" });
    assert(qnt.scheduleStatus === "endpoint-confirmed" && qnt.scheduleCreated === false, `qstash w/o token → endpoint-confirmed, no schedule (got ${qnt.scheduleStatus})`);
    assert(/QSTASH token/i.test(qnt.detail || ""), "detail explains QStash schedule not created (token missing)");

    process.stdout.write("\n[e2e] === Supabase scheduled only via explicit external attestation ===\n");
    const sched = await provision(base, { objectId: "workflows-e2e", name: "digest", provider: "supabase-edge", cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler", externalScheduleConfirmed: true });
    assert(sched.scheduleStatus === "scheduled" && sched.ok === true && sched.trustedLive === true, `supabase + external attest → scheduled + trusted (got ${sched.scheduleStatus}/${sched.ok})`);
    assert(sched.confirmationMode === "external-manual", `confirmationMode external-manual (got ${sched.confirmationMode})`);

    process.stdout.write("\n[e2e] === Config round-trip + provenance + secret-safety ===\n");
    const cfg = await getCfg(base);
    const r = wfRow(cfg);
    assert(r.scheduleStatus === "scheduled" && r.runLocality === "serverless" && r.scheduleTrustedLive === "true", "row persisted scheduled + serverless + trusted");
    assert(r.scheduleLastConfirmedEndpointUrl && r.scheduleConfirmationMode === "external-manual", "row stamped last-confirmed URL + confirmation mode");
    const sr = regRows(cfg).find((x) => x.integrationId === "digest-scheduler");
    assert(sr && sr.connectorKind === "scheduler" && sr.status === "connected", "scheduler registry row connected");
    assert(!JSON.stringify(cfg).includes("edge-shared-secret-probe"), "no secret value anywhere in persisted config");
    const artifactPath = path.join(tmp, sched.artifact.path);
    const artifactCode = fs.readFileSync(artifactPath, "utf8");
    assert(artifactCode.includes("growthub:scheduler-artifact") && /LOWER ASSURANCE/.test(artifactCode), "artifact carries provenance banner + honest shared-secret label");
    assert(!artifactCode.includes("edge-shared-secret-probe"), "artifact never inlines the secret");

    process.stdout.write("\n[e2e] === Idempotency: re-provision does not duplicate the registry row ===\n");
    await provision(base, { objectId: "workflows-e2e", name: "digest", provider: "supabase-edge", cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler", externalScheduleConfirmed: true });
    const dupCount = regRows(await getCfg(base)).filter((x) => x.integrationId === "digest-scheduler").length;
    assert(dupCount === 1, `exactly one digest-scheduler registry row after re-provision (got ${dupCount})`);

    process.stdout.write("\n[e2e] === Provider-aware lifecycle (honest local-only for supabase) ===\n");
    const pause = await lifecycle(base, { objectId: "workflows-e2e", name: "digest", action: "pause" });
    assert(pause.ok && pause.scheduleStatus === "paused" && pause.providerConfirmed === false && pause.providerAction?.op === "not-supported", "pause → paused, honestly local-only (supabase external)");
    const resume = await lifecycle(base, { objectId: "workflows-e2e", name: "digest", action: "resume" });
    assert(resume.ok && resume.scheduleStatus === "scheduled", "resume → scheduled (external)");
    assert((await fetch(`${base}/api/workspace/scheduler/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest", action: "explode" }) })).status === 400, "lifecycle bad action → 400");

    process.stdout.write("\n[e2e] === Drift (URL-normalized) + reconfirm ===\n");
    const clean = await lifecycle(base, { objectId: "workflows-e2e", name: "digest", action: "check", currentBaseUrl: `${echoUrl}/` });
    assert(clean.drift?.drifted === false && clean.scheduleStatus === "scheduled", "drift check (same URL, trailing slash) → no drift");
    const drift = await lifecycle(base, { objectId: "workflows-e2e", name: "digest", action: "check", currentBaseUrl: "http://127.0.0.1:59999/redeployed" });
    assert(drift.drift?.drifted === true && drift.scheduleStatus === "needs-reconfirm", "drift check (redeploy) → needs-reconfirm");
    const reconfirm = await provision(base, { objectId: "workflows-e2e", name: "digest", provider: "supabase-edge", cadence: "daily", destinationUrl: echoUrl, authRef: "SUPABASE_EDGE", integrationId: "digest-scheduler", externalScheduleConfirmed: true });
    assert(reconfirm.scheduleStatus === "scheduled" && reconfirm.trustedLive === true, "re-confirm earns trusted-live again");

    process.stdout.write("\n[e2e] === No destination → scaffolded (honest) ===\n");
    const cfgNd = await getCfg(base);
    const objsNd = (cfgNd.workspaceConfig?.dataModel?.objects || []).map((o) => o.id === "workflows-e2e" && !o.rows.some((x) => x.Name === "weekly") ? { ...o, rows: [...o.rows, row({ Name: "weekly", runLocality: "serverless", schedulerRegistryId: "weekly-scheduler", adapter: "serverless", scheduleCadence: "weekly", scheduleProvider: "supabase-edge" })] } : o);
    assert((await patchConfig(base, objsNd)).status === 200, "append second workflow → 200");
    const nd = await provision(base, { objectId: "workflows-e2e", name: "weekly", provider: "supabase-edge", cadence: "weekly", authRef: "SUPABASE_EDGE", integrationId: "weekly-scheduler" });
    assert(nd.scheduleStatus === "scaffolded" && nd.ok === false, "no destination → scaffolded (not scheduled)");

    process.stdout.write("\n[e2e] === Serverless run delegates with cadence ===\n");
    const cfg2 = await getCfg(base);
    const objs2 = (cfg2.workspaceConfig?.dataModel?.objects || []).map((o) => o.objectType !== "api-registry" ? o : { ...o, rows: o.rows.map((x) => x.integrationId === "digest-scheduler" ? { ...x, method: "POST", endpoint: echoUrl, baseUrl: "" } : x) });
    assert((await patchConfig(base, objs2)).status === 200, "point scheduler endpoint at echo → 200");
    const before = echoHits;
    const runRes = await J(await fetch(`${base}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: "workflows-e2e", name: "digest" }) }));
    assert(runRes.ok === true && echoHits > before, `serverless sandbox-run delegated + 200 (ok=${runRes.ok})`);

    process.stdout.write("\n[e2e] === Governed receipt stream ===\n");
    const outcomes = await J(await fetch(`${base}/api/workspace/agent-outcomes`, { cache: "no-store" }));
    assert((JSON.stringify(outcomes).match(/scheduler-provision|scheduler-lifecycle/g) || []).length > 0, "agent-outcomes carries scheduler receipts");

    process.stdout.write(`\n[e2e] ALL ${passed} ASSERTIONS PASSED ✅\n`);
  } catch (err) {
    failure = err;
    process.stderr.write(`\n[e2e] FAILED after ${passed} passed: ${err.message}\n`);
  } finally {
    try { process.kill(-dev.pid, "SIGKILL"); } catch { /* */ }
    try { echo.close(); } catch { /* */ }
    if (process.env.KEEP_WS !== "1") { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
  }
  if (failure) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
