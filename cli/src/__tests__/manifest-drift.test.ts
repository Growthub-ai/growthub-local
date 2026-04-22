/**
 * Manifest Drift — Unit Tests
 *
 * Covers every `ManifestDriftMarker.change` kind from the v1 contract.
 */

import { describe, expect, it } from "vitest";
import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract";
import { compareEnvelopes } from "../runtime/manifest-registry/drift.js";

function makeManifest(slug: string, overrides: Partial<CapabilityManifest> = {}): CapabilityManifest {
  const base: CapabilityManifest = {
    slug,
    family: "ops",
    displayName: slug,
    executionKind: "hosted-execute",
    requiredBindings: [],
    outputTypes: ["text"],
    node: {
      slug,
      displayName: slug,
      icon: "",
      family: "ops",
      category: "automation",
      nodeType: "tool_execution",
      executionKind: "hosted-execute",
      executionBinding: { type: "mcp_tool_call", strategy: "direct" },
      executionTokens: { tool_name: slug, input_template: {}, output_mapping: {} },
      requiredBindings: [],
      outputTypes: ["text"],
      enabled: true,
      experimental: false,
      visibility: "authenticated",
    },
    inputSchema: { fields: [] },
    outputSchema: { outputs: [] },
    provenance: { originType: "hosted", recordedAt: new Date().toISOString() },
  };
  return { ...base, ...overrides };
}

function envelope(capabilities: CapabilityManifest[]): CapabilityManifestEnvelope {
  return {
    version: 1,
    host: "test",
    fetchedAt: new Date().toISOString(),
    source: "hosted",
    capabilities,
  };
}

describe("compareEnvelopes", () => {
  it("returns empty markers when envelopes are identical", () => {
    const a = envelope([makeManifest("image-gen")]);
    const result = compareEnvelopes(a, a);
    expect(result.markers).toHaveLength(0);
  });

  it("emits 'added' for new slugs", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const next = envelope([makeManifest("image-gen"), makeManifest("video-gen")]);
    const result = compareEnvelopes(prev, next);
    const added = result.markers.filter((m) => m.change === "added");
    expect(added.map((m) => m.slug)).toEqual(["video-gen"]);
  });

  it("emits 'removed' for missing slugs", () => {
    const prev = envelope([makeManifest("image-gen"), makeManifest("video-gen")]);
    const next = envelope([makeManifest("image-gen")]);
    const result = compareEnvelopes(prev, next);
    const removed = result.markers.filter((m) => m.change === "removed");
    expect(removed.map((m) => m.slug)).toEqual(["video-gen"]);
  });

  it("emits 'executionKind' when the kind changes", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const next = envelope([
      makeManifest("image-gen", { executionKind: "provider-assembly", node: { ...makeManifest("image-gen").node, executionKind: "provider-assembly" } }),
    ]);
    const result = compareEnvelopes(prev, next);
    expect(result.markers.some((m) => m.change === "executionKind")).toBe(true);
  });

  it("emits 'requiredBindings' when the set changes", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const next = envelope([makeManifest("image-gen", { requiredBindings: ["api-key"] })]);
    const result = compareEnvelopes(prev, next);
    expect(result.markers.some((m) => m.change === "requiredBindings")).toBe(true);
  });

  it("emits 'outputTypes' when outputs change", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const next = envelope([makeManifest("image-gen", { outputTypes: ["image"] })]);
    const result = compareEnvelopes(prev, next);
    expect(result.markers.some((m) => m.change === "outputTypes")).toBe(true);
  });

  it("emits 'enabled' when node enabled state flips", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const base = makeManifest("image-gen");
    const next = envelope([{ ...base, node: { ...base.node, enabled: false } }]);
    const result = compareEnvelopes(prev, next);
    expect(result.markers.some((m) => m.change === "enabled")).toBe(true);
  });

  it("emits 'schema' when inputSchema changes", () => {
    const prev = envelope([makeManifest("image-gen")]);
    const next = envelope([
      makeManifest("image-gen", {
        inputSchema: {
          fields: [{ key: "prompt", label: "Prompt", required: true, fieldType: "long-text" }],
        },
      }),
    ]);
    const result = compareEnvelopes(prev, next);
    expect(result.markers.some((m) => m.change === "schema")).toBe(true);
  });

  it("tolerates a null prior envelope (fresh install)", () => {
    const next = envelope([makeManifest("image-gen")]);
    const result = compareEnvelopes(null, next);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]).toMatchObject({ change: "added", slug: "image-gen" });
  });
});
