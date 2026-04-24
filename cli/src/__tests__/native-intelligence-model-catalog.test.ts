import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_MODEL_ID,
  MODEL_CATALOG,
  getDefaultLocalModel,
  getLocalModelVariant,
  inferFamilyFromModelId,
  listLocalModelVariants,
} from "../runtime/native-intelligence/model-catalog.js";
import type { LocalModelVariant } from "../runtime/native-intelligence/contract.js";

describe("native-intelligence model catalog", () => {
  it("contains the default local model", () => {
    const entry = getLocalModelVariant(DEFAULT_LOCAL_MODEL_ID);
    expect(entry).toBeDefined();
    expect(getDefaultLocalModel().id).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it("has unique ids", () => {
    const ids = MODEL_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares all required fields per entry", () => {
    for (const entry of MODEL_CATALOG) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.displayName).toBe("string");
      expect(typeof entry.family).toBe("string");
      expect(entry.contextLength).toBeGreaterThan(0);
      expect(typeof entry.recommendedQuant).toBe("string");
      expect(Array.isArray(entry.strengths)).toBe(true);
      expect(typeof entry.hardwareHint).toBe("string");
    }
  });

  it("lists a stable copy so callers cannot mutate the catalog", () => {
    const first = listLocalModelVariants();
    first.pop();
    expect(listLocalModelVariants().length).toBe(MODEL_CATALOG.length);
  });

  it("resolves ollama tag as an alias of id", () => {
    const gemma = getLocalModelVariant("gemma3:4b");
    expect(gemma?.family).toBe("gemma3");
    const byTag = getLocalModelVariant("qwen3.5-coder:32b");
    expect(byTag?.id).toBe("qwen3.5-coder-32b");
  });

  it("contains the full v1 model set the catalog was introduced for", () => {
    const expectedIds = [
      "gemma3:4b",
      "gemma-4-9b-it",
      "qwen3.5-coder-32b",
      "minimax-m1-80k",
      "kimi-k2.5",
      "deepseek-v3.2",
      "glm-5-32b",
    ];
    for (const id of expectedIds) {
      expect(getLocalModelVariant(id), `catalog must contain ${id}`).toBeDefined();
    }
  });

  describe("inferFamilyFromModelId", () => {
    it("matches catalog entries exactly", () => {
      expect(inferFamilyFromModelId("qwen3.5-coder-32b")).toBe("qwen-coder");
      expect(inferFamilyFromModelId("minimax-m1-80k")).toBe("minimax");
      expect(inferFamilyFromModelId("kimi-k2.5")).toBe("kimi");
      expect(inferFamilyFromModelId("deepseek-v3.2")).toBe("deepseek");
      expect(inferFamilyFromModelId("glm-5-32b")).toBe("glm");
    });

    it("falls back to prefix scan for custom tags", () => {
      expect(inferFamilyFromModelId("gemma3n:e4b")).toBe("gemma3n");
      expect(inferFamilyFromModelId("codegemma:7b")).toBe("codegemma");
      expect(inferFamilyFromModelId("qwen2.5-coder:14b")).toBe("qwen-coder");
      expect(inferFamilyFromModelId("some-unknown-model")).toBe("gemma3");
    });
  });

  it("typed shape is assignable to LocalModelVariant (compile-time guard)", () => {
    const sample: LocalModelVariant = MODEL_CATALOG[0];
    expect(sample.id).toBeDefined();
  });
});
