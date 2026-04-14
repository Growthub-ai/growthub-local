import { describe, expect, it } from "vitest";
import {
  buildDeterministicNormalization,
} from "../runtime/native-intelligence/normalizer.js";
import type {
  BindingNormalizationInput,
  NodeContractSummary,
} from "../runtime/native-intelligence/contract.js";

function makeContract(inputs: Array<{ key: string; type: string; required: boolean; defaultValue?: unknown }>): NodeContractSummary {
  return {
    slug: "test-node",
    displayName: "Test Node",
    family: "text",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionStrategy: "direct",
    requiredBindings: [],
    outputTypes: [],
    inputs: inputs.map((i) => ({
      key: i.key,
      label: i.key.charAt(0).toUpperCase() + i.key.slice(1),
      type: i.type as any,
      required: i.required,
      defaultValue: i.defaultValue,
    })),
    outputs: [],
  };
}

describe("native-intelligence normalizer", () => {
  describe("buildDeterministicNormalization", () => {
    it("keeps valid bindings unchanged", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { prompt: "Generate a cat image" },
        contract: makeContract([{ key: "prompt", type: "string", required: true }]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.prompt).toBe("Generate a cat image");
      expect(result.missingRequired.length).toBe(0);
      expect(result.fields[0].action).toBe("kept");
      expect(result.confidence).toBe(1.0);
    });

    it("detects missing required bindings", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: {},
        contract: makeContract([
          { key: "prompt", type: "string", required: true },
          { key: "style", type: "string", required: false, defaultValue: "natural" },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.missingRequired).toContain("prompt");
      expect(result.normalizedBindings.style).toBe("natural");
      expect(result.fields.some((f) => f.key === "style" && f.action === "defaulted")).toBe(true);
    });

    it("clears placeholder strings", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: {
          prompt: "Enter your prompt",
          style: "Select a style",
          apiKey: "placeholder",
          todo: "todo",
          tbd: "TBD",
        },
        contract: makeContract([
          { key: "prompt", type: "string", required: true },
          { key: "style", type: "string", required: false },
          { key: "apiKey", type: "string", required: true },
          { key: "todo", type: "string", required: false },
          { key: "tbd", type: "string", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.missingRequired).toContain("prompt");
      expect(result.missingRequired).toContain("apiKey");
      expect(result.fields.filter((f) => f.action === "cleared").length).toBe(5);
      expect(result.warnings.some((w) => w.includes("placeholder"))).toBe(true);
    });

    it("coerces string numbers to number type", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { quality: "1080", count: "5" },
        contract: makeContract([
          { key: "quality", type: "number", required: false },
          { key: "count", type: "number", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.quality).toBe(1080);
      expect(result.normalizedBindings.count).toBe(5);
      expect(result.fields.filter((f) => f.action === "coerced").length).toBe(2);
    });

    it("coerces string booleans to boolean type", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { enabled: "true", verbose: "false", active: "yes" },
        contract: makeContract([
          { key: "enabled", type: "boolean", required: false },
          { key: "verbose", type: "boolean", required: false },
          { key: "active", type: "boolean", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.enabled).toBe(true);
      expect(result.normalizedBindings.verbose).toBe(false);
      expect(result.normalizedBindings.active).toBe(true);
    });

    it("coerces JSON string to array type", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { tags: '["a","b","c"]' },
        contract: makeContract([
          { key: "tags", type: "array", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.tags).toEqual(["a", "b", "c"]);
    });

    it("coerces JSON string to object type", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { config: '{"width":1920,"height":1080}' },
        contract: makeContract([
          { key: "config", type: "object", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.config).toEqual({ width: 1920, height: 1080 });
    });

    it("passes through extra bindings not in contract", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { prompt: "hello", extraField: "bonus" },
        contract: makeContract([
          { key: "prompt", type: "string", required: true },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.extraField).toBe("bonus");
      expect(result.fields.some((f) => f.key === "extraField" && f.reason?.includes("Extra"))).toBe(true);
    });

    it("uses contract defaults for missing optional fields", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: {},
        contract: makeContract([
          { key: "format", type: "string", required: false, defaultValue: "mp4" },
          { key: "quality", type: "number", required: false, defaultValue: 1080 },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.format).toBe("mp4");
      expect(result.normalizedBindings.quality).toBe(1080);
    });

    it("detects angle-bracket placeholders", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { prompt: "<your prompt here>" },
        contract: makeContract([
          { key: "prompt", type: "string", required: true },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.fields[0].action).toBe("cleared");
      expect(result.missingRequired).toContain("prompt");
    });

    it("detects your_ prefixed placeholders", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { apiKey: "your_api_key_here" },
        contract: makeContract([
          { key: "apiKey", type: "string", required: true },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.fields[0].action).toBe("cleared");
      expect(result.missingRequired).toContain("apiKey");
    });

    it("handles empty string as placeholder in required field", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { prompt: "" },
        contract: makeContract([
          { key: "prompt", type: "string", required: true },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.missingRequired).toContain("prompt");
    });

    it("does not coerce invalid number strings", () => {
      const input: BindingNormalizationInput = {
        nodeSlug: "test-node",
        rawBindings: { quality: "not-a-number" },
        contract: makeContract([
          { key: "quality", type: "number", required: false },
        ]),
      };

      const result = buildDeterministicNormalization(input);
      expect(result.normalizedBindings.quality).toBe("not-a-number");
      expect(result.fields[0].action).toBe("kept");
    });
  });
});
