#!/usr/bin/env node
/**
 * Real HTTP probes against the governed workspace API + sandbox-run route.
 *
 * Materializes a temp copy of the bundled custom-workspace Next app (the same
 * tree `create-growthub-local --profile workspace` installs under apps/workspace),
 * runs `next dev`, then drives PATCH /api/workspace and POST /api/workspace/sandbox-run.
 *
 * Optional: if cli/dist/index.js exists (demo / release layout), prints its --version.
 *
 * Usage (from repo root) — **canonical** (no monorepo `pnpm build`; no fake smoke):
 *   bash scripts/demo-cli.sh e2e-workspace-sandbox
 *   # or:
 *   node scripts/e2e-workspace-sandbox-api-probe.mjs
 *   PORT=3999 node scripts/e2e-workspace-sandbox-api-probe.mjs
 *
 * Sandbox rows are written with **PATCH /api/workspace** (`dataModel` only — there is no separate
 * sandbox PATCH route). **POST /api/workspace/sandbox-run** executes the persisted row; the Data Model
 * drawer / grid read the same `growthub.config.json` the probes mutate.
 *
 * Temp app + npm install live under `${CLI_DEMO_HOME:-$TMPDIR/growthub-cli-demo}/e2e-workspace-sandbox/`
 * when invoked via `demo-cli.sh` (free preview profile).
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROWSER_SMOKE_COMMAND,
  BROWSER_SMOKE_GRAPH,
  BROWSER_SMOKE_RUN_INPUTS,
} from "./lib/workspace-feature-seed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitWorkspace = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

const sandboxColumns = [
  "Name",
  "lifecycleStatus",
  "version",
  "runLocality",
  "schedulerRegistryId",
  "runtime",
  "adapter",
  "agentHost",
  "localModel",
  "localEndpoint",
  "intelligenceAdapterMode",
  "envRefs",
  "networkAllow",
  "allowList",
  "instructions",
  "command",
  "timeoutMs",
  "status",
  "lastTested",
  "lastRunId",
  "lastSourceId",
  "lastResponse",
];

const sandboxRelations = [
  {
    id: "scheduler-registry-binding",
    name: "Scheduler (serverless)",
    field: "schedulerRegistryId",
    targetObjectType: "api-registry",
    type: "belongs-to",
    description:
      "When runLocality is serverless, POST /api/workspace/sandbox-run sends growthub-sandbox-run-v1 to this API Registry record (METHOD, baseUrl, endpoint, authRef resolved server-side). Use for Supabase Edge URL, QStash forwarder, Vercel-exposed webhook, cron targets, etc.",
  },
];

function emptyRow(overrides = {}) {
  return {
    Name: "api-probe-row",
    lifecycleStatus: "draft",
    version: "1",
    runLocality: "local",
    schedulerRegistryId: "",
    runtime: "node",
    adapter: "local-process",
    agentHost: "",
    localModel: "",
    localEndpoint: "",
    intelligenceAdapterMode: "ollama",
    envRefs: "",
    networkAllow: "false",
    allowList: "",
    instructions: "",
    command: "echo ok",
    timeoutMs: "15000",
    status: "",
    lastTested: "",
    lastRunId: "",
    lastSourceId: "",
    lastResponse: "",
    ...overrides,
  };
}

function sandboxObject(rows) {
  return {
    id: "sandboxes-e2e",
    label: "Sandboxes",
    source: "Sandboxes",
    objectType: "sandbox-environment",
    icon: "Terminal",
    columns: sandboxColumns,
    rows,
    binding: { mode: "manual", source: "Data Model" },
    relations: sandboxRelations,
    fieldSettings: { hidden: [], order: sandboxColumns },
  };
}

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

async function main() {
  const port =
    process.env.PORT && String(process.env.PORT).trim()
      ? Number(process.env.PORT)
      : await pickFreePort();
  const base = `http://127.0.0.1:${port}`;

  const distCli = path.join(root, "cli/dist/index.js");
  if (fs.existsSync(distCli)) {
    try {
      const v = spawnSync(process.execPath, [distCli, "--version"], { encoding: "utf8" });
      if (v.status === 0) {
        process.stdout.write(`[e2e] cli/dist/index.js --version → ${(v.stdout || "").trim()}\n`);
      } else {
        process.stdout.write(
          `[e2e] cli/dist/index.js exists but --version failed (incomplete install in this sandbox): ${(v.stderr || v.stdout || "").slice(0, 400)}\n`,
        );
      }
    } catch (e) {
      process.stdout.write(`[e2e] cli/dist/index.js probe skipped: ${e.message}\n`);
    }
  } else {
    process.stdout.write(
      "[e2e] cli/dist/index.js missing — build the CLI in a full monorepo checkout to exercise the published entrypoint.\n",
    );
  }

  const profileRoot = process.env.CLI_DEMO_HOME?.trim()
    ? path.resolve(process.env.CLI_DEMO_HOME.trim())
    : path.join(os.tmpdir(), "growthub-cli-demo");
  const demoHome = path.join(profileRoot, "e2e-workspace-sandbox");
  fs.mkdirSync(demoHome, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(demoHome, "ws-copy-"));

  process.stdout.write(`[e2e] Copying starter workspace → ${tmp}\n`);
  fs.cpSync(kitWorkspace, tmp, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes("node_modules"),
  });

  const cfgPath = path.join(tmp, "growthub.config.json");
  const baseCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  baseCfg.dataModel = { objects: [sandboxObject([emptyRow()])] };
  fs.writeFileSync(cfgPath, `${JSON.stringify(baseCfg, null, 2)}\n`, "utf8");

  // Drop a deterministic prompt-capable adapter stub into the drop-zone so the
  // swarm path has a real registered adapter to dispatch through (no real CLI
  // binary required). Registers under "local-agent-host" id to satisfy the
  // PROMPT_CAPABLE_ADAPTERS gate while replacing the spawn-based default.
  const probeStubPath = path.join(tmp, "lib/adapters/sandboxes/adapters/probe-swarm-stub.js");
  fs.writeFileSync(probeStubPath, `import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";
registerSandboxAdapter({
  id: "local-agent-host",
  label: "probe stub (prompt-capable)",
  description: "E2E probe stub — replaces the spawn-based default during automated runs.",
  locality: "local",
  supportedRuntimes: ["node", "bash", "python"],
  supportedHosts: ["claude_local"],
  hostCatalog: { claude_local: { label: "Claude Code (stub)", binary: "claude" } },
  run: async (request) => {
    const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
    const role = request?.env?.GROWTHUB_SWARM_SUBAGENT_ROLE || "subagent";
    if (phase === "orchestrator") {
      return { ok: true, exitCode: 0, durationMs: 1, stdout: "PLAN: probe plan.", stderr: "", adapterMeta: { stub: true } };
    }
    if (phase === "synthesis") {
      return { ok: true, exitCode: 0, durationMs: 1, stdout: "Aggregated answer.\\nOUTCOME_SCORE: 0.91", stderr: "", adapterMeta: { stub: true } };
    }
    return { ok: true, exitCode: 0, durationMs: 1, stdout: \`[\${role}] done\`, stderr: "", adapterMeta: { stub: true } };
  }
});
`, "utf8");

  process.stdout.write("[e2e] npm install (workspace app)…\n");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: tmp,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  assert(ni.status === 0, "npm install failed");

  process.stdout.write(`[e2e] starting next dev on :${port}…\n`);
  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: tmp,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
      PORT: String(port),
    },
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", (c) => process.stderr.write(c));
  dev.unref();

  try {
    await waitForHttpReady(`${base}/api/workspace`);

    // --- Negative: PATCH unknown top-level field ---
    const badPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrations: [] }),
    });
    assert(badPatch.status === 400, `expected 400 for unknown patch field, got ${badPatch.status}`);
    const badJson = await badPatch.json();
    assert(String(badJson.error || "").includes("unknown"), "expected unknown-fields error body");

    // --- Negative: PATCH invalid intelligenceAdapterMode ---
    const badEnum = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [sandboxObject([emptyRow({ intelligenceAdapterMode: "not-a-real-mode" })])],
        },
      }),
    });
    assert(badEnum.status === 400, `expected 400 for invalid intelligenceAdapterMode, got ${badEnum.status}`);

    // --- Positive: PATCH valid local-intelligence row (model + endpoint) ---
    const goodPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                adapter: "local-intelligence",
                localModel: "gemma3:4b",
                localEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
                intelligenceAdapterMode: "ollama",
                instructions: "You reply with a single JSON object per system rules.",
                command: "List one proposed toolIntent with toolSlug video-generation or empty array if unsure.",
              }),
            ]),
          ],
        },
      }),
    });
    assert(goodPatch.status === 200, `expected 200 for valid PATCH, got ${goodPatch.status} ${await goodPatch.text()}`);

    // --- Positive: GET /api/workspace round-trip (same surface the sidecar / UI consume) ---
    const getCfg = await fetch(`${base}/api/workspace`, { cache: "no-store" });
    assert(getCfg.ok, `GET /api/workspace expected 2xx, got ${getCfg.status}`);
    const getPayload = await getCfg.json();
    const objects = getPayload.workspaceConfig?.dataModel?.objects || [];
    const sandObj = objects.find((o) => o.id === "sandboxes-e2e");
    assert(sandObj, "GET workspaceConfig must include sandboxes-e2e object after PATCH");
    const probeRow = (sandObj.rows || []).find((r) => String(r.Name || "").trim() === "api-probe-row");
    assert(probeRow, "GET must return api-probe-row");
    assert(
      String(probeRow.adapter || "").trim() === "local-intelligence",
      `GET row.adapter expected local-intelligence, got ${probeRow.adapter}`,
    );
    assert(String(probeRow.localModel || "").includes("gemma"), "GET row.localModel must echo PATCH");

    // --- Negative: POST sandbox-run for unknown row name (customer-safe 404) ---
    const missingRow = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "definitely-not-a-row" }),
    });
    assert(missingRow.status === 404, `expected 404 for unknown sandbox row, got ${missingRow.status}`);
    const missingJson = await missingRow.json();
    assert(String(missingJson.error || "").includes("no sandbox row"), "404 body should name missing row");

    // --- Adapter catalog includes local-intelligence ---
    const adaptersRes = await fetch(`${base}/api/workspace/sandbox-adapters`);
    assert(adaptersRes.ok, `sandbox-adapters GET failed ${adaptersRes.status}`);
    const adaptersJson = await adaptersRes.json();
    const ids = (adaptersJson.adapters || []).map((a) => a.id);
    assert(ids.includes("local-intelligence"), `expected local-intelligence in adapters, got ${ids.join(",")}`);

    // --- Negative: serverless + local-intelligence must be rejected at POST ---
    const srvlessPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                Name: "api-probe-row",
                adapter: "local-intelligence",
                localModel: "gemma3:4b",
                localEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
                intelligenceAdapterMode: "ollama",
                instructions: "You reply with a single JSON object per system rules.",
                command: "List one proposed toolIntent with toolSlug video-generation or empty array if unsure.",
              }),
              emptyRow({
                Name: "serverless-bad",
                runLocality: "serverless",
                schedulerRegistryId: "any-non-empty",
                adapter: "local-intelligence",
                localModel: "x",
              }),
            ]),
          ],
        },
      }),
    });
    assert(srvlessPatch.status === 200, "PATCH serverless row should validate (registry id string present)");

    const badRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "serverless-bad" }),
    });
    const badRunJson = await badRun.json();
    assert(
      badRun.status === 400 && String(badRunJson.error || "").includes("local-intelligence"),
      `expected 400 serverless+local-intelligence error, got ${badRun.status} ${JSON.stringify(badRunJson)}`,
    );

    // --- Positive / real-world: POST local-intelligence (Ollama may be down) ---
    const runRes = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "api-probe-row" }),
    });
    const runJson = await runRes.json();
    assert(runJson && typeof runJson === "object", "sandbox-run must return JSON object");
    assert(runJson.response, "sandbox-run must include response envelope");
    const stdout = String(runJson.response?.stdout || "");
    if (runJson.ok === true) {
      assert(stdout.includes("growthub-local-model-sandbox-v1"), "stdout should contain sandbox envelope version");
      process.stdout.write("[e2e] sandbox-run: OK (local model responded)\n");
    } else {
      assert(
        stdout.length > 0 || String(runJson.response?.error || "").length > 0,
        "expected stderr/stdout or error when backend fails",
      );
      process.stdout.write(
        `[e2e] sandbox-run: expected failure without local Ollama (ok=${runJson.ok}, error=${runJson.response?.error || "n/a"})\n`,
      );
    }

    // --- Positive: agent-swarm-v1 graph round-trip + swarm dispatch ---
    const swarmGraph = {
      version: 1,
      provider: "growthub-native",
      executionMode: "agent-swarm-v1",
      swarm: {
        maxConcurrency: 2,
        rewardWeights: { parallel: 0.25, finish: 0.35, outcome: 0.4 },
        outcomeCriteria: "All required subagents complete."
      },
      nodes: [
        {
          id: "orchestrator",
          type: "thinAdapter",
          label: "Orchestrator",
          sandbox: "orchestrator",
          config: { executionPolicy: "parallel", prompt: "Plan the swarm.", outputKey: "plan" }
        },
        {
          id: "subagent-alpha",
          type: "ai-agent",
          label: "Alpha",
          config: { role: "Alpha", taskPrompt: "do alpha", required: true }
        },
        {
          id: "subagent-beta",
          type: "ai-agent",
          label: "Beta",
          config: { role: "Beta", taskPrompt: "do beta", required: true }
        },
        {
          id: "synthesis",
          type: "tool-result",
          label: "Final synthesis",
          config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, outputMode: "swarm-summary" }
        }
      ],
      edges: [
        { from: "orchestrator", to: "subagent-alpha", passes: "subtask-assignment" },
        { from: "orchestrator", to: "subagent-beta", passes: "subtask-assignment" },
        { from: "subagent-alpha", to: "synthesis", passes: "subtask-result" },
        { from: "subagent-beta", to: "synthesis", passes: "subtask-result" }
      ]
    };

    const swarmPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                Name: "api-probe-row",
                adapter: "local-process",
                runtime: "bash",
                command: "echo orchestrator-ok"
              }),
              emptyRow({
                Name: "swarm-probe-row",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runtime: "node",
                command: "",
                instructions: "Swarm orchestrator instructions.",
                orchestrationGraph: JSON.stringify(swarmGraph),
              }),
            ]),
          ],
        },
      }),
    });
    assert(swarmPatch.status === 200, `PATCH for swarm row expected 200, got ${swarmPatch.status} ${await swarmPatch.text()}`);

    const swarmRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-probe-row" }),
    });
    const swarmRunJson = await swarmRun.json();
    assert(swarmRunJson && typeof swarmRunJson === "object", "swarm sandbox-run must return JSON");
    assert(swarmRunJson.response, "swarm sandbox-run must include response envelope");
    assert(
      swarmRunJson.adapter === "orchestration-agent-swarm",
      `expected adapter orchestration-agent-swarm, got ${swarmRunJson.adapter}`,
    );
    const swarmPayload = swarmRunJson.response?.swarm;
    assert(swarmPayload, "swarm response must include swarm block");
    assert(Array.isArray(swarmPayload.tasks) && swarmPayload.tasks.length === 2, `expected 2 swarm tasks, got ${swarmPayload?.tasks?.length}`);
    assert(swarmPayload.reward && typeof swarmPayload.reward === "object", "swarm.reward must be present");
    assert(Number.isFinite(Number(swarmPayload.reward.score)), "swarm.reward.score must be a number");
    assert(
      swarmPayload.reward.kind === "evaluated-v1",
      `expected reward.kind=evaluated-v1 from synthesizer OUTCOME_SCORE, got ${swarmPayload.reward.kind}`,
    );
    assert(
      swarmPayload.orchestrator?.status === "completed",
      `expected orchestrator phase completed, got ${swarmPayload.orchestrator?.status}`,
    );
    assert(
      swarmPayload.synthesis?.parsedOutcomeScore != null,
      "synthesis must include parsed OUTCOME_SCORE",
    );
    assert(
      swarmPayload.tasks.every((t) => t.adapter === "local-agent-host"),
      `every task must dispatch through local-agent-host, got ${swarmPayload.tasks.map((t) => t.adapter).join(",")}`,
    );
    assert(
      Array.isArray(swarmRunJson.response.logTree) && swarmRunJson.response.logTree[0]?.id === "swarm-root",
      "swarm response must carry the logTree rooted at swarm-root",
    );

    // Negative-path: ai-agent cannot fall back to local-process
    const swarmCodeExecGate = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                Name: "api-probe-row",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runtime: "node",
              }),
              emptyRow({
                Name: "swarm-probe-row",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runtime: "node",
                orchestrationGraph: JSON.stringify(swarmGraph),
              }),
              emptyRow({
                Name: "swarm-gate-row",
                adapter: "local-process",
                runtime: "bash",
                orchestrationGraph: JSON.stringify(swarmGraph),
              }),
            ]),
          ],
        },
      }),
    });
    assert(swarmCodeExecGate.status === 200, "PATCH swarm-gate-row should validate");
    const swarmGateRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-gate-row" }),
    });
    const swarmGateJson = await swarmGateRun.json();
    assert(
      swarmGateJson.adapter === "orchestration-agent-swarm",
      `expected orchestration-agent-swarm adapter even on gate-fail, got ${swarmGateJson.adapter}`,
    );
    assert(swarmGateJson.ok === false, "swarm on local-process row must fail at adapter-gate");
    assert(
      swarmGateJson.response?.adapterMeta?.phaseFailed === "orchestrator",
      `gate-fail must short-circuit at orchestrator phase, got ${swarmGateJson.response?.adapterMeta?.phaseFailed}`,
    );

    const swarmHistory = await fetch(`${base}/api/workspace/sandbox-run?objectId=sandboxes-e2e&name=swarm-probe-row`);
    const swarmHistoryJson = await swarmHistory.json();
    assert(swarmHistoryJson.ok && Array.isArray(swarmHistoryJson.records), "swarm history must be present");
    assert(swarmHistoryJson.records.length >= 1, "swarm history must have at least one record");

    process.stdout.write(`[e2e] swarm probe: ${swarmPayload.tasks.length} tasks, reward ${swarmPayload.reward.kind} score ${swarmPayload.reward.score}\n`);

    // --- Browser / local agent fast lane: input-schema-only graph + local-process command ---
    // The human-input graph node declares the safe manual run-input contract;
    // execution falls through to the row's command via the existing adapter
    // path. Same sandbox-run route, same receipts — no parallel contract.
    const browserPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                Name: "api-probe-row",
                adapter: "local-process",
                runtime: "bash",
                command: "echo orchestrator-ok",
              }),
              emptyRow({
                Name: "browser-agent-smoke",
                adapter: "local-process",
                runtime: "node",
                networkAllow: "true",
                allowList: "notebooklm.google.com,linkedin.com,medium.com",
                instructions: "Run a safe browser/local-agent smoke using runInputs. Do not mutate external systems.",
                command: BROWSER_SMOKE_COMMAND,
                timeoutMs: "120000",
                browserMode: "operator-approved",
                requiresBrowser: "true",
                orchestrationConfig: JSON.stringify(BROWSER_SMOKE_GRAPH),
              }),
            ]),
          ],
        },
      }),
    });
    assert(browserPatch.status === 200, `PATCH browser fast-lane row expected 200, got ${browserPatch.status} ${await browserPatch.text()}`);

    // Negative: required run inputs missing entirely → customer-safe 400
    const browserNoInputs = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "browser-agent-smoke" }),
    });
    const browserNoInputsJson = await browserNoInputs.json();
    assert(browserNoInputs.status === 400, `expected 400 without runInputs, got ${browserNoInputs.status}`);
    assert(
      Array.isArray(browserNoInputsJson.missingFields)
        && browserNoInputsJson.missingFields.includes("platform")
        && browserNoInputsJson.missingFields.includes("operatorApproved"),
      `400 must name missing required fields, got ${JSON.stringify(browserNoInputsJson.missingFields)}`,
    );

    // Negative: partial run inputs → 400 listing the remaining required fields
    const browserPartial = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: "sandboxes-e2e",
        name: "browser-agent-smoke",
        runInputs: { kind: "growthub-workflow-run-inputs-v1", source: "manual-smoke", values: { platform: "notebooklm" } },
      }),
    });
    const browserPartialJson = await browserPartial.json();
    assert(browserPartial.status === 400, `expected 400 for partial runInputs, got ${browserPartial.status}`);
    assert(
      Array.isArray(browserPartialJson.missingFields)
        && browserPartialJson.missingFields.includes("targetName")
        && browserPartialJson.missingFields.includes("sendMode"),
      `partial 400 must list remaining required fields, got ${JSON.stringify(browserPartialJson.missingFields)}`,
    );

    // Positive: full safe run inputs → receipt with inputSummary + truthful proof
    const browserRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectId: "sandboxes-e2e",
        name: "browser-agent-smoke",
        runInputs: BROWSER_SMOKE_RUN_INPUTS,
      }),
    });
    const browserRunJson = await browserRun.json();
    assert(browserRun.status === 200, `browser fast-lane run expected 200, got ${browserRun.status} ${JSON.stringify(browserRunJson)}`);
    assert(browserRunJson.ok === true && browserRunJson.status === "connected", `expected connected run, got ${JSON.stringify({ ok: browserRunJson.ok, status: browserRunJson.status })}`);
    assert(browserRunJson.exitCode === 0, `expected exitCode 0, got ${browserRunJson.exitCode}`);

    const browserSummary = browserRunJson.response?.inputSummary;
    assert(browserSummary && browserSummary.source === "manual-smoke", `inputSummary.source expected manual-smoke, got ${JSON.stringify(browserSummary)}`);
    const expectedFieldIds = ["interest", "operatorApproved", "platform", "profileUrl", "sendMode", "targetName"];
    assert(
      JSON.stringify([...(browserSummary.fieldIds || [])].sort()) === JSON.stringify(expectedFieldIds),
      `inputSummary.fieldIds mismatch: ${JSON.stringify(browserSummary.fieldIds)}`,
    );
    assert(!JSON.stringify(browserSummary).includes("The Melting Bar"), "inputSummary must carry field ids only — never values");

    const browserProofStdout = JSON.parse(String(browserRunJson.response?.stdout || "{}"));
    assert(browserProofStdout.browser?.platform === "notebooklm", `proof platform expected notebooklm, got ${browserProofStdout.browser?.platform}`);
    assert(browserProofStdout.browser?.reachedTarget === false, "CI smoke must stay truthful — reachedTarget false without a live browser");
    assert(browserProofStdout.fallbackUsed === true, "CI smoke must report fallbackUsed true");
    assert(
      JSON.stringify(browserProofStdout.receivedFieldIds) === JSON.stringify(expectedFieldIds),
      `local process must receive run inputs via GROWTHUB_SANDBOX_RUN_INPUTS, got ${JSON.stringify(browserProofStdout.receivedFieldIds)}`,
    );

    // Row stamps + source-record history through the same governed surfaces
    const browserCfg = await (await fetch(`${base}/api/workspace`, { cache: "no-store" })).json();
    const browserRow = (browserCfg.workspaceConfig?.dataModel?.objects || [])
      .find((o) => o.id === "sandboxes-e2e")?.rows
      ?.find((r) => String(r.Name || "").trim() === "browser-agent-smoke");
    assert(browserRow, "browser-agent-smoke row must persist");
    assert(browserRow.lastRunId === browserRunJson.runId, `row.lastRunId expected ${browserRunJson.runId}, got ${browserRow.lastRunId}`);
    assert(browserRow.lastSourceId === browserRunJson.sourceId, `row.lastSourceId expected ${browserRunJson.sourceId}, got ${browserRow.lastSourceId}`);
    assert(browserRow.status === "connected", `row.status expected connected, got ${browserRow.status}`);

    const browserHistory = await (await fetch(`${base}/api/workspace/sandbox-run?objectId=sandboxes-e2e&name=browser-agent-smoke`)).json();
    assert(browserHistory.ok && Array.isArray(browserHistory.records) && browserHistory.records.length >= 1, "browser fast-lane history must persist");
    assert(browserHistory.records[0]?.inputSummary?.fieldCount === 6, `history record must carry inputSummary, got ${JSON.stringify(browserHistory.records[0]?.inputSummary)}`);

    process.stdout.write(`[e2e] browser fast lane: run ${browserRunJson.runId} connected, inputSummary ${browserSummary.fieldCount} fields, truthful proof persisted\n`);

    process.stdout.write("[e2e] all API probes completed successfully.\n");
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
