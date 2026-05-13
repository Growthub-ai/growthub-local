#!/usr/bin/env node
/**
 * Real HTTP probes for the exported governed workspace app:
 *   - PATCH /api/workspace (negative + positive dataModel, including sandbox local model metadata)
 *   - GET /api/workspace (read-back)
 *   - POST /api/workspace/sandbox-run (negative + positive local-process)
 *
 * This is not a substitute for unit tests; it proves the sidecar + Next API
 * contracts against a running dev server, matching how operators validate
 * `growthub.config.json` writes from the Data Model UI.
 *
 * ## Prerequisite (official CLI dist + free workspace profile, same entry as demo installer)
 *
 * From repo root:
 *
 *   export GROWTHUB_LOCAL_CLI_ENTRYPOINT="$PWD/cli/dist/index.js"
 *   export PAPERCLIP_HOME=/tmp/growthub-http-probe-home
 *   node packages/create-growthub-local/bin/create-growthub-local.mjs \\
 *     --profile workspace --out /tmp/growthub-http-probe-ws --remote-sync-mode off --json
 *
 *   cd /tmp/growthub-http-probe-ws/apps/workspace
 *   npm install
 *   WORKSPACE_CONFIG_ALLOW_FS_WRITE=true PORT=3999 npm run dev
 *
 * ## Run probes (separate shell)
 *
 *   export WORKSPACE_PROBE_BASE_URL=http://127.0.0.1:3999
 *   node scripts/verify-exported-workspace-http-probes.mjs
 *
 * Exit 1 if any probe expectation fails.
 */

const base = (process.env.WORKSPACE_PROBE_BASE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("Set WORKSPACE_PROBE_BASE_URL (e.g. http://127.0.0.1:3999)");
  process.exit(1);
}

const columns = [
  "Name",
  "lifecycleStatus",
  "version",
  "runLocality",
  "schedulerRegistryId",
  "runtime",
  "adapter",
  "agentHost",
  "localModelId",
  "localIntelligenceAdapterMode",
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

function sandboxObject() {
  return {
    id: "sandbox-probe-object",
    label: "Sandboxes",
    source: "Sandboxes",
    objectType: "sandbox-environment",
    icon: "Terminal",
    columns,
    rows: [
      {
        Name: "api-probe-row",
        lifecycleStatus: "draft",
        version: "1",
        runLocality: "local",
        runtime: "node",
        adapter: "local-process",
        command: "console.log('probe-stdout');",
        localModelId: "gemma3:4b",
        localIntelligenceAdapterMode: "ollama",
        networkAllow: "false",
      },
    ],
    binding: { mode: "manual", source: "Data Model" },
    relations: [],
  };
}

async function probe(name, fn) {
  process.stdout.write(`\n— ${name} … `);
  try {
    await fn();
    console.log("ok");
  } catch (err) {
    console.log("FAIL");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function httpJson(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

await probe("PATCH unknown field → 400", async () => {
  const { res, json } = await httpJson("PATCH", "/api/workspace", { notAllowed: true });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  if (!json?.details?.includes("notAllowed")) throw new Error("expected unknown field error");
});

await probe("PATCH invalid localModelId length → 400", async () => {
  const row = { ...sandboxObject().rows[0], localModelId: "x".repeat(257) };
  const { res } = await httpJson("PATCH", "/api/workspace", {
    dataModel: { objects: [{ ...sandboxObject(), rows: [row] }] },
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

await probe("PATCH valid sandbox + local model metadata → 200", async () => {
  const { res, json } = await httpJson("PATCH", "/api/workspace", {
    dataModel: { objects: [sandboxObject()] },
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status} ${JSON.stringify(json)}`);
  const row = json.workspaceConfig?.dataModel?.objects?.[0]?.rows?.[0];
  if (row?.localModelId !== "gemma3:4b") throw new Error("localModelId not persisted");
  if (row?.localIntelligenceAdapterMode !== "ollama") throw new Error("localIntelligenceAdapterMode not persisted");
});

await probe("GET read-back", async () => {
  const { res, json } = await httpJson("GET", "/api/workspace");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const row = json.workspaceConfig?.dataModel?.objects?.[0]?.rows?.[0];
  if (row?.localModelId !== "gemma3:4b") throw new Error("GET miss localModelId");
});

await probe("POST sandbox-run missing name → 400", async () => {
  const { res } = await httpJson("POST", "/api/workspace/sandbox-run", {
    objectId: "sandbox-probe-object",
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

await probe("POST sandbox-run local-process → 200", async () => {
  const { res, json } = await httpJson("POST", "/api/workspace/sandbox-run", {
    objectId: "sandbox-probe-object",
    name: "api-probe-row",
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status} ${JSON.stringify(json)}`);
  if (!json.ok) throw new Error("ok false");
  if (json.exitCode !== 0) throw new Error(`exitCode ${json.exitCode}`);
  if (!String(json.response?.stdout || "").includes("probe-stdout")) {
    throw new Error(`unexpected stdout: ${JSON.stringify(json.response?.stdout)}`);
  }
});

console.log("\nAll workspace HTTP probes passed.");
