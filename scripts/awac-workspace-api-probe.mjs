#!/usr/bin/env node
/**
 * AWaC workspace API probes — materializes the bundled starter via official CLI
 * dist, installs the Next app in the temp tree, runs `next dev`, and exercises
 * GET/PATCH /api/workspace plus reference-options and sandbox-run with explicit
 * positive and negative cases.
 *
 * Usage (from repo root):
 *   node scripts/awac-workspace-api-probe.mjs
 *   node scripts/awac-golden-path-probe.mjs   # re-exports runAwacWorkspaceApiProbe({ goldenPath: true })
 *
 * Requires: network bind on 127.0.0.1 (local dev server only).
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(repoRoot, "cli");
const cliDist = path.join(cliDir, "dist", "index.js");

function pickPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, { tries = 60, delayMs = 500 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return res;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Normalized sandbox-run receipt persisted to rows and `growthub.source-records.json` (see `buildRunResponse` in sandbox-run route). */
function assertGrowthubSandboxRunReceipt(runJson) {
  assert(runJson && typeof runJson === "object", "sandbox-run top-level body must be an object");
  assert(typeof runJson.runId === "string" && runJson.runId.length > 0, "sandbox-run.runId must be a non-empty string");
  const r = runJson.response;
  assert(r && typeof r === "object", "sandbox-run.response envelope missing");
  for (const k of [
    "runId",
    "ranAt",
    "runLocality",
    "runtime",
    "adapter",
    "exitCode",
    "durationMs",
    "stdout",
    "stderr",
    "envRefsResolved",
    "envRefsMissing",
    "networkAllow",
    "allowList"
  ]) {
    assert(Object.prototype.hasOwnProperty.call(r, k), `sandbox-run.response missing required field: ${k}`);
  }
  assert(["local", "serverless"].includes(r.runLocality), "response.runLocality must be local or serverless");
  assert(Array.isArray(r.envRefsResolved), "response.envRefsResolved must be an array");
  assert(Array.isArray(r.envRefsMissing), "response.envRefsMissing must be an array");
  assert(Array.isArray(r.allowList), "response.allowList must be an array");
  assert(typeof r.stdout === "string", "response.stdout must be a string");
  assert(typeof r.stderr === "string", "response.stderr must be a string");
}

