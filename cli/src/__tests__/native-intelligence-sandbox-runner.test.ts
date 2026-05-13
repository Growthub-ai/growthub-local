import { describe, expect, it } from "vitest";
import { runLocalIntelligenceSandboxTask } from "../runtime/native-intelligence/sandbox-runner.js";
import type { NativeIntelligenceBackend } from "../runtime/native-intelligence/contract.js";
import type { NodeContractSummary } from "../runtime/cms-node-contracts/types.js";
import { NativeIntelligenceBackendError } from "../runtime/native-intelligence/provider.js";
import { isLocalIntelligenceTraceEvent } from "@growthub/api-contract";

function sampleContract(slug: string): NodeContractSummary {
  return {
    slug,
    displayName: slug,
    family: "test",
    nodeType: "capability",
    executionKind: "hosted",
    executionStrategy: "sync",
    requiredBindings: [],
    outputTypes: ["text"],
    inputs: [{ key: "prompt", label: "Prompt", type: "string", required: true }],
    outputs: [{ key: "out", type: "string", required: false }],
  };
}

describe("runLocalIntelligenceSandboxTask", () => {
  it("parses JSON tool intents and validates against contracts", async () => {
    const backend: NativeIntelligenceBackend = {
      async complete() {
        return {
          text: JSON.stringify({
            text: "ok",
            json: { ok: true },
            toolIntents: [
              {
                toolSlug: "alpha",
                reason: "test",
                input: { prompt: "hello" },
                confidence: 0.9,
              },
            ],
            warnings: [],
            confidence: 0.8,
          }),
          modelId: "stub-model",
          latencyMs: 1,
        };
      },
    };

    const contracts = [sampleContract("alpha"), sampleContract("beta")];
    const envelope = await runLocalIntelligenceSandboxTask(
      {
        taskId: "t1",
        businessObjectType: "sandbox-environment",
        userIntent: "probe",
        context: {
          taskId: "t1",
          businessObjectType: "sandbox-environment",
          executionMode: "local",
          allowedToolSlugs: ["alpha"],
          availableContracts: contracts,
        },
      },
      {
        modelId: "gemma3",
        backendType: "local",
        endpoint: "http://127.0.0.1:9/v1/chat/completions",
        localModel: "gemma3:4b",
        localAdapterMode: "ollama",
      },
      backend,
      {
        mode: "propose-only",
        allowedToolSlugs: ["alpha"],
        requiresDeterministicValidation: true,
      },
    );

    expect(envelope.version).toBe("growthub-local-model-sandbox-v1");
    expect(envelope.adapter.kind).toBe("local-intelligence");
    expect(envelope.validatedToolIntents?.length).toBe(1);
    expect(envelope.validatedToolIntents?.[0]?.toolSlug).toBe("alpha");
    expect(envelope.trace?.length).toBeGreaterThan(0);
    for (const line of envelope.trace ?? []) {
      expect(isLocalIntelligenceTraceEvent(line)).toBe(true);
    }
  });

  it("falls back on malformed JSON with warnings", async () => {
    const backend: NativeIntelligenceBackend = {
      async complete() {
        return { text: "not-json", modelId: "x", latencyMs: 1 };
      },
    };
    const envelope = await runLocalIntelligenceSandboxTask(
      {
        taskId: "t2",
        businessObjectType: "x",
        userIntent: "y",
        context: {
          taskId: "t2",
          businessObjectType: "x",
          executionMode: "local",
          allowedToolSlugs: [],
          availableContracts: [],
        },
      },
      {
        modelId: "gemma3",
        backendType: "local",
        endpoint: "http://127.0.0.1:9/v1/chat/completions",
      },
      backend,
    );
    expect(envelope.result.toolIntents.length).toBe(0);
    expect(envelope.result.warnings.some((w) => w.includes("valid JSON"))).toBe(true);
  });

  it("surfaces backend errors without executing tools", async () => {
    const backend: NativeIntelligenceBackend = {
      async complete() {
        throw new NativeIntelligenceBackendError(503, "unavailable");
      },
    };
    const envelope = await runLocalIntelligenceSandboxTask(
      {
        taskId: "t3",
        businessObjectType: "x",
        userIntent: "y",
        context: {
          taskId: "t3",
          businessObjectType: "x",
          executionMode: "local",
          allowedToolSlugs: [],
          availableContracts: [],
        },
      },
      {
        modelId: "gemma3",
        backendType: "local",
        endpoint: "http://127.0.0.1:9/v1/chat/completions",
      },
      backend,
    );
    expect(envelope.result.warnings.some((w) => w.includes("sandbox backend error"))).toBe(true);
    expect(envelope.validatedToolIntents?.length ?? 0).toBe(0);
  });
});
