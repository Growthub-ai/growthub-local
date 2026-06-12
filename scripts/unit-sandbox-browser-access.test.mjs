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

const { HOST_CATALOG, provisionBrowserAccess } = await import(
  pathToFileURL(path.join(kitLib, "adapters/sandboxes/default-local-agent-host.js")).href
);
const { deriveSandboxServerlessState } = await import(
  pathToFileURL(path.join(kitLib, "sandbox-serverless-flow.js")).href
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

test("serverless flow state carries browserAccess for both localities", () => {
  const local = deriveSandboxServerlessState({ sandboxRow: { runLocality: "local", browserAccess: "true" } });
  assert.equal(local.browserAccess, true);
  const serverless = deriveSandboxServerlessState({ sandboxRow: { runLocality: "serverless", browserAccess: "on" } });
  assert.equal(serverless.browserAccess, true);
  const off = deriveSandboxServerlessState({ sandboxRow: { runLocality: "serverless" } });
  assert.equal(off.browserAccess, false);
});
