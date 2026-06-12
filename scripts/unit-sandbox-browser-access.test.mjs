#!/usr/bin/env node
/**
 * Unit coverage for the first-class sandbox `browserAccess` primitive.
 *
 * Invariants under test:
 *   - EVERY host in the local-agent-host catalog declares a browser
 *     provisioning lane (native-argv / mcp-config-flag / project-mcp-config /
 *     mcp-convention) — no host is silently browser-less.
 *   - argv(request) derives capability flags deterministically from the
 *     governed row's saved settings (codex native flags, claude mcp-config
 *     flag) and stays stable when browserAccess is off.
 *   - provisionBrowserAccess writes only inside the sealed workdir and
 *     returns audit metadata; it is a no-op when browserAccess is off.
 *   - deriveSandboxServerlessState surfaces browserAccess for both
 *     localities so the upgrade path keeps the identical capability contract.
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

const { BROWSER_MCP_CONFIG, HOST_CATALOG, provisionBrowserAccess } = await import(
  pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-agent-host.js")).href
);
const { deriveSandboxServerlessState } = await import(
  pathToFileURL(path.join(kitLib, "sandbox-serverless-flow.js")).href
);
const { getSandboxAdapter } = await import(
  pathToFileURL(path.join(kitLib, "adapters/sandboxes/sandbox-adapter-registry.js")).href
);
await import(pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-process.js")).href);
const { normalizeRunConsoleRecord } = await import(
  pathToFileURL(path.join(kitLib, "orchestration-run-console.js")).href
);
const { validateWorkspaceConfig } = await import(
  pathToFileURL(path.join(kitLib, "workspace-schema.js")).href
);
const { buildSandboxRowFromSwarmProposal } = await import(
  pathToFileURL(path.join(kitLib, "workspace-swarm-proposal.js")).href
);

const KNOWN_LANES = ["native-argv", "mcp-config-flag", "project-mcp-config", "mcp-convention"];

test("every catalog host declares a browser provisioning lane", () => {
  for (const [slug, host] of Object.entries(HOST_CATALOG)) {
    assert.ok(host.browser, `${slug} must declare a browser provisioning spec`);
    assert.ok(KNOWN_LANES.includes(host.browser.lane), `${slug} lane ${host.browser.lane} unknown`);
    assert.ok(Array.isArray(host.browser.files), `${slug} browser.files must be an array`);
    if (host.browser.lane !== "native-argv") {
      assert.ok(host.browser.files.length > 0, `${slug} non-native lane must provision at least one file`);
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

test("claude argv points at the provisioned MCP config only when browser is on", () => {
  assert.deepEqual(HOST_CATALOG.claude_local.argv({}), ["-p", "--output-format", "text"]);
  const on = HOST_CATALOG.claude_local.argv({ browserAccess: true });
  assert.ok(on.includes("--mcp-config"), "browser on must pass --mcp-config");
  assert.ok(on.includes("--allowedTools"), "browser on must allowlist the browser MCP tools");
});

test("provisionBrowserAccess writes host config inside the workdir and audits it", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-browser-test-"));
  try {
    const provision = await provisionBrowserAccess(HOST_CATALOG.cursor, { browserAccess: true }, workdir);
    assert.equal(provision.lane, "project-mcp-config");
    assert.deepEqual(provision.files, [".cursor/mcp.json"]);
    const written = JSON.parse(await fs.readFile(path.join(workdir, ".cursor/mcp.json"), "utf8"));
    assert.ok(written.mcpServers?.browser?.command, "written config must declare the browser MCP server");
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
});

test("provisionBrowserAccess falls back to the .mcp.json convention for hosts without a spec", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-browser-test-"));
  try {
    const provision = await provisionBrowserAccess({}, { browserAccess: true }, workdir);
    assert.equal(provision.lane, "mcp-convention");
    assert.deepEqual(provision.files, [".mcp.json"]);
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
});

test("provisionBrowserAccess is a no-op when browserAccess is off", async () => {
  const provision = await provisionBrowserAccess(HOST_CATALOG.cursor, { browserAccess: false }, "/nonexistent");
  assert.equal(provision, null);
});

test("browser MCP server package is pinned, never @latest", () => {
  const args = BROWSER_MCP_CONFIG.mcpServers.browser.args.join(" ");
  assert.ok(!args.includes("@latest"), "MCP package must be pinned for run-to-run determinism");
  assert.match(args, /@playwright\/mcp@\d+\.\d+\.\d+/, "MCP package must carry an exact version");
});

test("claude provisioning writes the pinned MCP config inside the workdir only", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-browser-test-"));
  try {
    const provision = await provisionBrowserAccess(HOST_CATALOG.claude_local, { browserAccess: true }, workdir);
    assert.equal(provision.lane, "mcp-config-flag");
    for (const rel of provision.files) {
      assert.ok(!path.isAbsolute(rel) && !rel.split(/[\\/]/).includes(".."), `${rel} must stay relative`);
      const resolved = path.resolve(workdir, rel);
      assert.ok(resolved.startsWith(workdir + path.sep) || resolved === path.join(workdir, rel), `${rel} must resolve inside the workdir`);
      const body = await fs.readFile(resolved, "utf8");
      assert.ok(!body.includes("@latest"), "provisioned config must use the pinned package");
    }
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
});

test("no catalog provisioning file can escape the workdir", () => {
  for (const [slug, host] of Object.entries(HOST_CATALOG)) {
    for (const file of host.browser.files) {
      assert.ok(!path.isAbsolute(file.path), `${slug}: ${file.path} must be relative`);
      assert.ok(!file.path.split(/[\\/]/).includes(".."), `${slug}: ${file.path} must not traverse upward`);
    }
  }
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

test("run-console projection surfaces browserAccess and the provisioning audit", () => {
  const normalized = normalizeRunConsoleRecord({
    runId: "run_x",
    ranAt: new Date().toISOString(),
    exitCode: 0,
    stdout: "ok",
    browserAccess: true,
    networkAllow: true,
    allowList: ["example.com"],
    adapterMeta: { adapter: "local-agent-host", browserAccess: true, browserProvision: { lane: "native-argv", files: [] } }
  });
  assert.ok(normalized, "record must normalize");
  assert.equal(normalized.context.browserAccess, true);
  assert.equal(normalized.context.adapterMeta.browserProvision.lane, "native-argv");
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
