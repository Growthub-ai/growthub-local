/**
 * validatePipelineAgainstSchemas — Unit Tests
 */

import { describe, expect, it } from "vitest";
import type { CapabilityManifest } from "@growthub/api-contract";
import { validatePipelineAgainstSchemas } from "../runtime/cms-node-contracts/compile.js";
import type { PipelineLike } from "../runtime/cms-node-contracts/types.js";

const manifest: CapabilityManifest = {
  slug: "image-gen",
  family: "image",
  displayName: "Image Gen",
  executionKind: "hosted-execute",
  requiredBindings: ["api_key"],
  outputTypes: ["image"],
  node: {
    slug: "image-gen",
    displayName: "Image Gen",
    icon: "",
    family: "image",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: { tool_name: "image-gen", input_template: {}, output_mapping: {} },
    requiredBindings: ["api_key"],
    outputTypes: ["image"],
    enabled: true,
    experimental: false,
    visibility: "authenticated",
  },
  inputSchema: {
    fields: [
      { key: "prompt", label: "Prompt", required: true, fieldType: "long-text" },
    ],
  },
  provenance: { originType: "hosted", recordedAt: new Date().toISOString() },
};

describe("validatePipelineAgainstSchemas", () => {
  it("reports issues for missing required fields", () => {
    const pipeline: PipelineLike = {
      pipelineId: "p",
      executionMode: "hosted",
      nodes: [{ id: "n1", slug: "image-gen", bindings: { api_key: "k" } }],
    };
    const result = validatePipelineAgainstSchemas(
      pipeline,
      new Map([["image-gen", manifest]]),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.warning.includes("prompt"))).toBe(true);
  });

  it("returns valid when all required inputs + bindings are present", () => {
    const pipeline: PipelineLike = {
      pipelineId: "p",
      executionMode: "hosted",
      nodes: [{ id: "n1", slug: "image-gen", bindings: { api_key: "k", prompt: "hi" } }],
    };
    const result = validatePipelineAgainstSchemas(
      pipeline,
      new Map([["image-gen", manifest]]),
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("skips nodes whose manifest has no inputSchema (additive-only rule)", () => {
    const noSchema = { ...manifest, inputSchema: undefined };
    const pipeline: PipelineLike = {
      pipelineId: "p",
      executionMode: "hosted",
      nodes: [{ id: "n1", slug: "image-gen", bindings: {} }],
    };
    const result = validatePipelineAgainstSchemas(
      pipeline,
      new Map([["image-gen", noSchema]]),
    );
    expect(result.valid).toBe(true);
  });
});
