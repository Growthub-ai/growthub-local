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
 * Also exercises **GET /api/workspace/distillation-traces** (SFT `messages[]` export from
 * `growthub.source-records.json`), then **exports** `growthub.config.json` +
 * `growthub.source-records.json` into a fresh temp copy and re-probes the same HTTP surface
 * (workspace artifact round-trip).
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

  let dev2 = null;
  let cleanupPort2 = null;

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

    // --- Distillation corpus: deterministic local-process row + GET export API ---
    const distillPatch = await fetch(`${base}/api/workspace`, {
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
                Name: "dist-trace-row",
                adapter: "local-process",
                runtime: "node",
                instructions:
                  "ICP: B2B operators adopting governed AI workspaces (AWaC). Output JSON only with bantScore and followUp.",
                command:
                  'console.log(JSON.stringify({bantScore:7,followUp:"Schedule technical scoping - AWaC distillation track"}));',
              }),
            ]),
          ],
        },
      }),
    });
    assert(distillPatch.status === 200, `distill PATCH expected 200, got ${distillPatch.status}`);

    const runDist = await fetch(`${base}/api/workspace/sandbox-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: "sandboxes-e2e", name: "dist-trace-row" }),
    });
    const runDistJson = await runDist.json();
    assert(runDistJson.ok === true, `dist-trace sandbox-run must succeed, got ${JSON.stringify(runDistJson)}`);
    assert(runDistJson.persisted === true, "dist-trace sandbox-run must persist to source-records sidecar");

    const sidecarPath = path.join(tmp, "growthub.source-records.json");
    assert(fs.existsSync(sidecarPath), "growthub.source-records.json must exist after persisted run");

    const dtUrl = new URL(`${base}/api/workspace/distillation-traces`);
    dtUrl.searchParams.set("objectId", "sandboxes-e2e");
    dtUrl.searchParams.set("name", "dist-trace-row");
    dtUrl.searchParams.set("role", "sdr-qualification");
    dtUrl.searchParams.set("format", "json");
    const dtRes = await fetch(dtUrl, { cache: "no-store" });
    assert(dtRes.ok, `distillation-traces GET failed ${dtRes.status}`);
    const dtJson = await dtRes.json();
    assert(dtJson.ok === true, "distillation-traces must return ok: true");
    assert(dtJson.traceCount >= 1, "expected at least one gold trace from dist-trace-row");
    assert(dtJson.traces[0].role === "sdr-qualification", "role query param must echo on trace");
    const msg0 = dtJson.messagesExamples[0];
    assert(Array.isArray(msg0?.messages) && msg0.messages.length === 3, "messagesExamples must be chat-shaped");
    assert(msg0.messages[0].role === "system" && msg0.messages[2].role === "assistant", "SFT message roles");

    const ndUrl = new URL(`${base}/api/workspace/distillation-traces`);
    ndUrl.searchParams.set("objectId", "sandboxes-e2e");
    ndUrl.searchParams.set("name", "dist-trace-row");
    ndUrl.searchParams.set("format", "ndjson");
    const ndRes = await fetch(ndUrl, { cache: "no-store" });
    assert(ndRes.ok, `distillation ndjson GET failed ${ndRes.status}`);
    const ndCt = (ndRes.headers.get("content-type") || "").toLowerCase();
    assert(ndCt.includes("ndjson"), `expected ndjson content-type, got ${ndCt}`);
    const ndLines = (await ndRes.text()).trim().split("\n").filter(Boolean);
    assert(ndLines.length >= 1, "ndjson must have ≥1 line");
    const parsedNd = JSON.parse(ndLines[ndLines.length - 1]);
    assert(parsedNd.messages?.[1]?.role === "user", "ndjson line must parse as chat example");

    const allScope = await fetch(`${base}/api/workspace/distillation-traces?scope=all&format=json`, {
      cache: "no-store",
    });
    assert(allScope.ok, `scope=all distillation GET failed ${allScope.status}`);
    const allJson = await allScope.json();
    assert(allJson.traceCount >= 1, "scope=all must include dist-trace receipts");

    // --- Export workspace artifacts → fresh install → same distillation API ---
    const exportDir = fs.mkdtempSync(path.join(demoHome, "ws-export-"));
    fs.copyFileSync(cfgPath, path.join(exportDir, "growthub.config.json"));
    fs.copyFileSync(sidecarPath, path.join(exportDir, "growthub.source-records.json"));
    process.stdout.write(`[e2e] exported workspace snapshot → ${exportDir}\n`);

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

    const port2 = await pickFreePort();
    cleanupPort2 = port2;
    const base2 = `http://127.0.0.1:${port2}`;
    const tmp2 = fs.mkdtempSync(path.join(demoHome, "ws-reimport-"));
    fs.cpSync(kitWorkspace, tmp2, {
      recursive: true,
      filter: (src) => !src.split(path.sep).includes("node_modules"),
    });
    fs.copyFileSync(path.join(exportDir, "growthub.config.json"), path.join(tmp2, "growthub.config.json"));
    fs.copyFileSync(path.join(exportDir, "growthub.source-records.json"), path.join(tmp2, "growthub.source-records.json"));

    process.stdout.write("[e2e] npm install (reimported workspace)…\n");
    const ni2 = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: tmp2,
      stdio: "inherit",
      env: { ...process.env, CI: "1" },
    });
    assert(ni2.status === 0, "npm install (reimport) failed");

    process.stdout.write(`[e2e] starting next dev (reimport) on :${port2}…\n`);
    dev2 = spawn("npx", ["next", "dev", "-p", String(port2)], {
      cwd: tmp2,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: "development",
        WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true",
        PORT: String(port2),
      },
    });
    dev2.stdout?.on("data", () => {});
    dev2.stderr?.on("data", (c) => process.stderr.write(c));
    dev2.unref();

    await waitForHttpReady(`${base2}/api/workspace`);

    const dtRe = await fetch(
      `${base2}/api/workspace/distillation-traces?objectId=sandboxes-e2e&name=dist-trace-row&format=json`,
      { cache: "no-store" },
    );
    assert(dtRe.ok, `reimport distillation-traces GET failed ${dtRe.status}`);
    const dtReJson = await dtRe.json();
    assert(dtReJson.traceCount === dtJson.traceCount, "reimport must preserve trace count from export");

    const allRe = await fetch(`${base2}/api/workspace/distillation-traces?scope=all&format=json`, {
      cache: "no-store",
    });
    assert(allRe.ok, `reimport scope=all failed ${allRe.status}`);

    try {
      dev2.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      spawnSync("sh", ["-c", `pkill -f "next dev -p ${port2}" 2>/dev/null || true`], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    dev2 = null;

    process.stdout.write("[e2e] all API probes completed successfully.\n");
  } finally {
    try {
      dev.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      dev2?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      spawnSync("sh", ["-c", `pkill -f "next dev -p ${port}" 2>/dev/null || true`], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    if (cleanupPort2) {
      try {
        spawnSync("sh", ["-c", `pkill -f "next dev -p ${cleanupPort2}" 2>/dev/null || true`], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
