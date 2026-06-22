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
 *   node scripts/e2e-workspace-sandbox-api-probe.mjs
 *   PORT=3999 node scripts/e2e-workspace-sandbox-api-probe.mjs
 *
 * Sandbox rows are written with **PATCH /api/workspace** (`dataModel` only — there is no separate
 * sandbox PATCH route). **POST /api/workspace/sandbox-run** executes the persisted row; the Data Model
 * drawer / grid read the same `growthub.config.json` the probes mutate.
 *
 * Temp app + npm install live under `${TMPDIR:-/tmp}/growthub-cli-demo/e2e-workspace-sandbox/`.
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

    // Live workflow graphs are publish-owned: direct PATCH of
    // orchestrationGraph / orchestrationConfig is policy-blocked (422). The
    // governed path is draft save → sandbox-run useDraft:true → attestation →
    // POST /api/workspace/workflow/publish. This section exercises that loop.
    const swarmDraftSerialized = JSON.stringify(swarmGraph);
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
                orchestrationDraftConfig: swarmDraftSerialized,
                orchestrationDraftStatus: "untested",
              }),
            ]),
          ],
        },
      }),
    });
    assert(swarmPatch.status === 200, `PATCH for swarm draft row expected 200, got ${swarmPatch.status} ${await swarmPatch.text()}`);

    // Stale pattern must be rejected: direct PATCH of the live graph → 422.
    const staleLivePatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({ Name: "api-probe-row", adapter: "local-process", runtime: "bash", command: "echo orchestrator-ok" }),
              emptyRow({
                Name: "swarm-probe-row",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runtime: "node",
                orchestrationGraph: swarmDraftSerialized,
              }),
            ]),
          ],
        },
      }),
    });
    assert(staleLivePatch.status === 422, `direct live-graph PATCH must be policy-rejected with 422, got ${staleLivePatch.status}`);

    // Draft test run (server stamps orchestrationDraftLastRunId + run record).
    const draftRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-probe-row", useDraft: true }),
    });
    const draftRunJson = await draftRun.json();
    assert(draftRunJson.ok === true, `draft swarm run must pass via stub adapter, got ${JSON.stringify(draftRunJson).slice(0, 300)}`);

    // Premature publish must fail: draft has no attestation yet.
    const earlyPublish = await fetch(`${base}/api/workspace/workflow/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-probe-row" }),
    });
    assert(earlyPublish.status === 409, `publish before attestation must 409, got ${earlyPublish.status}`);

    // Attestation: merge draft test stamps onto the CURRENT persisted rows so
    // the server-stamped orchestrationDraftLastRunId survives the round-trip.
    const cfgNow = await (await fetch(`${base}/api/workspace`)).json();
    const mergedObjects = (cfgNow.workspaceConfig.dataModel?.objects || []).map((object) => {
      if (object?.id !== "sandboxes-e2e") return object;
      return {
        ...object,
        rows: (object.rows || []).map((row) =>
          String(row?.Name || "") === "swarm-probe-row"
            ? { ...row, orchestrationDraftTestPassed: true, orchestrationDraftTestedConfig: swarmDraftSerialized }
            : row,
        ),
      };
    });
    const attestPatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: { ...cfgNow.workspaceConfig.dataModel, objects: mergedObjects } }),
    });
    assert(attestPatch.status === 200, `attestation PATCH expected 200, got ${attestPatch.status} ${await attestPatch.text()}`);

    // Server-authoritative publish: verifies attestation AND run lineage.
    const publishRes = await fetch(`${base}/api/workspace/workflow/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-probe-row" }),
    });
    const publishJson = await publishRes.json();
    assert(publishRes.status === 200 && publishJson.ok === true, `publish expected ok, got ${publishRes.status} ${JSON.stringify(publishJson).slice(0, 300)}`);
    assert(typeof publishJson.publishedSha256 === "string" && publishJson.publishedSha256.length === 64, "publish must return the published config sha256");

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

    // Negative-path: ai-agent cannot fall back to local-process. Exercised
    // through a draft run with an inline draftGraph (the governed lane for
    // unpublished graphs) — live graphs only ever exist via publish.
    const cfgForGate = await (await fetch(`${base}/api/workspace`)).json();
    const gateObjects = (cfgForGate.workspaceConfig.dataModel?.objects || []).map((object) => {
      if (object?.id !== "sandboxes-e2e") return object;
      return {
        ...object,
        rows: [
          ...(object.rows || []),
          emptyRow({ Name: "swarm-gate-row", adapter: "local-process", runtime: "bash" }),
        ],
      };
    });
    const swarmCodeExecGate = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: { ...cfgForGate.workspaceConfig.dataModel, objects: gateObjects } }),
    });
    assert(swarmCodeExecGate.status === 200, "PATCH swarm-gate-row should validate");
    const swarmGateRun = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "swarm-gate-row", useDraft: true, draftGraph: swarmGraph }),
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
