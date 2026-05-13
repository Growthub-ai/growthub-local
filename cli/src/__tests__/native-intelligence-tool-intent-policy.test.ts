import { describe, it, expect } from "vitest";
import { validateLocalModelToolIntents } from "../runtime/native-intelligence/tool-intent-policy.js";
import type { LocalIntelligenceToolPolicy, LocalModelToolIntent, NodeContractSummary } from "../runtime/native-intelligence/contract.js";

const sampleContract: NodeContractSummary = {
  slug: "video-generation",
  displayName: "Video generation",
  family: "generative",
  nodeType: "capability",
  executionKind: "async",
  executionStrategy: "hosted",
  requiredBindings: [],
  outputTypes: ["video"],
  inputs: [
    { key: "prompt", label: "Prompt", type: "string", required: true },
    { key: "duration", label: "Duration", type: "number", required: false },
  ],
  outputs: [],
};

describe("validateLocalModelToolIntents", () => {
  const basePolicy: LocalIntelligenceToolPolicy = {
    mode: "propose-only",
    allowedToolSlugs: ["video-generation"],
    requiresDeterministicValidation: true,
  };

  it("rejects tool outside allowed list", () => {
    const intents: LocalModelToolIntent[] = [
      { toolSlug: "other-node", reason: "x", input: {}, confidence: 1 },
    ];
    const r = validateLocalModelToolIntents(intents, basePolicy, [sampleContract]);
    expect(r.validated).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reasons.some((x) => x.includes("allowedToolSlugs"))).toBe(true);
  });

  it("rejects slug with no contract", () => {
    const intents: LocalModelToolIntent[] = [
      { toolSlug: "video-generation", reason: "x", input: { prompt: "hi" }, confidence: 1 },
    ];
    const r = validateLocalModelToolIntents(intents, basePolicy, []);
    expect(r.validated).toHaveLength(0);
    expect(r.rejected[0].reasons.some((x) => x.includes("no contract"))).toBe(true);
  });

  it("accepts valid contract-aligned intent and strips unknown fields", () => {
    const intents: LocalModelToolIntent[] = [
      {
        toolSlug: "video-generation",
        reason: "make clip",
        input: { prompt: "hello", extra: "nope" },
        confidence: 0.9,
      },
    ];
    const r = validateLocalModelToolIntents(intents, basePolicy, [sampleContract]);
    expect(r.rejected).toHaveLength(0);
    expect(r.validated).toHaveLength(1);
    expect(r.validated[0].input.extra).toBeUndefined();
    expect(r.validated[0].input.prompt).toBe("hello");
    expect(r.warnings.some((w) => w.includes("unknown field"))).toBe(true);
  });

  it("disabled mode rejects all", () => {
    const policy: LocalIntelligenceToolPolicy = {
      mode: "disabled",
      allowedToolSlugs: ["video-generation"],
      requiresDeterministicValidation: true,
    };
    const intents: LocalModelToolIntent[] = [
      { toolSlug: "video-generation", reason: "x", input: { prompt: "a" }, confidence: 1 },
    ];
    const r = validateLocalModelToolIntents(intents, policy, [sampleContract]);
    expect(r.validated).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
  });

  it("respects minConfidence", () => {
    const policy: LocalIntelligenceToolPolicy = {
      ...basePolicy,
      minConfidence: 0.5,
    };
    const intents: LocalModelToolIntent[] = [
      { toolSlug: "video-generation", reason: "x", input: { prompt: "a" }, confidence: 0.1 },
    ];
    const r = validateLocalModelToolIntents(intents, policy, [sampleContract]);
    expect(r.validated).toHaveLength(0);
    expect(r.rejected[0].reasons.some((x) => x.includes("confidence"))).toBe(true);
  });
});
