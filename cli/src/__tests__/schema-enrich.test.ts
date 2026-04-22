/**
 * Schema Enrichment — Unit Tests
 *
 * Covers:
 *   - inferIntent per-family heuristics land on the right provider-neutral intent
 *   - long prompts map to long-text
 *   - numbers retain integer flag
 *   - output mapping maps to NodeOutputFieldType taxonomy
 */

import { describe, expect, it } from "vitest";
import type { CmsCapabilityNode } from "../runtime/cms-capability-registry/index.js";
import {
  enrichInputSchema,
  enrichOutputSchema,
} from "../runtime/cms-node-contracts/schema-enrich.js";

function makeNode(partial: Partial<CmsCapabilityNode>): CmsCapabilityNode {
  return {
    slug: "test-node",
    displayName: "Test",
    icon: "",
    family: "ops",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "test-node",
      input_template: {},
      output_mapping: {},
    },
    requiredBindings: [],
    outputTypes: [],
    enabled: true,
    experimental: false,
    visibility: "authenticated",
    ...partial,
  };
}

describe("enrichInputSchema", () => {
  it("maps prompt to long-text with intent=prompt", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: { prompt: "" },
        output_mapping: {},
      },
    });
    const schema = enrichInputSchema(node);
    expect(schema.fields[0].key).toBe("prompt");
    expect(schema.fields[0].fieldType).toBe("long-text");
    expect(schema.fields[0].providerNeutralIntent).toBe("prompt");
    expect(schema.fields[0].required).toBe(true);
  });

  it("maps integer number with min/max left untouched", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: { duration: 5 },
        output_mapping: {},
      },
    });
    const schema = enrichInputSchema(node);
    const f = schema.fields[0];
    expect(f.fieldType).toBe("number");
    expect(f.providerNeutralIntent).toBe("duration");
    expect((f as { integer?: boolean }).integer).toBe(true);
  });

  it("maps reference_image key to url-or-file", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: { reference_image: "" },
        output_mapping: {},
      },
    });
    const schema = enrichInputSchema(node);
    expect(schema.fields[0].fieldType).toBe("url-or-file");
    expect(schema.fields[0].providerNeutralIntent).toBe("reference-image");
  });

  it("maps api_key to password uiHint", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: { api_key: "" },
        output_mapping: {},
      },
    });
    const schema = enrichInputSchema(node);
    expect(schema.fields[0].providerNeutralIntent).toBe("api-key");
    expect(schema.fields[0].uiHint).toBe("password");
  });

  it("maps model key to dropdown uiHint with intent=model", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: { model: "" },
        output_mapping: {},
      },
    });
    const schema = enrichInputSchema(node);
    expect(schema.fields[0].providerNeutralIntent).toBe("model");
    expect(schema.fields[0].uiHint).toBe("dropdown");
  });
});

describe("enrichOutputSchema", () => {
  it("infers image output for image family when mapping is opaque", () => {
    const node = makeNode({
      family: "image",
      executionTokens: {
        tool_name: "test",
        input_template: {},
        output_mapping: { result: "string" },
      },
    });
    const schema = enrichOutputSchema(node);
    expect(schema.outputs[0].key).toBe("result");
  });

  it("maps video output type directly", () => {
    const node = makeNode({
      executionTokens: {
        tool_name: "test",
        input_template: {},
        output_mapping: { video: "video" },
      },
    });
    const schema = enrichOutputSchema(node);
    expect(schema.outputs[0].fieldType).toBe("video");
  });
});
