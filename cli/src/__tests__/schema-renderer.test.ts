/**
 * Schema Renderer — Unit Tests
 *
 * Covers the three render modes: interactive (via injected prompt),
 * non-interactive (payload), and agent-json (schema echoed back).
 */

import { describe, expect, it } from "vitest";
import type { NodeInputSchema } from "@growthub/api-contract";
import { renderSchema } from "../runtime/cms-node-contracts/schema-renderer.js";

const schema: NodeInputSchema = {
  fields: [
    { key: "prompt", label: "Prompt", required: true, fieldType: "long-text", defaultValue: "" },
    { key: "count", label: "Count", required: false, fieldType: "number", defaultValue: 1 },
  ],
};

describe("renderSchema", () => {
  it("non-interactive mode merges payload over defaults", async () => {
    const result = await renderSchema(schema, {
      mode: "non-interactive",
      nonInteractivePayload: { prompt: "hi" },
    });
    expect(result.bindings.prompt).toBe("hi");
    expect(result.bindings.count).toBe(1);
    expect(result.awaitingAgentReply).toBe(false);
  });

  it("agent-json mode returns the schema and does not expect a reply dispatch", async () => {
    const result = await renderSchema(schema, { mode: "agent-json" });
    expect(result.schema).toBe(schema);
    expect(result.awaitingAgentReply).toBe(true);
  });

  it("interactive mode invokes the adapter only for missing required fields", async () => {
    const prompts: string[] = [];
    const result = await renderSchema(schema, {
      mode: "interactive",
      interactivePrompt: async (field) => {
        prompts.push(field.key);
        return "value-for-" + field.key;
      },
    });
    expect(prompts).toEqual(["prompt"]);
    expect(result.bindings.prompt).toBe("value-for-prompt");
  });
});
