#!/usr/bin/env node
/**
 * Unit coverage for local-agent-host telemetry normalization.
 *
 * The thin adapter may only surface tokens/tools when a host reports usage
 * explicitly. It must never estimate from model prose, duration, or output
 * length.
 *
 * Run with: node --test scripts/unit-local-agent-host-telemetry.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/sandboxes/default-local-agent-host.js"
);

const { extractAgentHostTelemetry } = await import(pathToFileURL(adapterPath).href);

test("model prose is not treated as telemetry", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: "I used 123 total tokens and 4 tools, trust me.",
      stderr: "",
    }),
    { tokens: null, tools: null }
  );
});

test("structured stdout usage block is accepted", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: JSON.stringify({
        usage: { input_tokens: 100, output_tokens: 23 },
        choices: [{ message: { tool_calls: [{ name: "read" }, { name: "write" }] } }],
      }),
      stderr: "",
    }),
    { tokens: 123, tools: 2 }
  );
});

test("stderr marker usage block is accepted", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: "answer",
      stderr: 'noise\nGROWTHUB_AGENT_TELEMETRY: {"usage":{"total_tokens":456},"tool_count":3}\n',
    }),
    { tokens: 456, tools: 3 }
  );
});

test("stderr status lines are accepted as host-reported telemetry", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: "answer",
      stderr: "input tokens: 100\noutput tokens: 20\ntool calls: 1\n",
    }),
    { tokens: 120, tools: 1 }
  );
});

test("codex footer tokens-used block is accepted", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: "telemetry smoke ok",
      stderr: "codex\ntelemetry smoke ok\ntokens used\n18,737\n",
    }),
    { tokens: 18737, tools: 0 }
  );
});

test("invalid and negative reported values stay null", () => {
  assert.deepEqual(
    extractAgentHostTelemetry({
      stdout: JSON.stringify({ usage: { total_tokens: "bad" }, tools: -1 }),
      stderr: "",
    }),
    { tokens: null, tools: null }
  );
});