function parseStarterJson(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function materializeWorkspace(outDir) {
  assert(fs.existsSync(cliDist), `missing CLI dist at ${cliDist} — build the CLI first`);
  if (!fs.existsSync(path.join(cliDir, "node_modules", "zod"))) {
    console.error("CLI dependencies missing. Run: cd cli && npm install");
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [cliDist, "starter", "init", "--kit", "growthub-custom-workspace-starter-v1", "--out", outDir, "--json"], {
    cwd: cliDir,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const meta = parseStarterJson(r.stdout);
  assert(meta && meta.status === "ok", `starter init failed or unparsable JSON: ${r.stdout}`);
  return meta;
}

function npmInstall(cwd) {
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd, stdio: "inherit", env: process.env });
  assert(r.status === 0, "npm install in workspace app failed");
}

function buildSeedDataModel() {
  const apiRegistryColumns = [
    "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse",
    "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane"
  ];
  const sandboxColumns = [
    "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter", "agentHost",
    "envRefs", "networkAllow", "allowList", "instructions", "command", "timeoutMs", "status", "lastTested",
    "lastRunId", "lastSourceId", "lastResponse", "resolverTemplateId", "connectorKind", "executionLane"
  ];
  const schedulerRelation = {
    id: "scheduler-registry-binding",
    name: "Scheduler (serverless)",
    field: "schedulerRegistryId",
    targetObjectType: "api-registry",
    type: "belongs-to",
    description: "Serverless scheduler FK",
    valueField: "integrationId",
    labelField: "Name",
    secondaryLabelField: "endpoint",
    statusField: "status",
    statusAllowlist: ["connected", "approved", "ok", "success"],
    searchable: true,
    pageSize: 25
  };
  return {
    objects: [
      {
        id: "api-registry-probe",
        label: "API Registry",
        source: "API Registry",
        objectType: "api-registry",
        icon: "Code2",
        columns: apiRegistryColumns,
        rows: [
          {
            integrationId: "probe-scheduler",
            authRef: "PROBE_SCHEDULER",
            baseUrl: "https://example.invalid",
            endpoint: "/run",
            method: "POST",
            status: "connected",
            lastTested: "",
            lastResponse: "",
            entityTypes: "",
            description: "Probe scheduler row",
            connectorKind: "http",
            resolverTemplateId: "custom-http",
            schemaVersion: "growthub-resolver-template-v1",
            capabilities: "",
            executionLane: "sandbox-serverless"
          },
          {
            integrationId: "probe-untrusted",
            authRef: "X",
            baseUrl: "https://example.invalid",
            endpoint: "/x",
            method: "POST",
            status: "failed",
            lastTested: "",
            lastResponse: "",
            entityTypes: "",
            description: "Should be filtered out of trusted scheduler picker",
            connectorKind: "http",
            resolverTemplateId: "",
            schemaVersion: "",
            capabilities: "",
            executionLane: ""
          }
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [],
        fieldSettings: { hidden: [], order: apiRegistryColumns }
      },
      {
        id: "sandbox-probe",
        label: "Sandboxes",
        source: "Sandboxes",
        objectType: "sandbox-environment",
        icon: "Terminal",
        columns: sandboxColumns,
        rows: [
          {
            Name: "probe-local-sbx",
            lifecycleStatus: "draft",
            version: "1",
            runLocality: "local",
            schedulerRegistryId: "",
            runtime: "node",
            adapter: "local-process",
            agentHost: "",
            envRefs: "",
            networkAllow: "false",
            allowList: "",
            instructions: "",
            command: "console.log('growthub-probe-ok')",
            timeoutMs: "15000",
            status: "",
            lastTested: "",
            lastRunId: "",
            lastSourceId: "",
            lastResponse: "",
            resolverTemplateId: "custom-http",
            connectorKind: "http",
            executionLane: "sandbox-local"
          }
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [schedulerRelation],
        fieldSettings: { hidden: [], order: sandboxColumns }
      }
    ]
  };
}

export async function runAwacWorkspaceApiProbe(options = {}) {
  const goldenPath = options.goldenPath === true;
  const tmpBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), "growthub-awac-probe-"));
  const forkRoot = tmpBase;
  console.log(`[probe] materializing starter → ${forkRoot}`);
  materializeWorkspace(forkRoot);
  const appDir = path.join(forkRoot, "apps", "workspace");
  assert(fs.existsSync(appDir), `missing ${appDir}`);
  console.log(`[probe] npm install in ${appDir}`);
  npmInstall(appDir);

  const port = await pickPort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "development",
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
  };

  console.log(`[probe] starting next dev on ${base}`);
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  let serverLog = "";
  child.stdout?.on("data", (c) => { serverLog += c.toString(); });
  child.stderr?.on("data", (c) => { serverLog += c.toString(); });

  try {
    await waitForHttp(`${base}/api/workspace`);

    // --- Negative: unknown PATCH field ---
    let res = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrations: [] }),
    });
    assert(res.status === 400, `expected 400 for forbidden PATCH field, got ${res.status}`);
    const badPatch = await res.json();
    assert(String(badPatch.error || "").includes("unknown"), "expected unknown field error");

    // --- Positive: PATCH dataModel seed ---
    res = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: buildSeedDataModel() }),
    });
    const patchText = await res.text();
    assert(res.ok, `PATCH dataModel failed ${res.status}: ${patchText.slice(0, 800)}`);
    const patched = JSON.parse(patchText);
    assert(patched.workspaceConfig?.dataModel?.objects?.length === 2, "expected two data model objects after PATCH");

    if (goldenPath) {
      res = await fetch(`${base}/api/workspace`, { cache: "no-store" });
      assert(res.ok, `GET /api/workspace golden path expected 2xx, got ${res.status}`);
      const cfg = await res.json();
      assert(cfg.workspaceConfig && typeof cfg.workspaceConfig === "object", "GET must include workspaceConfig");
      assert(
        Array.isArray(cfg.workspaceConfig.dataModel?.objects),
        "GET golden path: dataModel.objects must be an array"
      );
    }

    // --- reference-options: negative unknown object ---
    res = await fetch(`${base}/api/workspace/reference-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "nope", field: "schedulerRegistryId", query: "", limit: 25, context: {} }),
    });
    assert(res.status === 400, `expected 400 unknown object, got ${res.status}`);

    // --- reference-options: positive (trusted scheduler rows only) ---
    res = await fetch(`${base}/api/workspace/reference-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: "sandbox-probe",
        field: "schedulerRegistryId",
        query: "probe",
        limit: 25,
        context: {},
      }),
    });
    assert(res.ok, `reference-options failed ${res.status}`);
    const refPayload = await res.json();
    assert(refPayload.ok === true, "reference-options ok flag");
    const values = (refPayload.options || []).map((o) => o.value);
    assert(values.includes("probe-scheduler"), `expected probe-scheduler in options, got ${JSON.stringify(values)}`);
    assert(!values.includes("probe-untrusted"), "untrusted api-registry row must not appear for sandbox scheduler field");

    if (goldenPath) {
      const opts = refPayload.options || [];
      assert(opts.length > 0, "golden path: reference-options must return at least one option");
      const sample = opts[0];
      assert(typeof sample.value === "string" && sample.value.length > 0, "reference option must include value string");
      assert(typeof sample.label === "string", "reference option must include label string");
    }

    // --- sandbox-run: negative missing row ---
    res = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandbox-probe", name: "does-not-exist" }),
    });
    assert(res.status === 404, `expected 404 for missing sandbox row, got ${res.status}`);

    // --- sandbox-run: positive local process ---
    res = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandbox-probe", name: "probe-local-sbx" }),
    });
    const runBody = await res.json();
    assert(res.ok, `sandbox-run failed ${res.status} ${JSON.stringify(runBody)}`);
    assert(runBody.ok === true, "sandbox-run ok");
    assert(String(runBody.response?.stdout || "").includes("growthub-probe-ok"), "expected echo output in stdout");
    assert(runBody.response?.templateTrace?.resolverTemplateId === "custom-http", "expected templateTrace from row");

    if (goldenPath) {
      assertGrowthubSandboxRunReceipt(runBody);
      assert(runBody.persisted === true, "golden path expects sandbox receipt persisted to source-records");
      const sidecarPath = path.join(appDir, "growthub.source-records.json");
      assert(fs.existsSync(sidecarPath), `missing source-records sidecar at ${sidecarPath}`);
      const sidecar = JSON.parse(await fs.promises.readFile(sidecarPath, "utf8"));
      const sid = runBody.sourceId;
      assert(typeof sid === "string" && sid.length > 0, "golden path: sourceId must be returned");
      const bucket = sidecar[sid];
      assert(bucket && Array.isArray(bucket.records) && bucket.records.length > 0, "golden path: sidecar must append receipt");
      const last = bucket.records[bucket.records.length - 1];
      assert(last.runId === runBody.runId, "golden path: last sidecar receipt runId must match POST response");
    }

    console.log(goldenPath ? "[probe] all API probes passed (golden path)" : "[probe] all API probes passed");
    console.log(JSON.stringify({ forkRoot, port, referenceOptionSample: refPayload.options?.[0] || null }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(500);
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    if (process.env.AWAC_PROBE_KEEP_TMP === "1") {
      console.log(`[probe] keeping ${forkRoot} (AWAC_PROBE_KEEP_TMP=1)`);
    } else {
      await fs.promises.rm(forkRoot, { recursive: true, force: true }).catch(() => {});
    }
    if (serverLog && process.env.AWAC_PROBE_VERBOSE === "1") {
      process.stderr.write(serverLog);
    }
  }
}

const resolvedEntry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisFile = fileURLToPath(import.meta.url);
const invokedDirectly = Boolean(resolvedEntry && resolvedEntry === thisFile);
if (invokedDirectly) {
  runAwacWorkspaceApiProbe({ goldenPath: false }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
