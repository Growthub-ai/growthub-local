#!/usr/bin/env node
/**
 * Unit coverage for the first-class sandbox `browserAccess` primitive.
 *
 * `browserAccess` is the governed-row mirror of the upstream agent config
 * `chrome` primitive — the product's existing agent browser mechanism. The
 * invariants under test:
 *
 *   - every host in the local-agent-host catalog declares how its FIRST-PARTY
 *     browser integration is engaged (native-flag) or that it rides the env
 *     signal (env-signal) — nothing is invented per host.
 *   - argv(request) derives capability flags deterministically from the
 *     governed row's saved settings (Claude `--chrome`, Codex browser_use)
 *     and stays byte-identical when browserAccess is off.
 *   - the sealed env contract publishes GROWTHUB_SANDBOX_BROWSER_ACCESS to
 *     every adapter (proven with a real local-process spawn).
 *   - run-console projection, schema validation, swarm inheritance, and the
 *     serverless flow state all carry the same bit.
 *
 * Run with:  node --test scripts/unit-sandbox-browser-access.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const { HOST_CATALOG } = await import(
  pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-agent-host.js")).href
);
const { deriveSandboxServerlessState } = await import(
  pathToFileURL(path.join(kitLib, "sandbox-serverless-flow.js")).href
);
const { getSandboxAdapter } = await import(
  pathToFileURL(path.join(kitLib, "adapters/sandboxes/sandbox-adapter-registry.js")).href
);
await import(pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-process.js")).href);
await import(pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-intelligence.js")).href);
await import(pathToFileURL(path.join(kitLib, "adapters/sandboxes/adapters/local-intelligence-browser-access.js")).href);
const { normalizeRunConsoleRecord } = await import(
  pathToFileURL(path.join(kitLib, "orchestration-run-console.js")).href
);
const { validateWorkspaceConfig } = await import(
  pathToFileURL(path.join(kitLib, "workspace-schema.js")).href
);
const { buildSandboxRowFromSwarmProposal } = await import(
  pathToFileURL(path.join(kitLib, "workspace-swarm-proposal.js")).href
);

const KNOWN_LANES = ["native-flag", "env-signal"];

test("every catalog host declares its browser lane", () => {
  for (const [slug, host] of Object.entries(HOST_CATALOG)) {
    assert.ok(host.browser, `${slug} must declare a browser lane`);
    assert.ok(KNOWN_LANES.includes(host.browser.lane), `${slug} lane ${host.browser.lane} unknown`);
    if (host.browser.lane === "native-flag") {
      assert.ok(Array.isArray(host.browser.flags) && host.browser.flags.length > 0,
        `${slug} native-flag lane must declare its first-party flags`);
    }
  }
});

test("every host argv is callable for all browserAccess/networkAllow combinations", () => {
  const requests = [
    {},
    { networkAllow: true },
    { browserAccess: true },
    { networkAllow: true, browserAccess: true },
  ];
  for (const [slug, host] of Object.entries(HOST_CATALOG)) {
    for (const request of requests) {
      const argv = host.argv(request);
      assert.ok(Array.isArray(argv) && argv.every((a) => typeof a === "string"), `${slug} argv must be string[]`);
    }
  }
});

test("argv is byte-identical with browserAccess off — no behavior drift for existing rows", () => {
  for (const [slug, host] of Object.entries(HOST_CATALOG)) {
    assert.deepEqual(
      host.argv({ networkAllow: true }),
      host.argv({ networkAllow: true, browserAccess: false }),
      `${slug} must not change argv when browserAccess is explicitly off`
    );
  }
});

test("claude argv engages Claude's first-party --chrome integration only when browser is on", () => {
  assert.deepEqual(HOST_CATALOG.claude_local.argv({}), ["-p", "--output-format", "text"]);
  assert.deepEqual(
    HOST_CATALOG.claude_local.argv({ browserAccess: true }),
    ["-p", "--output-format", "text", "--chrome"]
  );
});

test("codex argv derives native sandbox + browser flags from the row", () => {
  const off = HOST_CATALOG.codex_local.argv({});
  assert.deepEqual(off, ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "-"]);

  const netOnly = HOST_CATALOG.codex_local.argv({ networkAllow: true });
  assert.deepEqual(netOnly, ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "-"]);
  assert.ok(!netOnly.includes("browser_use"), "network alone must not enable the browser");

  const browser = HOST_CATALOG.codex_local.argv({ networkAllow: true, browserAccess: true });
  assert.deepEqual(browser, [
    "exec", "--skip-git-repo-check", "--sandbox", "workspace-write",
    "--enable", "browser_use", "--enable", "in_app_browser", "-",
  ]);
});

test("sealed contract: local-process publishes GROWTHUB_SANDBOX_BROWSER_ACCESS to the script", async () => {
  const adapter = getSandboxAdapter("local-process");
  assert.ok(adapter, "local-process adapter must be registered");
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-browser-test-"));
  try {
    const result = await adapter.run({
      runId: "run_browser_smoke",
      name: "browser-smoke",
      runtime: "bash",
      command: 'printf "%s" "$GROWTHUB_SANDBOX_BROWSER_ACCESS"',
      timeoutMs: 15000,
      networkAllow: true,
      allowList: [],
      browserAccess: true,
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      workdir,
      ranAt: new Date().toISOString()
    });
    assert.equal(result.ok, true, result.error || "run must succeed");
    assert.equal(result.stdout, "1", "script must observe GROWTHUB_SANDBOX_BROWSER_ACCESS=1");
    assert.equal(result.adapterMeta.browserAccess, true, "adapterMeta must audit browserAccess");
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
});

test("run-console projection surfaces browserAccess and the engaged lane", () => {
  const normalized = normalizeRunConsoleRecord({
    runId: "run_x",
    ranAt: new Date().toISOString(),
    exitCode: 0,
    stdout: "ok",
    browserAccess: true,
    networkAllow: true,
    allowList: ["example.com"],
    adapterMeta: { adapter: "local-agent-host", browserAccess: true, browserLane: "native-flag" }
  });
  assert.ok(normalized, "record must normalize");
  assert.equal(normalized.context.browserAccess, true);
  assert.equal(normalized.context.adapterMeta.browserLane, "native-flag");
});

test("schema accepts boolean-coercible browserAccess and rejects garbage", () => {
  const config = (browserAccess) => ({
    dataModel: {
      objects: [{
        id: "sb",
        label: "Sandbox",
        objectType: "sandbox-environment",
        columns: ["Name", "browserAccess"],
        rows: [{ Name: "row-1", browserAccess }]
      }]
    }
  });
  assert.doesNotThrow(() => validateWorkspaceConfig(config("true")));
  assert.doesNotThrow(() => validateWorkspaceConfig(config("")));
  assert.throws(() => validateWorkspaceConfig(config("banana")), /browserAccess must coerce to a boolean/);
});

test("swarm proposals inherit browserAccess from the live helper sandbox", () => {
  const workspaceConfig = {
    dataModel: {
      objects: [{
        id: "workspace-helper-sandbox",
        label: "Workspace Helper",
        objectType: "sandbox-environment",
        columns: ["Name"],
        rows: [{
          Name: "workspace-helper",
          lifecycleStatus: "live",
          runLocality: "local",
          adapter: "local-intelligence",
          networkAllow: "true",
          allowList: "example.com",
          browserAccess: "true"
        }]
      }]
    }
  };
  const row = buildSandboxRowFromSwarmProposal(workspaceConfig, {
    payload: { name: "Swarm", objective: "research example.com", agents: [{ role: "researcher" }] }
  });
  assert.equal(row.browserAccess, "true", "proposed swarm row must inherit the helper's browserAccess");
});

test("serverless flow state carries browserAccess for both localities", () => {
  const local = deriveSandboxServerlessState({ sandboxRow: { runLocality: "local", browserAccess: "true" } });
  assert.equal(local.browserAccess, true);
  const serverless = deriveSandboxServerlessState({ sandboxRow: { runLocality: "serverless", browserAccess: "on" } });
  assert.equal(serverless.browserAccess, true);
  const off = deriveSandboxServerlessState({ sandboxRow: { runLocality: "serverless" } });
  assert.equal(off.browserAccess, false);
});

test("local-intelligence browser bridge executes only when sandbox browserAccess is on", async () => {
  const adapter = getSandboxAdapter("local-intelligence");
  assert.ok(adapter, "local-intelligence adapter must be registered");

  const originalFetch = globalThis.fetch;
  const originalDriver = globalThis.__growthubLocalIntelligenceBrowserDriver;
  const calls = [];
  const browserCalls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const payload = calls.length === 1
      ? {
          choices: [{
            message: {
              content: JSON.stringify({
                text: "need browser",
                toolIntents: [{ tool: "browser.navigate", url: "https://example.com" }],
                warnings: [],
                confidence: 0.5
              })
            }
          }],
          usage: { total_tokens: 7 }
        }
      : {
          choices: [{
            message: {
              content: JSON.stringify({
                text: "browser observed Example Domain",
                toolIntents: [],
                warnings: [],
                confidence: 0.9
              })
            }
          }],
          usage: { total_tokens: 11 }
        };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  globalThis.__growthubLocalIntelligenceBrowserDriver = {
    async run(intents) {
      browserCalls.push(intents);
      return [{ tool: "browser.navigate", url: "https://example.com", title: "Example Domain" }];
    }
  };

  try {
    const baseRequest = {
      runId: "run_local_intelligence_browser",
      name: "ollama-browser",
      runtime: "node",
      command: "check example.com",
      timeoutMs: 15000,
      networkAllow: true,
      allowList: [],
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      workdir: "/tmp",
      ranAt: new Date().toISOString(),
      intelligenceSandbox: {
        userIntent: "check example.com",
        localModel: "gemma3:4b",
        localEndpoint: "http://127.0.0.1:11434/v1",
        intelligenceAdapterMode: "ollama"
      }
    };

    const off = await adapter.run({ ...baseRequest, browserAccess: false });
    assert.equal(off.ok, true);
    assert.equal(calls.length, 1, "browserAccess off must keep single default model call");
    assert.equal(browserCalls.length, 0, "browserAccess off must not execute browser bridge");

    calls.length = 0;
    const on = await adapter.run({ ...baseRequest, browserAccess: true });
    assert.equal(on.ok, true, on.error || "browser run must succeed");
    assert.equal(calls.length, 2, "browserAccess on must make first-pass and final model calls");
    assert.equal(browserCalls.length, 1, "browserAccess on must execute browser bridge");
    assert.equal(on.adapterMeta.browserAccess, true);
    assert.equal(on.adapterMeta.browserLane, "local-intelligence-browser-bridge");
    assert.equal(on.adapterMeta.tools, 2);
    const envelope = JSON.parse(on.stdout);
    assert.equal(envelope.result.text, "browser observed Example Domain");
    assert.deepEqual(envelope.result.browserObservations, [
      { tool: "browser.navigate", url: "https://example.com", title: "Example Domain" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDriver === undefined) {
      delete globalThis.__growthubLocalIntelligenceBrowserDriver;
    } else {
      globalThis.__growthubLocalIntelligenceBrowserDriver = originalDriver;
    }
  }
});
