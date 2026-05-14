#!/usr/bin/env node
/**
 * Golden-path HTTP probe for the governed workspace app (AWaC demo regression).
 *
 * Exercises the canonical buyer story:
 *   GET /api/workspace
 *   POST /api/workspace/reference-options
 *   POST /api/workspace/sandbox-run (seeded local-process row)
 *
 * Materializes a temp copy of the bundled starter `apps/workspace`, seeds `dataModel`
 * (API Registry + Sandbox Environment + scheduler relation), runs `next dev`, then asserts
 * receipt shape (`sourceId`, `status`, normalized response).
 *
 * Usage (repo root, requires network for npm install):
 *   node scripts/awac-golden-path-probe.mjs
 *
 * Env:
 *   PORT              — bind port (default: ephemeral)
 *   CLI_DEMO_HOME     — parent dir for temp trees (default: $TMPDIR/growthub-cli-demo)
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitWorkspace = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const p = typeof a === "object" && a ? a.port : 0;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForHttpReady(url, maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 400 || res.status === 409) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready within ${maxMs}ms: ${url}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function buildGoldenPathDataModel() {
  const apiRegistryColumns = [
    "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse",
    "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane",
  ];
  const sandboxColumns = [
    "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter", "agentHost",
    "envRefs", "networkAllow", "allowList", "instructions", "command", "timeoutMs", "status", "lastTested",
    "lastRunId", "lastSourceId", "lastResponse", "resolverTemplateId", "connectorKind", "executionLane",
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
    pageSize: 25,
  };
  return {
    objects: [
      {
        id: "golden-api-registry",
        label: "API Registry",
        source: "API Registry",
        objectType: "api-registry",
        icon: "Code2",
        columns: apiRegistryColumns,
        rows: [
          {
            integrationId: "golden-scheduler",
            authRef: "GOLDEN_SCHEDULER",
            baseUrl: "https://example.invalid",
            endpoint: "/run",
            method: "POST",
            status: "connected",
            lastTested: "",
            lastResponse: "",
            entityTypes: "",
            description: "Golden path scheduler row",
            connectorKind: "http",
            resolverTemplateId: "custom-http",
            schemaVersion: "growthub-resolver-template-v1",
            capabilities: "",
            executionLane: "sandbox-serverless",
          },
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [],
        fieldSettings: { hidden: [], order: apiRegistryColumns },
      },
      {
        id: "golden-sandbox",
        label: "Sandboxes",
        source: "Sandboxes",
        objectType: "sandbox-environment",
        icon: "Terminal",
        columns: sandboxColumns,
        rows: [
          {
            Name: "golden-local-row",
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
            command: "console.log('golden-path-ok')",
            timeoutMs: "15000",
            status: "",
            lastTested: "",
            lastRunId: "",
            lastSourceId: "",
            lastResponse: "",
            resolverTemplateId: "custom-http",
            connectorKind: "http",
            executionLane: "sandbox-local",
          },
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [schedulerRelation],
        fieldSettings: { hidden: [], order: sandboxColumns },
      },
    ],
  };
}

async function main() {
  const port =
    process.env.PORT && String(process.env.PORT).trim()
      ? Number(process.env.PORT)
      : await pickFreePort();
  const base = `http://127.0.0.1:${port}`;

  const profileRoot = process.env.CLI_DEMO_HOME?.trim()
    ? path.resolve(process.env.CLI_DEMO_HOME.trim())
    : path.join(os.tmpdir(), "growthub-cli-demo");
  const demoHome = path.join(profileRoot, "awac-golden-path-probe");
  fs.mkdirSync(demoHome, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(demoHome, "ws-copy-"));

  process.stdout.write(`[golden-path] Copying starter workspace → ${tmp}\n`);
  fs.cpSync(kitWorkspace, tmp, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes("node_modules"),
  });

  const cfgPath = path.join(tmp, "growthub.config.json");
  const baseCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  baseCfg.dataModel = buildGoldenPathDataModel();
  fs.writeFileSync(cfgPath, `${JSON.stringify(baseCfg, null, 2)}\n`, "utf8");

  process.stdout.write("[golden-path] npm install (workspace app)…\n");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: tmp,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  assert(ni.status === 0, "npm install failed");

  process.stdout.write(`[golden-path] starting next dev on :${port}…\n`);
  const dev = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: tmp,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", (c) => process.stderr.write(c));
  dev.unref();

  try {
    await waitForHttpReady(`${base}/api/workspace`);

    const getRes = await fetch(`${base}/api/workspace`, { cache: "no-store" });
    assert(getRes.ok, `GET /api/workspace expected 2xx, got ${getRes.status}`);
    const getBody = await getRes.json();
    assert(getBody.workspaceConfig?.id, "GET must return workspaceConfig.id");

    const refRes = await fetch(`${base}/api/workspace/reference-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: "golden-sandbox",
        field: "schedulerRegistryId",
        query: "golden",
        limit: 25,
        context: {},
      }),
    });
    assert(refRes.ok, `reference-options failed ${refRes.status}`);
    const refJson = await refRes.json();
    assert(refJson.ok === true, "reference-options ok flag");
    const values = (refJson.options || []).map((o) => o.value);
    assert(values.includes("golden-scheduler"), `expected golden-scheduler in options, got ${JSON.stringify(values)}`);

    const runRes = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "golden-sandbox", name: "golden-local-row" }),
    });
    const runJson = await runRes.json();
    assert(runRes.ok, `sandbox-run HTTP failed ${runRes.status}: ${JSON.stringify(runJson)}`);
    assert(typeof runJson.sourceId === "string" && runJson.sourceId.length > 0, "sandbox-run must return non-empty sourceId");
    assert(
      runJson.status === "connected" || runJson.status === "failed",
      `status must be connected|failed, got ${runJson.status}`,
    );
    assert(runJson.response && typeof runJson.response === "object", "sandbox-run must include response object");
    assert(
      String(runJson.response.stdout || "").includes("golden-path-ok"),
      "expected golden-path-ok in stdout receipt",
    );

    process.stdout.write("[golden-path] all checks passed.\n");
  } finally {
    try {
      dev.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      spawnSync("sh", ["-c", `pkill -f "next dev -p ${port}" 2>/dev/null || true`], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
