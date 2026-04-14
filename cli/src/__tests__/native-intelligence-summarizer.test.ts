import { describe, expect, it } from "vitest";
import {
  buildDeterministicSummary,
} from "../runtime/native-intelligence/summarizer.js";
import type {
  ExecutionSummaryInput,
  PipelineSummaryForIntelligence,
  NodeContractSummary,
  ExecutionResultForIntelligence,
} from "../runtime/native-intelligence/contract.js";

function makeContract(slug: string, family = "text", outputTypes: string[] = []): NodeContractSummary {
  return {
    slug,
    displayName: slug,
    family,
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionStrategy: "direct",
    requiredBindings: [],
    outputTypes,
    inputs: [
      { key: "prompt", label: "Prompt", type: "string", required: true },
      { key: "quality", label: "Quality", type: "number", required: false, defaultValue: 1080 },
    ],
    outputs: [],
  };
}

function makePipelineSummary(
  nodes: PipelineSummaryForIntelligence["nodes"],
  warnings: string[] = [],
): PipelineSummaryForIntelligence {
  return {
    pipelineId: "pipe_test123",
    executionMode: "hosted",
    nodes,
    warnings,
  };
}

describe("native-intelligence summarizer", () => {
  describe("buildDeterministicSummary", () => {
    it("generates a pre-save summary with correct title", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "image-generation", bindingCount: 2, missingRequired: [], outputTypes: ["image"], assetCount: 0 },
        ]),
        registryContext: [makeContract("image-generation", "image", ["image"])],
        phase: "pre-save",
      };

      const result = buildDeterministicSummary(input);
      expect(result.title).toContain("Pre-Save");
      expect(result.title).toContain("1-node");
      expect(result.explanation).toContain("pipe_test123");
      expect(result.explanation).toContain("image-generation");
      expect(result.confidence).toBe(1.0);
    });

    it("generates a pre-execution summary with runtime mode note", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "video-generation", bindingCount: 3, missingRequired: [], outputTypes: ["video"], assetCount: 0 },
        ]),
        registryContext: [makeContract("video-generation", "video", ["video"])],
        phase: "pre-execution",
      };

      const result = buildDeterministicSummary(input);
      expect(result.title).toContain("Pre-Execution");
      expect(result.runtimeModeNote).toContain("hosted");
      expect(result.costLatencyCautions.length).toBeGreaterThan(0);
      expect(result.costLatencyCautions[0]).toContain("video");
    });

    it("flags missing required bindings with guidance", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "image-generation", bindingCount: 1, missingRequired: ["prompt"], outputTypes: ["image"], assetCount: 0 },
        ]),
        registryContext: [makeContract("image-generation", "image", ["image"])],
        phase: "pre-save",
      };

      const result = buildDeterministicSummary(input);
      expect(result.missingBindingGuidance.length).toBe(1);
      expect(result.missingBindingGuidance[0]).toContain("prompt");
      expect(result.missingBindingGuidance[0]).toContain("Prompt");
      expect(result.explanation).toContain("missing");
    });

    it("generates post-execution summary with artifact count", () => {
      const executionResult: ExecutionResultForIntelligence = {
        status: "succeeded",
        nodeStatuses: { "node-1": "succeeded" },
        artifactCount: 3,
        outputText: "Generated 3 images successfully.",
      };

      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "image-generation", bindingCount: 2, missingRequired: [], outputTypes: ["image"], assetCount: 0 },
        ]),
        registryContext: [makeContract("image-generation", "image", ["image"])],
        phase: "post-execution",
        executionResult,
      };

      const result = buildDeterministicSummary(input);
      expect(result.title).toContain("Completed");
      expect(result.explanation).toContain("1 succeeded");
      expect(result.explanation).toContain("3 artifact");
      expect(result.outputExpectation).toContain("Generated 3 images");
    });

    it("generates post-execution summary with failure details", () => {
      const executionResult: ExecutionResultForIntelligence = {
        status: "failed",
        nodeStatuses: { "node-1": "failed" },
        artifactCount: 0,
        errorMessages: ["Provider timeout after 30s"],
      };

      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "video-generation", bindingCount: 2, missingRequired: [], outputTypes: ["video"], assetCount: 0 },
        ]),
        registryContext: [makeContract("video-generation", "video", ["video"])],
        phase: "post-execution",
        executionResult,
      };

      const result = buildDeterministicSummary(input);
      expect(result.title).toContain("Failed");
      expect(result.explanation).toContain("1 failed");
      expect(result.warnings).toContain("Execution error: Provider timeout after 30s");
    });

    it("generates recommendation-phase summary", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "text-generation", bindingCount: 2, missingRequired: [], outputTypes: ["text"], assetCount: 0 },
          { slug: "image-generation", bindingCount: 3, missingRequired: [], outputTypes: ["image"], assetCount: 0 },
        ]),
        registryContext: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("image-generation", "image", ["image"]),
        ],
        phase: "recommendation",
      };

      const result = buildDeterministicSummary(input);
      expect(result.title).toContain("Analysis");
      expect(result.explanation).toContain("2 node");
      expect(result.explanation).toContain("ready for execution");
    });

    it("warns about high asset count nodes", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "image-generation", bindingCount: 2, missingRequired: [], outputTypes: ["image"], assetCount: 10 },
        ]),
        registryContext: [makeContract("image-generation", "image", ["image"])],
        phase: "pre-execution",
      };

      const result = buildDeterministicSummary(input);
      expect(result.costLatencyCautions.some((c) => c.includes("10 assets"))).toBe(true);
    });

    it("populates output expectation from output types", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "image-generation", bindingCount: 2, missingRequired: [], outputTypes: ["image", "text"], assetCount: 0 },
        ]),
        registryContext: [makeContract("image-generation", "image", ["image", "text"])],
        phase: "pre-save",
      };

      const result = buildDeterministicSummary(input);
      expect(result.outputExpectation).toContain("image");
      expect(result.outputExpectation).toContain("text");
    });

    it("handles multi-node pipeline with mixed missing bindings", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary([
          { slug: "text-generation", bindingCount: 1, missingRequired: ["prompt"], outputTypes: ["text"], assetCount: 0 },
          { slug: "image-generation", bindingCount: 3, missingRequired: [], outputTypes: ["image"], assetCount: 0 },
        ]),
        registryContext: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("image-generation", "image", ["image"]),
        ],
        phase: "pre-execution",
      };

      const result = buildDeterministicSummary(input);
      expect(result.missingBindingGuidance.length).toBe(1);
      expect(result.explanation).toContain("1 required binding(s) are unresolved");
    });

    it("propagates pipeline warnings", () => {
      const input: ExecutionSummaryInput = {
        pipeline: makePipelineSummary(
          [{ slug: "ops-task", bindingCount: 1, missingRequired: [], outputTypes: [], assetCount: 0 }],
          ["Node capability might be disabled"],
        ),
        registryContext: [makeContract("ops-task", "ops")],
        phase: "pre-execution",
      };

      const result = buildDeterministicSummary(input);
      expect(result.warnings).toContain("Node capability might be disabled");
    });

    it("handles local execution mode note", () => {
      const input: ExecutionSummaryInput = {
        pipeline: {
          pipelineId: "pipe_local",
          executionMode: "local",
          nodes: [{ slug: "local-task", bindingCount: 1, missingRequired: [], outputTypes: [], assetCount: 0 }],
          warnings: [],
        },
        registryContext: [makeContract("local-task", "ops")],
        phase: "pre-execution",
      };

      const result = buildDeterministicSummary(input);
      expect(result.runtimeModeNote).toContain("local");
    });
  });
});
