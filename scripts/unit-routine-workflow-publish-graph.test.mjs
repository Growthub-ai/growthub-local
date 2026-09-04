import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseOrchestrationGraph, validateOrchestrationGraph } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/orchestration-graph.js";
import { stableStringify } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-patch-policy.js";
import { findVerifiedDraftRunRecord } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workflow-publish-promotion.js";

test("accepts the canonical provider-bound GH workflow graph executed by a governed Routine adapter", () => {
  const graph = {
    version: 1,
    provider: "growthub-native",
    source: "workspace-routine-conversation",
    nodes: [
      { id: "input", type: "input", config: { inputMode: "manual" } },
      {
        id: "routine-agent",
        type: "textModel",
        data: { label: "Weekly operating brief", prompt: "Summarize readiness.", reasoningEffort: "auto" },
      },
      { id: "result", type: "tool-result", config: { writeLastResponse: true } },
    ],
    edges: [
      { id: "input-agent", source: "input", target: "routine-agent", from: "input", to: "routine-agent" },
      { id: "agent-result", source: "routine-agent", target: "result", from: "routine-agent", to: "result" },
    ],
  };

  assert.deepEqual(validateOrchestrationGraph(graph), { ok: true, errors: [] });
});

test("still rejects an unknown remote workflow primitive", () => {
  const verdict = validateOrchestrationGraph({
    version: 1,
    provider: "growthub-native",
    nodes: [{ id: "unsafe", type: "unregisteredRemoteNode" }],
    edges: [],
  });

  assert.equal(verdict.ok, false);
  assert.match(verdict.errors.join("\n"), /not a known node type/);
});

test("publishes from the recovered terminal execution after a stale transport failure", () => {
  const draftRunId = "run-recovered-terminal";
  const outputHash = "df1d26e1d58d2f37";
  const draft = JSON.stringify({
    version: 1,
    provider: "growthub-native",
    nodes: [{ id: "input", type: "input", config: { inputMode: "manual" } }],
    edges: [],
  });
  const draftSha256 = createHash("sha256")
    .update(stableStringify(parseOrchestrationGraph(draft)), "utf8")
    .digest("hex");
  const recovered = {
    runId: draftRunId,
    exitCode: 0,
    useDraft: true,
    draftSha256,
    outputHash,
  };
  const selected = findVerifiedDraftRunRecord({
    records: [
      { runId: draftRunId, exitCode: null, useDraft: true, draftSha256, error: "fetch failed" },
      recovered,
      { kind: "growthub-sandbox-run-handle-v1", runId: draftRunId, outputHash },
    ],
    draftRunId,
    draft,
    outputHash,
  });

  assert.deepEqual(selected, recovered);
});
