#!/usr/bin/env node
/**
 * Customer-export probe: kit download tree + helper openai-responses HTTP checks.
 *
 * Usage:
 *   EXPORT_ROOT=/tmp/gh-template-gallery-test node scripts/e2e-workspace-helper-export-probe.mjs
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportRoot = process.env.EXPORT_ROOT?.trim()
  || "/tmp/gh-template-gallery-test";
const workspaceApp = path.join(exportRoot, "apps/workspace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function waitForHttpReady(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url, { cache: "no-store" })
        .then((res) => {
          if (res.status > 0) resolve();
          else if (Date.now() - started > timeoutMs) reject(new Error(`timeout waiting for ${url}`));
          else setTimeout(tick, 400);
        })
        .catch(() => {
          if (Date.now() - started > timeoutMs) reject(new Error(`timeout waiting for ${url}`));
          else setTimeout(tick, 400);
        });
    };
    tick();
  });
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function main() {
  assert(fs.existsSync(workspaceApp), `missing exported apps/workspace at ${workspaceApp}`);

  const src = path.join(workspaceApp, "lib/adapters/sandboxes/default-local-intelligence.js");
  const srcText = fs.readFileSync(src, "utf8");
  assert(srcText.includes("openai-responses"), "export missing openai-responses adapter branch");

  const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : await pickPort();
  const base = `http://127.0.0.1:${port}`;

  const devEnv = {
    ...process.env,
    NODE_ENV: "development",
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
    PORT: String(port),
  };
  delete devEnv.OPENAI_API_KEY;
  delete devEnv.OPENAI;

  process.stdout.write(`[export-e2e] starting next dev on :${port} (customer export)…\n`);
  const dev = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
    cwd: workspaceApp,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: devEnv,
  });
  dev.unref();

  try {
    await waitForHttpReady(`${base}/api/workspace`);

    const helperRes = await fetch(`${base}/api/workspace/helper/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "explain",
        userPrompt: "Explain governed workspace helper behavior.",
        adapterMode: "openai-responses",
        model: "gpt-5.2",
      }),
    });
    const helperJson = await helperRes.json();
    const raw = JSON.stringify(helperJson);
    assert(helperJson.ok === false, "export tree helper must fail without API key");
    assert(String(helperJson.error || "").toLowerCase().includes("openai api key"), helperJson.error);
    assert(helperJson.receipts?.adapterMode === "openai-responses", raw);
    assert(!raw.includes("sk-"), "must not leak secrets");

    const sandboxColumns = [
      "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId",
      "runtime", "adapter", "agentHost", "localModel", "localEndpoint",
      "intelligenceAdapterMode", "envRefs", "networkAllow", "allowList",
      "instructions", "command", "timeoutMs", "status", "lastTested",
      "lastRunId", "lastSourceId", "lastResponse",
    ];
    const patchRes = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [{
            id: "sandboxes-export",
            label: "Sandboxes",
            source: "Sandboxes",
            objectType: "sandbox-environment",
            icon: "Terminal",
            columns: sandboxColumns,
            rows: [{
              Name: "export-openai",
              lifecycleStatus: "draft",
              version: "1",
              runLocality: "local",
              schedulerRegistryId: "",
              runtime: "node",
              adapter: "local-intelligence",
              agentHost: "",
              localModel: "gpt-5.2",
              localEndpoint: "https://api.openai.com/v1/responses",
              intelligenceAdapterMode: "openai-responses",
              authRef: "OPENAI",
              envRefs: "",
              networkAllow: "false",
              allowList: "",
              instructions: "",
              command: "",
              timeoutMs: "15000",
              status: "",
              lastTested: "",
              lastRunId: "",
              lastSourceId: "",
              lastResponse: "",
            }],
            binding: { mode: "manual", source: "Data Model" },
            relations: [],
            fieldSettings: { hidden: [], order: sandboxColumns },
          }],
        },
      }),
    });
    assert(patchRes.status === 200, `PATCH openai-responses row expected 200, got ${patchRes.status}`);

    process.stdout.write("[export-e2e] customer export helper probes OK\n");
  } finally {
    try { dev.kill("SIGTERM"); } catch { /* ignore */ }
    spawnSync("sh", ["-c", `pkill -f "next dev -p ${port}" 2>/dev/null || true`], { stdio: "ignore" });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
