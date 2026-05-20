#!/usr/bin/env node
/**
 * Deep probes for API Registry → Sandbox orchestration (orchestrationGraph field,
 * applySandboxToolFromRegistry, sandbox-run scheduler resolution from graph).
 *
 * Usage: node scripts/orchestration-sidecar-probe.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitWorkspace = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function waitForHttp(url, tries = 80, delayMs = 400) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return res;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  throw new Error(`timeout: ${url}`);
}

async function testOrchestrationLib(appDir) {
  const modUrl = pathToFileURL(path.join(appDir, "lib/orchestration-graph.js")).href;
  const dmUrl = pathToFileURL(path.join(appDir, "lib/workspace-data-model.js")).href;
  const {
    applySandboxToolFromRegistry,
    buildDefaultOrchestrationGraphFromRegistry,
    findSandboxRowsForRegistry,
    isApiRegistryTestSuccessful,
    parseOrchestrationGraph,
    resolveSchedulerRegistryIdFromRow,
    validateOrchestrationGraph,
  } = await import(modUrl);
  await import(dmUrl);

  const registryRow = {
    integrationId: "leadshark",
    Name: "LeadShark",
    method: "GET",
    endpoint: "/leads?page=1",
    authRef: "LEADSHARK",
    status: "connected",
    lastResponse: '{"ok":true}',
  };
  assert(isApiRegistryTestSuccessful(registryRow), "trusted registry row");
  const graph = buildDefaultOrchestrationGraphFromRegistry(registryRow);
  assert(validateOrchestrationGraph(graph).ok, "default graph valid");
  assert(graph.nodes.some((n) => n.type === "api-registry-call"), "graph has api-registry-call");

  const emptyCfg = { dataModel: { objects: [] } };
  const applied = applySandboxToolFromRegistry(emptyCfg, registryRow, { name: "LeadShark Leads Tool" });
  assert(applied.ok, `apply failed: ${(applied.errors || []).join("; ")}`);
  const sbObj = applied.workspaceConfig.dataModel.objects.find((o) => o.objectType === "sandbox-environment");
  assert(sbObj, "sandbox object created");
  const toolRow = sbObj.rows.find((r) => r.Name === "LeadShark Leads Tool");
  assert(toolRow, "tool row created");
  assert(toolRow.orchestrationGraph, "orchestrationGraph persisted");
  const parsed = parseOrchestrationGraph(toolRow.orchestrationGraph);
  assert(parsed?.provider === "growthub-native", "provider growthub-native");
  assert(!JSON.stringify(toolRow).includes("sk-"), "no secret-like strings in row");
  const found = findSandboxRowsForRegistry(applied.workspaceConfig, "leadshark");
  assert(found.length >= 1, "findSandboxRowsForRegistry");
  assert(
    resolveSchedulerRegistryIdFromRow(applied.workspaceConfig, { orchestrationGraph: toolRow.orchestrationGraph }) === "leadshark",
    "resolve scheduler from graph"
  );
  console.log("[orch-probe] lib/orchestration-graph.js assertions passed");
  return applied.workspaceConfig;
}

async function main() {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "growthub-orch-probe-"));
  console.log(`[orch-probe] copy kit workspace → ${tmp}`);
  fs.cpSync(kitWorkspace, tmp, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes("node_modules"),
  });

  console.log("[orch-probe] npm install");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: tmp, stdio: "inherit" });
  assert(ni.status === 0, "npm install failed");

  const seededConfig = await testOrchestrationLib(tmp);

  console.log("[orch-probe] next build (production compile)");
  const build = spawnSync("npm", ["run", "build"], { cwd: tmp, encoding: "utf8", env: { ...process.env, CI: "1" } });
  if (build.status !== 0) {
    console.error(build.stdout || build.stderr);
    throw new Error("next build failed");
  }
  assert(build.stdout.includes("Compiled") || build.stderr.includes("Compiled") || build.status === 0, "build output");

  const cfgPath = path.join(tmp, "growthub.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.dataModel = seededConfig.dataModel;
  fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);

  const port = await pickPort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
  };

  console.log(`[orch-probe] next start on ${base}`);
  const child = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: tmp,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHttp(`${base}/api/workspace`);

    let res = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: seededConfig.dataModel }),
    });
    assert(res.ok, `PATCH dataModel ${res.status}: ${(await res.text()).slice(0, 400)}`);

    const sbObj = seededConfig.dataModel.objects.find((o) => o.objectType === "sandbox-environment");
    const toolName = "LeadShark Leads Tool";

    res = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: sbObj.id, name: toolName }),
    });
    const runJson = await res.json();
    assert(res.ok || res.status === 200, `sandbox-run status ${res.status}`);
    assert(runJson.ok !== undefined, "sandbox-run body shape");
    const cfgAfter = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const rowAfter = cfgAfter.dataModel.objects
      .find((o) => o.id === sbObj.id)
      ?.rows?.find((r) => r.Name === toolName);
    assert(rowAfter?.orchestrationGraph, "orchestrationGraph still on row after run");
    assert(!String(rowAfter?.lastResponse || "").match(/sk-[a-z0-9]{10,}/i), "no secrets in lastResponse");

    res = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orchestrationGraph: { version: 1 } }),
    });
    assert(res.status === 400, `forbidden top-level field expected 400 got ${res.status}`);

    console.log("[orch-probe] HTTP + production build probes passed");
    console.log(JSON.stringify({
      port,
      toolName,
      runStatus: runJson.status,
      rowStatus: rowAfter?.status,
      hasOrchestrationGraph: Boolean(rowAfter?.orchestrationGraph),
    }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(400);
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
