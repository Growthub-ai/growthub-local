import { describe, expect, it } from "vitest";
import { validateLocalModelToolIntents } from "../runtime/native-intelligence/tool-intent-policy.js";
import type { NodeContractSummary } from "../runtime/cms-node-contracts/types.js";

function contract(slug: string, required: boolean): NodeContractSummary {
  return {
    slug,
    displayName: slug,
    family: "f",
    nodeType: "n",
    executionKind: "hosted",
    executionStrategy: "sync",
    requiredBindings: [],
    outputTypes: [],
    inputs: [{ key: "prompt", label: "Prompt", type: "string", required }],
    outputs: [],
  };
}

describe("validateLocalModelToolIntents", () => {
  const contracts = [contract("allowed-node", true)];

  it("rejects tool slug outside allow list when list is explicit", () => {
    const r = validateLocalModelToolIntents(
      [{ toolSlug: "other", reason: "x", input: {}, confidence: 1 }],
      {
        mode: "propose-only",
        allowedToolSlugs: ["allowed-node"],
        requiresDeterministicValidation: true,
      },
      contracts,
    );
    expect(r.accepted.length).toBe(0);
    expect(r.rejected.length).toBe(1);
  });

  it("accepts contract-aligned intent", () => {
    const r = validateLocalModelToolIntents(
      [{ toolSlug: "allowed-node", reason: "x", input: { prompt: "hi" }, confidence: 0.9 }],
      {
        mode: "propose-only",
        allowedToolSlugs: ["allowed-node"],
        requiresDeterministicValidation: true,
      },
      contracts,
    );
    expect(r.accepted.length).toBe(1);
    expect(r.rejected.length).toBe(0);
  });

  it("rejects when required binding missing", () => {
    const r = validateLocalModelToolIntents(
      [{ toolSlug: "allowed-node", reason: "x", input: {}, confidence: 1 }],
      {
        mode: "propose-only",
        allowedToolSlugs: ["allowed-node"],
        requiresDeterministicValidation: true,
      },
      contracts,
    );
    expect(r.accepted.length).toBe(0);
    expect(r.rejected[0]?.reasons.some((x) => x.includes("prompt"))).toBe(true);
  });

  it("disabled mode rejects all", () => {
    const r = validateLocalModelToolIntents(
      [{ toolSlug: "allowed-node", reason: "x", input: { prompt: "a" }, confidence: 1 }],
      {
        mode: "disabled",
        allowedToolSlugs: ["allowed-node"],
        requiresDeterministicValidation: true,
      },
      contracts,
    );
    expect(r.accepted.length).toBe(0);
    expect(r.rejected.length).toBe(1);
  });

  it("respects minConfidence", () => {
    const r = validateLocalModelToolIntents(
      [{ toolSlug: "allowed-node", reason: "x", input: { prompt: "a" }, confidence: 0.1 }],
      {
        mode: "propose-only",
        allowedToolSlugs: ["allowed-node"],
        requiresDeterministicValidation: true,
        minConfidence: 0.5,
      },
      contracts,
    );
    expect(r.accepted.length).toBe(0);
  });
});
