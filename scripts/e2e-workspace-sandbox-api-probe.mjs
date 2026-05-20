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

  process.stdout.write("[e2e] npm install (workspace app)…\n");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: tmp,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  assert(ni.status === 0, "npm install failed");

  process.stdout.write(`[e2e] starting next dev on :${port}…\n`);
  const devEnv = {
    ...process.env,
    NODE_ENV: "development",
    WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
    PORT: String(port),
  };
  delete devEnv.OPENAI_API_KEY;
  delete devEnv.OPENAI;
  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: tmp,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: devEnv,
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

    // --- Positive: PATCH openai-responses intelligenceAdapterMode (helper setup row) ---
    const openaiModePatch = await fetch(`${base}/api/workspace`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataModel: {
          objects: [
            sandboxObject([
              emptyRow({
                Name: "helper-openai-row",
                adapter: "local-intelligence",
                localModel: "gpt-5.2",
                localEndpoint: "https://api.openai.com/v1/responses",
                intelligenceAdapterMode: "openai-responses",
                authRef: "OPENAI",
              }),
            ]),
          ],
        },
      }),
    });
    assert(
      openaiModePatch.status === 200,
      `expected 200 for openai-responses PATCH, got ${openaiModePatch.status} ${await openaiModePatch.text()}`,
    );

    // --- Helper query: openai-responses without server API key (no secret leakage) ---
    const helperNoKey = await fetch(`${base}/api/workspace/helper/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "explain",
        userPrompt: "Explain this workspace in one sentence.",
        adapterMode: "openai-responses",
        model: "gpt-5.2",
        localEndpoint: "",
      }),
    });
    const helperNoKeyJson = await helperNoKey.json();
    const helperNoKeyRaw = JSON.stringify(helperNoKeyJson);
    assert(helperNoKeyJson.ok === false, "helper/query must return ok:false without OPENAI_API_KEY");
    assert(
      String(helperNoKeyJson.error || "").toLowerCase().includes("openai api key"),
      `expected setup error mentioning API key, got: ${helperNoKeyJson.error}`,
    );
    assert(!helperNoKeyRaw.includes("sk-"), "helper error must not leak API key material");
    assert(
      helperNoKeyJson.receipts?.adapterMode === "openai-responses",
      `receipts.adapterMode expected openai-responses, got ${helperNoKeyJson.receipts?.adapterMode}`,
    );
    assert(!helperNoKeyRaw.includes("OPENAI_API_KEY="), "response must not echo env var assignment");

    // --- Helper query: invalid intent rejected before adapter ---
    const helperBadIntent = await fetch(`${base}/api/workspace/helper/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "not-a-valid-intent",
        userPrompt: "test",
        adapterMode: "openai-responses",
      }),
    });
    const helperBadIntentJson = await helperBadIntent.json();
    assert(helperBadIntentJson.ok === false, "invalid intent must return ok:false");
    assert(
      String(helperBadIntentJson.error || "").includes("intent must be one of"),
      `invalid intent error must list allowed intents, got: ${helperBadIntentJson.error}`,
    );

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
