import { describe, it, expect } from "vitest";
import {
  parseLocalModelSandboxResult,
  runLocalIntelligenceSandboxTask,
  buildLocalIntelligenceSandboxPrompts,
} from "../runtime/native-intelligence/sandbox-runner.js";
import type { NativeIntelligenceBackend, NativeIntelligenceConfig } from "../runtime/native-intelligence/contract.js";
import type { NodeContractSummary } from "../runtime/cms-node-contracts/types.js";
import { sandboxEnvelopeToTraceRecord, formatTraceRecordLine } from "../runtime/native-intelligence/source-record-export.js";

const contract: NodeContractSummary = {
  slug: "video-generation",
  displayName: "Video",
  family: "generative",
  nodeType: "capability",
  executionKind: "async",
  executionStrategy: "hosted",
  requiredBindings: [],
  outputTypes: [],
  inputs: [{ key: "prompt", label: "Prompt", type: "string", required: true }],
  outputs: [],
};

const baseConfig: NativeIntelligenceConfig = {
  modelId: "gemma3",
  backendType: "local",
  endpoint: "http://127.0.0.1:9/v1/chat/completions",
  localModel: "stub",
};

function taskInput(): Parameters<typeof runLocalIntelligenceSandboxTask>[0] {
  return {
    taskId: "task_test",
    businessObjectType: "sandbox-environment",
    userIntent: "Summarize gaps",
    context: {
      taskId: "task_test",
      businessObjectType: "sandbox-environment",
      executionMode: "local",
      allowedToolSlugs: ["video-generation"],
      availableContracts: [contract],
      toolPolicy: {
        mode: "propose-only",
        allowedToolSlugs: ["video-generation"],
        requiresDeterministicValidation: true,
      },
    },
    adapterMode: "ollama",
  };
}

describe("native-intelligence sandbox runner", () => {
  it("parses valid structured JSON", () => {
    const r = parseLocalModelSandboxResult(
      JSON.stringify({
        text: "ok",
        json: { a: 1 },
        toolIntents: [
          { toolSlug: "video-generation", reason: "r", input: { prompt: "p" }, confidence: 0.8 },
        ],
        warnings: [],
        confidence: 0.5,
      }),
    );
    expect(r.toolIntents).toHaveLength(1);
    expect(r.confidence).toBe(0.5);
  });

  it("handles malformed JSON", () => {
    const r = parseLocalModelSandboxResult("NOT JSON {{{");
    expect(r.warnings.some((w) => w.includes("valid JSON"))).toBe(true);
  });

  it("runs with injected backend and validates intents (no execution)", async () => {
    const backend: NativeIntelligenceBackend = {
      async complete() {
        return {
          text: JSON.stringify({
            toolIntents: [{ toolSlug: "unknown", reason: "", input: {}, confidence: 1 }],
            warnings: [],
            confidence: 1,
          }),
          modelId: "stub-model",
          latencyMs: 3,
        };
      },
    };
    const envelope = await runLocalIntelligenceSandboxTask(taskInput(), baseConfig, { backend });
    expect(envelope.version).toBe("growthub-local-model-sandbox-v1");
    expect(envelope.rejectedToolIntents?.length).toBe(1);
    expect(envelope.validatedToolIntents?.length).toBe(0);
    expect(envelope.trace?.length).toBeGreaterThan(0);
  });

  it("returns fallback envelope when backend throws", async () => {
    const backend: NativeIntelligenceBackend = {
      async complete() {
        throw new Error("unavailable");
      },
    };
    const envelope = await runLocalIntelligenceSandboxTask(taskInput(), baseConfig, { backend });
    expect(envelope.fallback).toBe(true);
    expect(envelope.result.warnings[0]).toContain("unavailable");
  });

  it("exports prompts for trace hashing", () => {
    const prompts = buildLocalIntelligenceSandboxPrompts(taskInput());
    expect(prompts.systemPrompt).toContain("governed sandbox");
    expect(prompts.userPrompt).toContain("Summarize gaps");
    const envelope = {
      version: "growthub-local-model-sandbox-v1" as const,
      taskId: "t",
      businessObjectType: "sandbox-environment",
      adapter: { kind: "local-intelligence" as const, mode: "ollama", modelId: "m" },
      result: { toolIntents: [], warnings: [], confidence: 0 },
      createdAt: new Date().toISOString(),
      latencyMs: 0,
    };
    const line = formatTraceRecordLine(
      sandboxEnvelopeToTraceRecord(envelope, {
        systemPrompt: prompts.systemPrompt,
        userIntent: "Summarize gaps",
        availableContracts: [{ slug: "video-generation", displayName: "Video" }],
      }),
    );
    expect(line.trim().startsWith("{")).toBe(true);
    expect(JSON.parse(line).version).toBe("growthub-local-intelligence-trace-v1");
  });
});
