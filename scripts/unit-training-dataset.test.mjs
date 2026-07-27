import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDistillationTraceJsonl,
  distillationTraceToJsonlLine,
} from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/training-dataset.js";

function trace(overrides = {}) {
  return {
    traceId: "trace-1",
    capturedAt: "2026-07-27T18:00:00.000Z",
    teacherModel: "claude-test",
    teacherProviderId: "anthropic",
    clusterId: "support",
    prompt: "Explain the support policy.",
    response: "Here is the governed answer.",
    reasoning: "Provider-returned rationale.",
    promptTokens: 12,
    completionTokens: 8,
    synthetic: true,
    accepted: true,
    qualityStatus: "qualified",
    redactionStatus: "applied",
    ...overrides,
  };
}

test("distillation JSONL preserves the complete normalized trace deterministically", () => {
  const first = distillationTraceToJsonlLine(trace());
  const second = distillationTraceToJsonlLine(trace());
  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
  const parsed = JSON.parse(first);
  assert.equal(parsed.schema, "growthub-distillation-trace-v1");
  assert.equal(parsed.prompt, "Explain the support policy.");
  assert.equal(parsed.response, "Here is the governed answer.");
  assert.equal(parsed.reasoning, "Provider-returned rationale.");
  assert.equal(buildDistillationTraceJsonl([trace(), trace({ traceId: "trace-2" })]).split("\n").filter(Boolean).length, 2);
});

test("distillation JSONL refuses incomplete traces", () => {
  assert.throws(
    () => distillationTraceToJsonlLine(trace({ response: "" })),
    /incomplete/,
  );
});
