#!/usr/bin/env node
/**
 * Unit coverage for the Browser / local agent fast lane deriver
 * (lib/sandbox-browser-agent-flow.js). Negative probes first: the worst
 * failure is a panel that overclaims browser/auth/run state from row fields
 * alone, or that pretends local browser/session access exists serverless.
 *
 * Run with:  node --test scripts/unit-sandbox-browser-agent-flow.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);
const { deriveSandboxBrowserAgentState, extractBrowserProof } = await import(
  pathToFileURL(path.join(kitLib, "sandbox-browser-agent-flow.js")).href
);

const sandboxConfig = (objectType = "sandbox-environment") => ({
  dataModel: { objects: [{ id: "sandboxes", objectType, label: "Sandboxes", rows: [] }] },
});

const browserRow = (overrides = {}) => ({
  Name: "browser-agent-smoke",
  runLocality: "local",
  runtime: "node",
  adapter: "local-process",
  command: "console.log('ok')",
  browserMode: "operator-approved",
  requiresBrowser: "true",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Hidden / negative eligibility
// ---------------------------------------------------------------------------

test("hidden for a non-sandbox object", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig("api-registry"),
    row: browserRow(),
    objectId: "sandboxes",
  });
  assert.equal(s.visible, false);
  assert.equal(s.status, "hidden");
});

test("hidden for local-intelligence rows", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ adapter: "local-intelligence" }),
    objectId: "sandboxes",
  });
  assert.equal(s.visible, false);
});

test("hidden when the row has no browser signal at all", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: { Name: "plain", adapter: "local-process", command: "echo hi", runLocality: "local" },
    objectId: "sandboxes",
  });
  assert.equal(s.visible, false);
});

test("hidden for a non-object row", () => {
  assert.equal(deriveSandboxBrowserAgentState({ row: null }).visible, false);
  assert.equal(deriveSandboxBrowserAgentState({}).visible, false);
});

// ---------------------------------------------------------------------------
// Serverless boundary
// ---------------------------------------------------------------------------

test("serverless local-agent row → read-only serverless-incompatible note, never runnable", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ runLocality: "serverless", schedulerRegistryId: "sched", adapter: "local-agent-host", agentHost: "claude_local" }),
    objectId: "sandboxes",
  });
  assert.equal(s.visible, true);
  assert.equal(s.status, "serverless-incompatible");
  assert.equal(s.canRun, false);
  assert.equal(s.canUseBrowserProfile, false);
  assert.match(s.guidance, /schedulerRegistryId/);
});

// ---------------------------------------------------------------------------
// Blocked states
// ---------------------------------------------------------------------------

test("blocked when local-agent-host has no cataloged agentHost", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ adapter: "local-agent-host", agentHost: "" }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "blocked");
  assert.ok(s.missing.includes("agentHost"));
  assert.equal(s.nextAction.id, "select-agent-host");
  assert.equal(s.canRun, false);
});

test("blocked when there is nothing to execute", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ command: "", instructions: "" }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "blocked");
  assert.ok(s.missing.includes("command"));
});

// ---------------------------------------------------------------------------
// Ready / connected / failed — evidence-driven only
// ---------------------------------------------------------------------------

test("ready for configured local-agent-host row with cataloged host", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ adapter: "local-agent-host", agentHost: "codex_local", command: "Summarize the target page." }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "ready");
  assert.equal(s.eligible, true);
  assert.equal(s.canRun, true);
  assert.equal(s.canCheckAuth, true, "cataloged host exposes auth check capability");
  assert.equal(s.canUseBrowserProfile, true, "browserMode operator-approved enables profile use");
});

test("row status field alone NEVER promotes to connected", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ status: "connected" }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "ready", "status:connected without lastResponse/source proof stays ready");
});

test("connected from persisted lastResponse with reachedTarget proof", () => {
  const lastResponse = JSON.stringify({
    runId: "run_proof_1",
    exitCode: 0,
    ranAt: "2026-06-10T00:00:00.000Z",
    stdout: JSON.stringify({
      browser: { platform: "notebooklm", targetUrl: "https://notebooklm.google.com/notebook/x", currentUrl: "https://notebooklm.google.com/notebook/x", title: "Brief", reachedTarget: true, browserExitCode: 0, stderr: "" },
      artifact: { id: "art-1", Status: "generated", DocxArtifactPath: "/tmp/brief.docx", RunId: "run_proof_1" },
      fallbackUsed: false,
    }),
  });
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ lastResponse, lastRunId: "run_proof_1" }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "connected");
  assert.equal(s.browserProof.reachedTarget, true);
  assert.equal(s.browserProof.artifact.generated, true);
  assert.equal(s.lastArtifact.id, "art-1");
  assert.match(s.guidance, /run_proof_1/);
});

test("fallback run (exit 0, reachedTarget false) demotes below connected, truthfully", () => {
  const lastResponse = JSON.stringify({
    runId: "run_fb",
    exitCode: 0,
    stdout: JSON.stringify({
      browser: { platform: "notebooklm", reachedTarget: false, browserExitCode: 0 },
      artifact: null,
      fallbackUsed: true,
    }),
  });
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ lastResponse }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "ready", "fallback never claims connected");
  assert.equal(s.browserProof.fallbackUsed, true);
  assert.match(s.guidance, /fallback/i);
});

test("failed from failed lastResponse", () => {
  const lastResponse = JSON.stringify({ runId: "run_bad", exitCode: 1, error: "exit 1", stdout: "" });
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ lastResponse }),
    objectId: "sandboxes",
  });
  assert.equal(s.status, "failed");
  assert.equal(s.nextAction.id, "review-run");
});

test("connected proof can come from source-record history", () => {
  const record = {
    runId: "run_hist",
    exitCode: 0,
    stdout: JSON.stringify({ browser: { platform: "linkedin", reachedTarget: true, browserExitCode: 0 } }),
  };
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    workspaceSourceRecords: { "sandbox:sandboxes:row": { records: [record] } },
    row: browserRow({ lastSourceId: "sandbox:sandboxes:row" }),
    objectId: "sandboxes",
  });
  assert.ok(s.browserProof, "history proof surfaces");
  assert.equal(s.browserProof.platform, "linkedin");
});

test("running flag projects running state and disables run", () => {
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow(),
    objectId: "sandboxes",
    running: true,
  });
  assert.equal(s.status, "running");
  assert.equal(s.canRun, false);
});

test("graph human-input schema surfaces requiresInput + fields", () => {
  const graph = {
    version: 1,
    provider: "growthub-native",
    nodes: [
      { id: "form", type: "human-input", config: { title: "Browser run", required: true, fields: [
        { key: "platform", value: "text", required: true },
        { key: "targetUrl", value: "url", required: true },
      ] } },
      { id: "api", type: "api-registry-call", config: { registryId: "x" } },
    ],
    edges: [],
  };
  const s = deriveSandboxBrowserAgentState({
    workspaceConfig: sandboxConfig(),
    row: browserRow({ orchestrationGraph: JSON.stringify(graph) }),
    objectId: "sandboxes",
  });
  assert.equal(s.requiresInput, true);
  assert.deepEqual(s.inputFields.map((f) => f.id), ["platform", "targetUrl"]);
  assert.equal(s.nextAction.id, "fill-run-inputs");
});

// ---------------------------------------------------------------------------
// extractBrowserProof — notebook normalization + honesty
// ---------------------------------------------------------------------------

test("notebook proof normalizes to browser proof (platform notebooklm, chromeExitCode mapped)", () => {
  const proof = extractBrowserProof({
    exitCode: 0,
    stdout: JSON.stringify({
      notebook: { targetUrl: "https://notebooklm.google.com/notebook/n1", currentUrl: "https://notebooklm.google.com/notebook/n1", reachedTarget: true, chromeExitCode: 0, activeNotebookId: "n1" },
      artifact: { id: "a1", DocxStatus: "generated", DocxArtifactPath: "/out/a1.docx" },
    }),
  });
  assert.equal(proof.platform, "notebooklm");
  assert.equal(proof.browserExitCode, 0);
  assert.equal(proof.reachedTarget, true);
  assert.deepEqual(proof.platformMeta, { activeNotebookId: "n1" });
  assert.equal(proof.artifact.generated, true);
});

test("reachedTarget is never invented from truthy-but-not-true values", () => {
  const proof = extractBrowserProof({
    stdout: JSON.stringify({ browser: { platform: "x", reachedTarget: "yes" } }),
  });
  assert.equal(proof.reachedTarget, false);
});

test("artifact is not 'generated' without an id or path", () => {
  const proof = extractBrowserProof({
    stdout: JSON.stringify({ browser: { platform: "x", reachedTarget: true }, artifact: { Status: "generated" } }),
  });
  assert.equal(proof.artifact.generated, false, "status text alone never claims a generated artifact");
});

test("non-browser records yield no proof", () => {
  assert.equal(extractBrowserProof({ stdout: "plain text output", exitCode: 0 }), null);
  assert.equal(extractBrowserProof(null), null);
  assert.equal(extractBrowserProof("not json"), null);
});
