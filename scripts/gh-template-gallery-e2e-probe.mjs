#!/usr/bin/env node
/**
 * Customer-parity E2E: CLI dist → kit download → exported Next app → production
 * servers on 3801 (filesystem) + 3803 (vercel read-only) → GET/PATCH probes.
 *
 * Usage: node scripts/gh-template-gallery-e2e-probe.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(repoRoot, "cli");
const cliDist = path.join(cliDir, "dist", "index.js");
const exportRoot = "/tmp/gh-template-gallery-test";
const appDir = path.join(exportRoot, "apps", "workspace");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForHttp(url, { tries = 80, delayMs = 400 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok || res.status === 409) return res;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function runCli(args, { cwd = cliDir } = {}) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return r;
}

function materializeKit() {
  fs.rmSync(exportRoot, { recursive: true, force: true });
  const r = runCli([
    "kit",
    "download",
    "growthub-custom-workspace-starter-v1",
    "--yes",
    "--out",
    exportRoot,
  ]);
  assert(r.status === 0, `kit download failed: ${r.stderr || r.stdout}`);
  assert(fs.existsSync(appDir), `missing ${appDir}`);
}

function npmInstallAndBuild() {
  const install = spawnSync("pnpm", ["install"], { cwd: appDir, stdio: "inherit" });
  assert(install.status === 0, "pnpm install failed");
  const build = spawnSync("pnpm", ["exec", "next", "build"], { cwd: appDir, stdio: "inherit" });
  assert(build.status === 0, "pnpm next build failed");
}

async function startProductionServer(port, envExtra) {
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    ...envExtra,
  };
  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHttp(`${base}/api/workspace`);
  return { child, base };
}

async function probeWorkspaceApi(base, { writable }) {
  let res = await fetch(`${base}/api/workspace`);
  assert(res.ok, `GET failed ${res.status}`);
  const getPayload = await res.json();
  assert(getPayload.workspaceConfig, "GET missing workspaceConfig");

  if (!writable) {
    res = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvas: { layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true }, widgets: [] } }),
    });
    assert(res.status === 409, `read-only PATCH expected 409, got ${res.status}`);
    const ro = await res.json();
    assert(String(ro.error || "").includes("read-only"), `409 must mention read-only: ${JSON.stringify(ro)}`);
    assert(
      String(ro.guidance || ro.nextAction || "").includes("WORKSPACE_CONFIG_ALLOW_FS_WRITE"),
      "409 must include adapter guidance verbatim"
    );
    return;
  }

  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integrations: [] }),
  });
  assert(res.status === 400, `expected 400 unknown PATCH field, got ${res.status}`);
  const bad = await res.json();
  assert(String(bad.error || "").toLowerCase().includes("unknown"), "expected unknown field error");

  const offGrid = {
    canvas: {
      layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
      widgets: [
        {
          id: "w-off",
          kind: "chart",
          title: "Off",
          position: { x: 10, w: 4, y: 0, h: 2 },
          config: { values: [1] },
        },
      ],
    },
  };
  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(offGrid),
  });
  assert(res.status === 400, `off-grid expected 400, got ${res.status}`);
  const offBody = await res.json();
  assert(Array.isArray(offBody.details) && offBody.details.length > 0, "off-grid needs details[]");

  const validTabs = {
    canvas: {
      layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
      tabs: [
        { id: "tab_a", name: "A", widgets: [] },
        { id: "tab_b", name: "B", widgets: [] },
      ],
      activeTabId: "tab_a",
    },
  };
  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validTabs),
  });
  assert(res.ok, `positive PATCH failed ${res.status}: ${await res.text()}`);
  res = await fetch(`${base}/api/workspace`, { cache: "no-store" });
  const roundTrip = await res.json();
  assert(roundTrip.workspaceConfig?.canvas?.activeTabId === "tab_a", "refresh round-trip activeTabId");
}

async function probeOrchestrationGraph(base) {
  const graph = {
    version: 1,
    provider: "growthub-native",
    nodes: [
      { id: "input", type: "input", label: "Input", config: { schema: "record" } },
      {
        id: "api-registry-probe",
        type: "api-registry-call",
        label: "Probe",
        config: {
          registryId: "probe-api",
          method: "GET",
          endpoint: "/get",
          authRef: "PROBE",
        },
      },
      { id: "normalize", type: "normalize-output", label: "Normalize", config: { mode: "json", rootPath: "data" } },
      { id: "result", type: "tool-result", label: "Result", config: { writeLastResponse: true } },
    ],
    edges: [
      { from: "input", to: "api-registry-probe" },
      { from: "api-registry-probe", to: "normalize" },
      { from: "normalize", to: "result" },
    ],
  };

  const dataModel = {
    objects: [
      {
        id: "api-registry-probe",
        label: "API Registry",
        source: "API Registry",
        objectType: "api-registry",
        icon: "Code2",
        columns: ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse"],
        rows: [
          {
            integrationId: "probe-api",
            authRef: "PROBE",
            baseUrl: "https://httpbin.org",
            endpoint: "/get",
            method: "GET",
            status: "connected",
            lastTested: new Date().toISOString(),
            lastResponse: "{}",
          },
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [],
        fieldSettings: { hidden: [], order: ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse"] },
      },
      {
        id: "sandbox-probe",
        label: "Sandboxes",
        source: "Sandboxes",
        objectType: "sandbox-environment",
        icon: "Terminal",
        columns: [
          "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter",
          "agentHost", "envRefs", "networkAllow", "allowList", "instructions", "command", "timeoutMs",
          "status", "lastTested", "lastRunId", "lastSourceId", "lastResponse", "orchestrationGraph", "description",
        ],
        rows: [
          {
            Name: "orchestration-probe-tool",
            lifecycleStatus: "draft",
            version: "1",
            runLocality: "local",
            schedulerRegistryId: "",
            runtime: "node",
            adapter: "local-process",
            agentHost: "",
            envRefs: "",
            networkAllow: "",
            allowList: "",
            instructions: "Probe orchestration graph execution",
            command: "",
            timeoutMs: "15000",
            status: "untested",
            lastTested: "",
            lastRunId: "",
            lastSourceId: "",
            lastResponse: "",
            orchestrationGraph: JSON.stringify(graph, null, 2),
            description: "E2E orchestration probe",
          },
        ],
        binding: { mode: "manual", source: "Data Model" },
        relations: [],
        fieldSettings: { hidden: [], order: ["Name", "orchestrationGraph"] },
      },
    ],
  };

  const beforeCfg = await (await fetch(`${base}/api/workspace`)).json();
  const widgetCountBefore = beforeCfg.workspaceConfig?.canvas?.widgets?.length ?? 0;
  const dashCountBefore = beforeCfg.workspaceConfig?.dashboards?.length ?? 0;

  let res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel }),
  });
  assert(res.ok, `orchestration seed PATCH failed ${res.status}`);

  const afterCfg = await (await fetch(`${base}/api/workspace`)).json();
  assert(
    (afterCfg.workspaceConfig?.canvas?.widgets?.length ?? 0) === widgetCountBefore,
    "sandbox tool seed must not mutate canvas widgets"
  );
  assert(
    (afterCfg.workspaceConfig?.dashboards?.length ?? 0) === dashCountBefore,
    "sandbox tool seed must not mutate dashboards"
  );

  res = await fetch(`${base}/api/workspace/sandbox-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectId: "sandbox-probe", name: "orchestration-probe-tool" }),
  });
  const runBody = await res.json();
  assert(res.ok, `orchestration sandbox-run HTTP failed: ${JSON.stringify(runBody)}`);
  assert(
    runBody.ok === true && runBody.adapter === "orchestration-graph",
    `sandbox-run should execute growthub-native graph: ${JSON.stringify(runBody)}`
  );
  assert(runBody.response?.exitCode === 0, `expected exitCode 0, got ${runBody.response?.exitCode}`);
  const responseText = JSON.stringify(runBody.response ?? runBody);
  assert(!responseText.includes("PROBE_API_KEY"), "must not leak secrets in response");
  assert(!responseText.match(/sk-[a-z0-9]/i), "must not leak key material");
}

async function main() {
  console.log("[e2e] Step 1–2: CLI dist smoke");
  assert(fs.existsSync(cliDist), "missing cli/dist/index.js");
  if (!fs.existsSync(path.join(cliDir, "node_modules", "zod"))) {
    spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: cliDir, stdio: "inherit" });
  }
  let r = runCli(["--version"]);
  assert(r.status === 0, "cli --version failed");
  console.log(`  version: ${(r.stdout || "").trim()}`);
  r = runCli(["--help"]);
  assert(r.status === 0, "cli --help failed");
  r = runCli(["kit", "inspect", "growthub-custom-workspace-starter-v1"]);
  assert(r.status === 0, "kit inspect failed");

  console.log("[e2e] Step 3–5: kit download + pnpm install + next build");
  materializeKit();
  npmInstallAndBuild();

  console.log("[e2e] Step 6–8: production servers + HTTP probes");
  const fsServer = await startProductionServer(3801, {
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
    VERCEL: "",
  });
  try {
    await probeWorkspaceApi(fsServer.base, { writable: true });
    await probeOrchestrationGraph(fsServer.base);
    console.log("  3801 filesystem probes: OK");
  } finally {
    fsServer.child.kill("SIGTERM");
    await sleep(400);
  }

  const roServer = await startProductionServer(3803, {
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "false",
    VERCEL: "1",
  });
  try {
    await probeWorkspaceApi(roServer.base, { writable: false });
    console.log("  3803 read-only probes: OK");
  } finally {
    roServer.child.kill("SIGTERM");
  }

  console.log("[e2e] ALL PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
