#!/usr/bin/env node
/**
 * Adversarial HTTP probes for the governed workspace mutation boundary:
 *
 *   - PATCH /api/workspace            — mutation policy (422 + violations[])
 *   - POST  /api/workspace/patch/preflight — dry-run gates, no writes
 *   - POST  /api/workspace/workflow/publish — server-authoritative publish
 *
 * Boots the same temp copy of the bundled custom-workspace Next app as
 * scripts/e2e-workspace-sandbox-api-probe.mjs, then drives every adversarial
 * case the policy must block and every governed case it must allow.
 *
 * Usage (from repo root):
 *   node scripts/e2e-workspace-patch-policy-probe.mjs
 *   PORT=3998 node scripts/e2e-workspace-patch-policy-probe.mjs
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

function sandboxObject(rows) {
  return {
    id: "sbx-policy",
    label: "Sandboxes",
    objectType: "sandbox-environment",
    columns: ["Name", "lifecycleStatus", "version", "runLocality", "adapter", "runtime", "command"],
    rows,
    binding: { mode: "manual", source: "Data Model" },
  };
}

const minimalGraph = {
  version: 1,
  provider: "growthub-native",
  executionMode: "agent-swarm-v1",
  swarm: { maxConcurrency: 1, rewardWeights: { parallel: 0.25, finish: 0.35, outcome: 0.4 }, outcomeCriteria: "done" },
  nodes: [
    { id: "orchestrator", type: "thinAdapter", label: "Orchestrator", sandbox: "orchestrator", config: { executionPolicy: "parallel", prompt: "Plan.", outputKey: "plan" } },
    { id: "subagent-a", type: "ai-agent", label: "A", config: { role: "A", taskPrompt: "do a", required: true } },
    { id: "synthesis", type: "tool-result", label: "Synth", config: { successStatusCodes: [200], outputMode: "swarm-summary" } },
  ],
  edges: [
    { from: "orchestrator", to: "subagent-a", passes: "subtask-assignment" },
    { from: "subagent-a", to: "synthesis", passes: "subtask-result" },
  ],
};

async function main() {
  const port =
    process.env.PORT && String(process.env.PORT).trim()
      ? Number(process.env.PORT)
      : await pickFreePort();
  const base = `http://127.0.0.1:${port}`;

  const profileRoot = process.env.CLI_DEMO_HOME?.trim()
    ? path.resolve(process.env.CLI_DEMO_HOME.trim())
    : path.join(os.tmpdir(), "growthub-cli-demo");
  const demoHome = path.join(profileRoot, "e2e-workspace-patch-policy");
  fs.mkdirSync(demoHome, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(demoHome, "ws-copy-"));

  process.stdout.write(`[policy-e2e] Copying starter workspace → ${tmp}\n`);
  fs.cpSync(kitWorkspace, tmp, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes("node_modules"),
  });

  // Prompt-capable stub adapter so draft swarm runs pass deterministically.
  fs.writeFileSync(path.join(tmp, "lib/adapters/sandboxes/adapters/policy-probe-stub.js"), `import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";
registerSandboxAdapter({
  id: "local-agent-host",
  label: "policy probe stub",
  description: "Patch-policy e2e stub.",
  locality: "local",
  supportedRuntimes: ["node", "bash", "python"],
  supportedHosts: ["claude_local"],
  hostCatalog: { claude_local: { label: "Claude Code (stub)", binary: "claude" } },
  run: async (request) => {
    const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
    if (phase === "orchestrator") return { ok: true, exitCode: 0, durationMs: 1, stdout: "PLAN: probe.", stderr: "", adapterMeta: { stub: true } };
    if (phase === "synthesis") return { ok: true, exitCode: 0, durationMs: 1, stdout: "Done.\\nOUTCOME_SCORE: 0.9", stderr: "", adapterMeta: { stub: true } };
    return { ok: true, exitCode: 0, durationMs: 1, stdout: "done", stderr: "", adapterMeta: { stub: true } };
  }
});
`, "utf8");

  process.stdout.write("[policy-e2e] npm install (workspace app)…\n");
  const ni = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: tmp,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  assert(ni.status === 0, "npm install failed");

  process.stdout.write(`[policy-e2e] starting next dev on :${port}…\n`);
  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: tmp,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, NODE_ENV: "development", WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true", PORT: String(port) },
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", (c) => process.stderr.write(c));
  dev.unref();

  const patch = (body) =>
    fetch(`${base}/api/workspace`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const preflight = (body) =>
    fetch(`${base}/api/workspace/patch/preflight`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const publish = (body) =>
    fetch(`${base}/api/workspace/workflow/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const sandboxRun = (body) =>
    fetch(`${base}/api/workspace/sandbox-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const getConfig = async () => (await (await fetch(`${base}/api/workspace`)).json()).workspaceConfig;
  const mergeRow = (config, name, fields) => ({
    ...config.dataModel,
    objects: (config.dataModel?.objects || []).map((o) =>
      o?.id !== "sbx-policy" ? o : { ...o, rows: (o.rows || []).map((r) => (String(r?.Name || "") === name ? { ...r, ...fields } : r)) },
    ),
  });

  const draftSerialized = JSON.stringify(minimalGraph);
  let pass = 0;
  const ok = (label) => {
    pass += 1;
    process.stdout.write(`[policy-e2e] ok ${String(pass).padStart(2)} — ${label}\n`);
  };

  try {
    await waitForHttpReady(`${base}/api/workspace`);

    // 1. valid normal dataModel patch succeeds
    let res = await patch({ dataModel: { objects: [sandboxObject([{ Name: "wf", lifecycleStatus: "draft", version: "1", runLocality: "local", adapter: "local-agent-host", agentHost: "claude_local", runtime: "node", command: "" }])] } });
    assert(res.status === 200, `valid dataModel patch expected 200, got ${res.status} ${await res.text()}`);
    ok("valid normal dataModel patch succeeds");

    // 2. unknown top-level patch fails
    res = await patch({ branding: { name: "evil" } });
    assert(res.status === 400, `unknown field expected 400, got ${res.status}`);
    ok("unknown top-level patch field fails");

    // 3. full workspace config body fails + preflight names the reason
    const fullCfg = await getConfig();
    res = await patch(fullCfg);
    assert(res.status === 400, `full config patch expected 400, got ${res.status}`);
    let pre = await (await preflight(fullCfg)).json();
    assert(pre.ok === false && pre.policy.violations.some((v) => v.code === "full_config_body"), `preflight must flag full_config_body, got ${JSON.stringify(pre.policy?.violations)}`);
    ok("full workspace config patch fails (preflight: full_config_body)");

    // 4. workspaceSourceRecords through PATCH fails + preflight names it
    res = await patch({ workspaceSourceRecords: { "sandbox:x:y": {} } });
    assert(res.status === 400, `sourceRecords patch expected 400, got ${res.status}`);
    pre = await (await preflight({ workspaceSourceRecords: {} })).json();
    assert(pre.ok === false && pre.policy.violations.some((v) => v.code === "source_records_through_patch"), "preflight must flag source_records_through_patch");
    ok("workspaceSourceRecords through PATCH fails");

    // 5. direct live orchestrationGraph patch fails (422 + violations[])
    const cfg5 = await getConfig();
    res = await patch({ dataModel: mergeRow(cfg5, "wf", { orchestrationGraph: draftSerialized }) });
    assert(res.status === 422, `live graph patch expected 422, got ${res.status}`);
    let body5 = await res.json();
    assert(Array.isArray(body5.violations) && body5.violations.some((v) => v.code === "live_workflow_field"), "422 body must carry live_workflow_field violation");
    ok("direct live orchestrationGraph patch fails (422)");

    // 6. direct version bump and lifecycleStatus→live fail
    const cfg6 = await getConfig();
    res = await patch({ dataModel: mergeRow(cfg6, "wf", { version: "9" }) });
    assert(res.status === 422, `version bump expected 422, got ${res.status}`);
    res = await patch({ dataModel: mergeRow(cfg6, "wf", { lifecycleStatus: "live" }) });
    assert(res.status === 422, `lifecycleStatus live expected 422, got ${res.status}`);
    ok("direct version bump / lifecycleStatus→live fail (422)");

    // 7. oversized row + oversized node config fail
    const cfg7 = await getConfig();
    res = await patch({ dataModel: mergeRow(cfg7, "wf", { payload: "x".repeat(140_000) }) });
    assert(res.status === 422, `oversized row expected 422, got ${res.status}`);
    const fatGraph = { ...minimalGraph, nodes: [{ id: "fat", type: "core-action", config: { blob: "x".repeat(70_000) } }], edges: [] };
    res = await patch({ dataModel: mergeRow(cfg7, "wf", { orchestrationDraftConfig: JSON.stringify(fatGraph) }) });
    assert(res.status === 422, `oversized node config expected 422, got ${res.status}`);
    let body7 = await res.json();
    assert(body7.violations.some((v) => v.code === "oversized_node_config"), "expected oversized_node_config violation");
    ok("oversized dataModel row / node config fail (422)");

    // 8. draft graph save succeeds (+ preflight ok)
    const cfg8 = await getConfig();
    const draftPatch = { dataModel: mergeRow(cfg8, "wf", { orchestrationDraftConfig: draftSerialized, orchestrationDraftStatus: "untested", orchestrationDraftTestPassed: false, orchestrationDraftTestedConfig: "" }) };
    pre = await (await preflight(draftPatch)).json();
    assert(pre.ok === true, `preflight for draft save must pass, got ${JSON.stringify(pre).slice(0, 400)}`);
    res = await patch(draftPatch);
    assert(res.status === 200, `draft save expected 200, got ${res.status} ${await res.text()}`);
    ok("draft graph save succeeds (preflight + PATCH)");

    // 9. publish fails before any draft test
    res = await publish({ objectId: "sbx-policy", name: "wf" });
    assert(res.status === 409, `publish before test expected 409, got ${res.status}`);
    let pub = await res.json();
    assert(pub.code === "draft_not_tested", `expected draft_not_tested, got ${pub.code}`);
    ok("workflow publish fails before successful draft test");

    // 10. forged attestation without a real run is rejected by lineage gate
    const cfg10 = await getConfig();
    res = await patch({ dataModel: mergeRow(cfg10, "wf", { orchestrationDraftTestPassed: true, orchestrationDraftTestedConfig: draftSerialized }) });
    assert(res.status === 200, "attestation fields are draft fields — PATCH itself succeeds");
    res = await publish({ objectId: "sbx-policy", name: "wf" });
    pub = await res.json();
    assert(res.status === 409 && pub.code === "draft_run_not_verified", `forged attestation must hit lineage gate, got ${res.status} ${pub.code}`);
    ok("forged attestation without a real draft run is rejected (lineage gate)");

    // 11. sandbox-run with useDraft:true succeeds (server stamps the run)
    res = await sandboxRun({ objectId: "sbx-policy", name: "wf", useDraft: true });
    const run = await res.json();
    assert(run.ok === true, `draft run must pass via stub, got ${JSON.stringify(run).slice(0, 300)}`);
    ok("sandbox-run with useDraft:true succeeds");

    // 12. publish fails if draft changed after test
    const cfg12 = await getConfig();
    const changedDraft = JSON.stringify({ ...minimalGraph, swarm: { ...minimalGraph.swarm, outcomeCriteria: "changed" } });
    res = await patch({ dataModel: mergeRow(cfg12, "wf", { orchestrationDraftConfig: changedDraft, orchestrationDraftTestPassed: true, orchestrationDraftTestedConfig: draftSerialized }) });
    assert(res.status === 200, "saving a changed draft is allowed");
    res = await publish({ objectId: "sbx-policy", name: "wf" });
    pub = await res.json();
    assert(res.status === 409 && pub.code === "draft_changed_after_test", `expected draft_changed_after_test, got ${res.status} ${pub.code}`);
    ok("workflow publish fails when draft changed after its test");

    // 13. publish succeeds after the exact tested draft is restored
    const cfg13 = await getConfig();
    res = await patch({ dataModel: mergeRow(cfg13, "wf", { orchestrationDraftConfig: draftSerialized, orchestrationDraftTestPassed: true, orchestrationDraftTestedConfig: draftSerialized }) });
    assert(res.status === 200, "restoring the tested draft is allowed");
    res = await publish({ objectId: "sbx-policy", name: "wf" });
    pub = await res.json();
    assert(res.status === 200 && pub.ok === true, `publish expected ok, got ${res.status} ${JSON.stringify(pub).slice(0, 300)}`);
    assert(pub.version === "2" && typeof pub.publishedSha256 === "string", "publish must bump version and return sha256");
    const cfgAfter = await getConfig();
    const liveRow = (cfgAfter.dataModel.objects.find((o) => o.id === "sbx-policy")?.rows || []).find((r) => r.Name === "wf");
    assert(liveRow.lifecycleStatus === "live" && String(liveRow.orchestrationConfig || "").length > 0, "row must be live with the published graph");
    assert(String(liveRow.orchestrationDraftConfig || "") === "", "draft field must be cleared after publish");
    assert(Array.isArray(liveRow.orchestrationDeltas) && liveRow.orchestrationDeltas.length === 1, "publish must append exactly one delta record");
    ok("workflow publish succeeds after exact draft test (version 2, live, deltas)");

    // 14. published live row: echo passes, tamper fails
    res = await patch({ dataModel: cfgAfter.dataModel });
    assert(res.status === 200, `echoing the published config must pass, got ${res.status} ${await res.text()}`);
    res = await patch({ dataModel: mergeRow(cfgAfter, "wf", { orchestrationConfig: changedDraft }) });
    assert(res.status === 422, `tampering live graph after publish expected 422, got ${res.status}`);
    ok("published row: echo passes, live tamper fails");

    process.stdout.write(`[policy-e2e] all ${pass} probes passed.\n`);
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
