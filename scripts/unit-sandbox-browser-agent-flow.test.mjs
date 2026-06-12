#!/usr/bin/env node
/**
 * Unit coverage for the Browser / local agent fast lane deriver
 * (lib/sandbox-browser-agent-flow.js) — eligibility, evidence-driven
 * connected/failed state, legacy NotebookLM proof normalization, and the
 * input-schema-only graph fall-through in the orchestration graph runner.
 *
 * Run with:  node --test scripts/unit-sandbox-browser-agent-flow.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BROWSER_SMOKE_GRAPH } from "./lib/workspace-feature-seed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);
const { deriveSandboxBrowserAgentState, extractBrowserProofFromRunRecord } =
  await import(pathToFileURL(path.join(kitLib, "sandbox-browser-agent-flow.js")).href);
const { runOrchestrationGraphIfPresent } =
  await import(pathToFileURL(path.join(kitLib, "orchestration-graph-runner.js")).href);

const browserRow = (overrides = {}) => ({
  Name: "browser-agent-smoke",
  runLocality: "local",
  adapter: "local-process",
  agentHost: "",
  browserMode: "operator-approved",
  requiresBrowser: "true",
  orchestrationConfig: JSON.stringify(BROWSER_SMOKE_GRAPH),
  ...overrides,
});

test("hidden for non-sandbox object type", () => {
  const s = deriveSandboxBrowserAgentState({ row: browserRow(), objectType: "api-registry" });
  assert.equal(s.visible, false);
  assert.equal(s.status, "hidden");
});

test("hidden for local-intelligence adapter", () => {
  const s = deriveSandboxBrowserAgentState({ row: browserRow({ adapter: "local-intelligence" }) });
  assert.equal(s.visible, false);
});

test("serverless browser-flagged row → read-only serverless-incompatible note", () => {
  const s = deriveSandboxBrowserAgentState({ row: browserRow({ runLocality: "serverless" }) });
  assert.equal(s.visible, true);
  assert.equal(s.status, "serverless-incompatible");
  assert.match(s.guidance, /local execution/i);
  assert.equal(s.nextAction.id, "switch-to-local");
  assert.equal(s.canRun, false);
});

test("serverless row without browser metadata stays hidden", () => {
  const s = deriveSandboxBrowserAgentState({
    row: { runLocality: "serverless", adapter: "local-process", schedulerRegistryId: "sched" },
  });
  assert.equal(s.visible, false);
});

test("local-agent-host without agentHost → blocked with select-agent-host action", () => {
  const s = deriveSandboxBrowserAgentState({ row: browserRow({ adapter: "local-agent-host" }) });
  assert.equal(s.status, "blocked");
  assert.equal(s.nextAction.id, "select-agent-host");
  assert.ok(s.missing.includes("agentHost"));
  assert.equal(s.canRun, false);
});

test("local-agent-host with missing auth → blocked with check-auth action", () => {
  const s = deriveSandboxBrowserAgentState({
    row: browserRow({ adapter: "local-agent-host", agentHost: "claude_local" }),
    agentAuthStatus: "missing",
  });
  assert.equal(s.status, "blocked");
  assert.equal(s.nextAction.id, "check-auth");
});

test("local-agent-host with non-cataloged host stays hidden", () => {
  const s = deriveSandboxBrowserAgentState({
    row: browserRow({ adapter: "local-agent-host", agentHost: "mystery_host" }),
  });
  assert.equal(s.visible, false);
});

test("ready local row with graph inputs → fill-run-inputs, schema surfaced", () => {
  const s = deriveSandboxBrowserAgentState({
    row: browserRow({ adapter: "local-agent-host", agentHost: "codex_local" }),
    agentAuthStatus: "active",
  });
  assert.equal(s.status, "ready");
  assert.equal(s.requiresInput, true);
  assert.equal(s.nextAction.id, "fill-run-inputs");
  const ids = s.inputFields.map((f) => f.id);
  assert.deepEqual(ids, ["platform", "targetName", "profileUrl", "interest", "sendMode", "operatorApproved"]);
  assert.equal(s.canRun, true);
  assert.equal(s.canCheckAuth, true);
  assert.equal(s.canUseBrowserProfile, true);
});

test("no row-only connected — status fields alone never produce connected", () => {
  const s = deriveSandboxBrowserAgentState({
    row: browserRow({ status: "connected", lastRunId: "run_x" }),
  });
  assert.notEqual(s.status, "connected");
  assert.equal(s.browserProof, null);
});

test("connected from run record with browser proof — reachedTarget honored", () => {
  const record = {
    runId: "run_proof_1",
    exitCode: 0,
    durationMs: 1200,
    stdout: JSON.stringify({
      browser: {
        platform: "notebooklm",
        targetUrl: "https://notebooklm.google.com/notebook/abc",
        currentUrl: "https://notebooklm.google.com/notebook/abc",
        title: "The Melting Bar - NotebookLM",
        reachedTarget: true,
        browserExitCode: 0,
        stderr: "",
      },
      artifact: { id: "brief-1", Status: "generated", Client: "The Melting Bar", RunId: "run_proof_1" },
      fallbackUsed: false,
    }),
  };
  const s = deriveSandboxBrowserAgentState({ row: browserRow(), runRecords: [record] });
  assert.equal(s.status, "connected");
  assert.equal(s.browserProof.reachedTarget, true);
  assert.equal(s.browserProof.platform, "notebooklm");
  assert.equal(s.lastArtifact.id, "brief-1");
  assert.match(s.guidance, /Reached notebooklm/);
  assert.match(s.guidance, /artifact generated/);
});

test("legacy notebook proof normalizes — chromeExitCode → browserExitCode", () => {
  const proof = extractBrowserProofFromRunRecord({
    runId: "run_legacy",
    exitCode: 0,
    stdout: JSON.stringify({
      notebook: {
        targetUrl: "https://notebooklm.google.com/notebook/d742",
        initialUrl: "https://medium.com/post",
        currentUrl: "https://notebooklm.google.com/notebook/d742",
        title: "The Melting Bar - NotebookLM",
        activeNotebookId: "d742",
        reachedTarget: true,
        chromeExitCode: 0,
        chromeStderr: "",
      },
      fallbackUsed: false,
    }),
  });
  assert.equal(proof.platform, "notebooklm");
  assert.equal(proof.browserExitCode, 0);
  assert.equal(proof.platformMeta.activeNotebookId, "d742");
  assert.equal(proof.reachedTarget, true);
});

test("truthful proof — reachedTarget false and fallback surfaced, never upgraded", () => {
  const record = {
    runId: "run_smoke",
    exitCode: 0,
    stdout: JSON.stringify({
      browser: { platform: "notebooklm", targetUrl: "https://x", reachedTarget: false },
      fallbackUsed: true,
    }),
  };
  const s = deriveSandboxBrowserAgentState({ row: browserRow(), runRecords: [record] });
  assert.equal(s.status, "connected"); // run succeeded …
  assert.equal(s.browserProof.reachedTarget, false); // … but proof stays honest
  assert.equal(s.browserProof.fallbackUsed, true);
  assert.match(s.guidance, /did not reach the target/);
});

test("failed from failed lastResponse", () => {
  const s = deriveSandboxBrowserAgentState({
    row: browserRow({ lastResponse: JSON.stringify({ runId: "run_bad", exitCode: 1, error: "exit 1" }) }),
  });
  assert.equal(s.status, "failed");
  assert.equal(s.nextAction.id, "review-failed-run");
  assert.match(s.guidance, /failed before reaching target/i);
});

test("plain stdout produces no browser proof", () => {
  const proof = extractBrowserProofFromRunRecord({ runId: "r", exitCode: 0, stdout: "growthub-probe-ok" });
  assert.equal(proof, null);
});

test("graph runner falls through to adapter for input-schema-only graphs", async () => {
  const result = await runOrchestrationGraphIfPresent({
    workspaceConfig: { dataModel: { objects: [] } },
    row: browserRow(),
    timeoutMs: 5000,
    runInputs: null,
    executionContext: {},
  });
  assert.equal(result, null);
});

test("graph runner still errors for non-executable graphs without human-input", async () => {
  const result = await runOrchestrationGraphIfPresent({
    workspaceConfig: { dataModel: { objects: [] } },
    row: {
      orchestrationConfig: JSON.stringify({
        version: 1,
        provider: "growthub-native",
        nodes: [{ id: "t", type: "transform-filter", config: {} }],
        edges: [],
      }),
    },
    timeoutMs: 5000,
    runInputs: null,
    executionContext: {},
  });
  assert.ok(result);
  assert.match(result.error, /missing an api-registry-call node/);
});
