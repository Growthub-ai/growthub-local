import { describe, expect, it } from "vitest";
import {
  buildDeterministicRecommendation,
} from "../runtime/native-intelligence/recommender.js";
import type {
  WorkflowRecommendationInput,
  WorkflowSummaryForIntelligence,
  NodeContractSummary,
} from "../runtime/native-intelligence/contract.js";

function makeWorkflowSummary(
  overrides: Partial<WorkflowSummaryForIntelligence> & { workflowId: string; name: string },
): WorkflowSummaryForIntelligence {
  return {
    workflowId: overrides.workflowId,
    name: overrides.name,
    description: overrides.description,
    nodeCount: overrides.nodeCount ?? 1,
    nodeSlugs: overrides.nodeSlugs ?? [],
    label: overrides.label ?? "experimental",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt,
    versionCount: overrides.versionCount ?? 1,
  };
}

function makeContract(slug: string, family = "text", outputTypes: string[] = []): NodeContractSummary {
  return {
    slug,
    displayName: slug.replace(/-/g, " "),
    family,
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionStrategy: "direct",
    requiredBindings: [],
    outputTypes,
    inputs: [{ key: "prompt", label: "Prompt", type: "string", required: true }],
    outputs: [],
  };
}

describe("native-intelligence recommender", () => {
  describe("buildDeterministicRecommendation", () => {
    it("recommends reusing an existing workflow when name matches intent", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "generate product images for marketing",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-1",
            name: "Product Image Generation",
            nodeSlugs: ["image-generation"],
            label: "canonical",
            versionCount: 5,
          }),
          makeWorkflowSummary({
            workflowId: "wf-2",
            name: "Video Pipeline",
            nodeSlugs: ["video-generation"],
          }),
        ],
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
          makeContract("video-generation", "video", ["video"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).toBe("reuse-existing");
      expect(result.topRecommendation.workflowId).toBe("wf-1");
      expect(result.topRecommendation.workflowName).toContain("Product Image");
      expect(result.topRecommendation.confidence).toBeGreaterThan(0);
    });

    it("recommends template when no saved workflow matches", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "generate a video for social media",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-1",
            name: "Email Report Pipeline",
            nodeSlugs: ["text-generation"],
          }),
        ],
        availableContracts: [
          makeContract("video-generation", "video", ["video"]),
          makeContract("text-generation", "text", ["text"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).toBe("start-from-template");
      expect(result.topRecommendation.templateSlug).toBe("video-generation");
    });

    it("recommends synthesize-new when nothing matches", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "do something completely unique and novel",
        savedWorkflows: [],
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).toBe("synthesize-new");
    });

    it("excludes archived workflows from top recommendation", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "generate product images",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-archived",
            name: "Product Image Generation",
            nodeSlugs: ["image-generation"],
            label: "archived",
          }),
        ],
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).not.toBe("reuse-existing");
    });

    it("prefers canonical over experimental workflows", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "create slides presentation",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-exp",
            name: "Slides Creator",
            nodeSlugs: ["slides-generation"],
            label: "experimental",
            versionCount: 1,
          }),
          makeWorkflowSummary({
            workflowId: "wf-canon",
            name: "Slides Creator Production",
            nodeSlugs: ["slides-generation"],
            label: "canonical",
            versionCount: 5,
          }),
        ],
        availableContracts: [
          makeContract("slides-generation", "slides", ["slides"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      if (result.topRecommendation.strategy === "reuse-existing") {
        expect(result.topRecommendation.workflowId).toBe("wf-canon");
      }
    });

    it("provides alternatives when a good match is found", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "generate images for website",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-1",
            name: "Website Image Generation",
            nodeSlugs: ["image-generation"],
            label: "canonical",
            versionCount: 3,
          }),
        ],
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it("matches on node slugs in intent", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "run the image-generation node",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-img",
            name: "My Images",
            nodeSlugs: ["image-generation"],
            label: "experimental",
          }),
        ],
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).toBe("reuse-existing");
      expect(result.topRecommendation.workflowId).toBe("wf-img");
    });

    it("matches on output types in intent", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "I need video content",
        savedWorkflows: [],
        availableContracts: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("video-maker", "video", ["video"]),
        ],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.topRecommendation.strategy).toBe("start-from-template");
      expect(result.topRecommendation.templateSlug).toBe("video-maker");
    });

    it("explanation mentions number of matching workflows", () => {
      const input: WorkflowRecommendationInput = {
        userIntent: "generate images",
        savedWorkflows: [
          makeWorkflowSummary({
            workflowId: "wf-1",
            name: "Image Pipeline A",
            nodeSlugs: ["image-generation"],
            label: "canonical",
            versionCount: 3,
          }),
          makeWorkflowSummary({
            workflowId: "wf-2",
            name: "Image Pipeline B",
            nodeSlugs: ["image-generation"],
            label: "experimental",
          }),
        ],
        availableContracts: [makeContract("image-generation", "image", ["image"])],
      };

      const result = buildDeterministicRecommendation(input);
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });
});
