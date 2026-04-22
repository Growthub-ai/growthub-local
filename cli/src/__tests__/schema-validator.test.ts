/**
 * Schema Validator — Unit Tests
 *
 * Covers the exact contract-failure cases called out in the v1 user guide:
 *   - video duration invalid
 *   - text tokens out of range
 *   - text model missing
 *
 * Plus generic required / type checks across field-type variants.
 */

import { describe, expect, it } from "vitest";
import type { NodeInputSchema } from "@growthub/api-contract";
import { validateAgainstSchema } from "../runtime/cms-node-contracts/schema-validator.js";

function schema(fields: NodeInputSchema["fields"]): NodeInputSchema {
  return { fields };
}

describe("validateAgainstSchema", () => {
  it("flags missing required inputs", () => {
    const s = schema([
      { key: "prompt", label: "Prompt", required: true, fieldType: "long-text" },
    ]);
    const result = validateAgainstSchema(s, {});
    expect(result.valid).toBe(false);
    expect(result.missingRequiredInputs).toEqual(["prompt"]);
  });

  it("passes when all required inputs are provided", () => {
    const s = schema([
      { key: "prompt", label: "Prompt", required: true, fieldType: "long-text" },
    ]);
    const result = validateAgainstSchema(s, { prompt: "Hello" });
    expect(result.valid).toBe(true);
  });

  it("flags invalid video duration via number bounds", () => {
    const s = schema([
      {
        key: "duration",
        label: "Duration",
        required: true,
        fieldType: "number",
        min: 1,
        max: 10,
        integer: true,
      },
    ]);
    const bad = validateAgainstSchema(s, { duration: 120 });
    expect(bad.valid).toBe(false);
    expect(bad.warnings.join("\n")).toMatch(/<= 10/);
    const good = validateAgainstSchema(s, { duration: 5 });
    expect(good.valid).toBe(true);
  });

  it("flags text tokens out of range", () => {
    const s = schema([
      {
        key: "max_tokens",
        label: "Max Tokens",
        required: true,
        fieldType: "number",
        min: 1,
        max: 4096,
        integer: true,
      },
    ]);
    const bad = validateAgainstSchema(s, { max_tokens: 100000 });
    expect(bad.valid).toBe(false);
    expect(bad.warnings.join("\n")).toMatch(/<= 4096/);
  });

  it("flags a missing model binding via requiredBindings option", () => {
    const s = schema([]);
    const result = validateAgainstSchema(s, {}, { requiredBindings: ["model"] });
    expect(result.valid).toBe(false);
    expect(result.missingRequiredBindings).toEqual(["model"]);
  });

  it("rejects select values outside the option set", () => {
    const s = schema([
      {
        key: "style",
        label: "Style",
        required: false,
        fieldType: "select",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    ]);
    const bad = validateAgainstSchema(s, { style: "c" });
    expect(bad.valid).toBe(false);
    const good = validateAgainstSchema(s, { style: "a" });
    expect(good.valid).toBe(true);
  });

  it("enforces array minItems / maxItems", () => {
    const s = schema([
      { key: "items", label: "Items", required: true, fieldType: "array", minItems: 1, maxItems: 3 },
    ]);
    expect(validateAgainstSchema(s, { items: [] }).valid).toBe(false);
    expect(validateAgainstSchema(s, { items: ["a", "b", "c", "d"] }).valid).toBe(false);
    expect(validateAgainstSchema(s, { items: ["a"] }).valid).toBe(true);
  });
});
