import { describe, expect, it } from "vitest";
import {
  buildDeterministicPlan,
} from "../runtime/native-intelligence/planner.js";
import type {
  WorkflowPlanningInput,
  NodeContractSummary,
  WorkflowSummaryForIntelligence,
} from "../runtime/native-intelligence/contract.js";

function makeContract(
  slug: string,
  family = "text",
  outputTypes: string[] = [],
  inputs: Array<{ key: string; type: string; required: boolean; defaultValue?: unknown }> = [],
): NodeContractSummary {
  return {
    slug,
    displayName: slug.replace(/-/g, " "),
    family,
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionStrategy: "direct",
    requiredBindings: [],
    outputTypes,
    inputs: inputs.length > 0
      ? inputs.map((i) => ({
          key: i.key,
          label: i.key,
          type: i.type as any,
          required: i.required,
          defaultValue: i.defaultValue,
        }))
      : [{ key: "prompt", label: "Prompt", type: "string" as const, required: true }],
    outputs: [],
  };
}

function makeWorkflow(
  overrides: Partial<WorkflowSummaryForIntelligence> & { workflowId: string; name: string },
): WorkflowSummaryForIntelligence {
  return {
    workflowId: overrides.workflowId,
    name: overrides.name,
    nodeCount: overrides.nodeCount ?? 1,
    nodeSlugs: overrides.nodeSlugs ?? [],
    label: overrides.label ?? "experimental",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    versionCount: overrides.versionCount ?? 1,
  };
}

describe("native-intelligence planner", () => {
  describe("buildDeterministicPlan", () => {
    it("proposes nodes matching intent tokens", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate a video from text prompt",
        availableContracts: [
          makeContract("video-generation", "video", ["video"]),
          makeContract("image-generation", "image", ["image"]),
          makeContract("text-generation", "text", ["text"]),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.proposedNodes.length).toBeGreaterThan(0);
      const slugs = result.proposedNodes.map((n) => n.slug);
      expect(slugs).toContain("video-generation");
      expect(slugs).toContain("text-generation");
    });

    it("returns empty plan when no contracts match", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "completely unrelated gibberish xyz123",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.proposedNodes.length).toBe(0);
      expect(result.warnings.some((w) => w.includes("No contracts matched"))).toBe(true);
      expect(result.confidence).toBeLessThan(0.3);
    });

    it("respects maxNodes constraint", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate text image video slides",
        availableContracts: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("image-generation", "image", ["image"]),
          makeContract("video-generation", "video", ["video"]),
          makeContract("slides-generation", "slides", ["slides"]),
        ],
        constraints: { maxNodes: 2 },
      };

      const result = buildDeterministicPlan(input);
      expect(result.proposedNodes.length).toBeLessThanOrEqual(2);
    });

    it("respects requiredOutputTypes constraint", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "create content",
        availableContracts: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("image-generation", "image", ["image"]),
          makeContract("video-generation", "video", ["video"]),
        ],
        constraints: { requiredOutputTypes: ["video"] },
      };

      const result = buildDeterministicPlan(input);
      const slugs = result.proposedNodes.map((n) => n.slug);
      expect(slugs).toContain("video-generation");
    });

    it("warns when required output types cannot be fulfilled", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "create something",
        availableContracts: [
          makeContract("text-generation", "text", ["text"]),
        ],
        constraints: { requiredOutputTypes: ["video", "slides"] },
      };

      const result = buildDeterministicPlan(input);
      expect(result.warnings.some((w) => w.includes("video") || w.includes("slides"))).toBe(true);
    });

    it("respects avoidSlugs constraint", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate image content",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
          makeContract("image-resize", "image", ["image"]),
        ],
        constraints: { avoidSlugs: ["image-generation"] },
      };

      const result = buildDeterministicPlan(input);
      const slugs = result.proposedNodes.map((n) => n.slug);
      expect(slugs).not.toContain("image-generation");
    });

    it("respects preferredFamilies constraint", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate content",
        availableContracts: [
          makeContract("text-generation", "text", ["text"]),
          makeContract("image-generation", "image", ["image"]),
        ],
        constraints: { preferredFamilies: ["image"] },
      };

      const result = buildDeterministicPlan(input);
      if (result.proposedNodes.length > 0) {
        expect(result.proposedNodes[0].slug).toBe("image-generation");
      }
    });

    it("suggests alternative existing workflow when one matches", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate product images for catalog",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
        existingWorkflows: [
          makeWorkflow({
            workflowId: "wf-existing",
            name: "Product Image Generator",
            nodeSlugs: ["image-generation"],
            label: "canonical",
          }),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.alternativeExistingWorkflowId).toBe("wf-existing");
      expect(result.alternativeExistingWorkflowReason).toContain("Product Image");
    });

    it("does not suggest archived workflows as alternatives", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate images",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
        existingWorkflows: [
          makeWorkflow({
            workflowId: "wf-archived",
            name: "Image Generator",
            nodeSlugs: ["image-generation"],
            label: "archived",
          }),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.alternativeExistingWorkflowId).toBeUndefined();
    });

    it("populates suggestedBindings from contract defaults", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate an image",
        availableContracts: [
          makeContract("image-generation", "image", ["image"], [
            { key: "prompt", type: "string", required: true },
            { key: "width", type: "number", required: false, defaultValue: 1024 },
          ]),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.proposedNodes.length).toBe(1);
      expect(result.proposedNodes[0].suggestedBindings).toHaveProperty("prompt");
      expect(result.proposedNodes[0].suggestedBindings.width).toBe(1024);
    });

    it("explanation describes the proposed graph", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate image",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicPlan(input);
      expect(result.explanation).toContain("image-generation");
      expect(result.explanation).toContain("pipeline");
    });

    it("does not duplicate slugs in proposed nodes", () => {
      const input: WorkflowPlanningInput = {
        userIntent: "generate image image image",
        availableContracts: [
          makeContract("image-generation", "image", ["image"]),
        ],
      };

      const result = buildDeterministicPlan(input);
      const slugs = result.proposedNodes.map((n) => n.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
