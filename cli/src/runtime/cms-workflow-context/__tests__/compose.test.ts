import { describe, expect, it } from "vitest";
import type { CapabilityManifest, CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
import type { CapabilityNode } from "@growthub/api-contract/capabilities";
import { composePacket } from "../compose.js";
import type { PacketSourcesSnapshot } from "../load-sources.js";

const FIXED_NOW = "2030-01-01T00:00:00.000Z";

function makeCapability(slug: string, partial: Partial<CapabilityManifest> = {}): CapabilityManifest {
  const node: CapabilityNode = {
    slug,
    family: "video",
    displayName: slug,
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: { tool_name: slug, input_template: {}, output_mapping: {} },
    requiredBindings: [],
    outputTypes: ["video"],
    enabled: true,
    visibility: "authenticated",
    icon: "",
    category: "automation",
    experimental: false,
  };
  return {
    slug,
    family: "video",
    displayName: slug,
    executionKind: "hosted-execute",
    requiredBindings: [],
    outputTypes: ["video"],
    node,
    inputSchema: {
      fields: [
        { key: "prompt", label: "Prompt", required: true, fieldType: "longText" },
        { key: "brandKitId", label: "Brand Kit", required: false, fieldType: "text" },
      ],
    },
    outputSchema: { outputs: [{ key: "video", fieldType: "url", required: true }] },
    provenance: { originType: "hosted", recordedAt: FIXED_NOW },
    ...partial,
  };
}

function makeEnvelope(capabilities: CapabilityManifest[]): CapabilityManifestEnvelope {
  return {
    version: 1,
    host: "https://growthub.test",
    fetchedAt: FIXED_NOW,
    source: "hosted",
    capabilities,
  };
}

function makeSnapshot(overrides: Partial<PacketSourcesSnapshot> = {}): PacketSourcesSnapshot {
  return {
    manifest: {
      envelope: makeEnvelope([makeCapability("video-generation", { requiredBindings: ["brandKitId"] })]),
      source: "cache",
      fetchedAt: FIXED_NOW,
      stale: false,
    },
    savedWorkflow: {
      result: {
        entry: {
          workflowId: "wf-1",
          pipelineId: "wf-1",
          name: "Test workflow",
          nodeCount: 1,
          executionMode: "hosted",
          createdAt: FIXED_NOW,
          source: "hosted",
        },
        detail: { pipeline: {}, createdAt: FIXED_NOW },
        pipeline: {
          pipelineId: "wf-1",
          executionMode: "hosted",
          nodes: [
            { id: "n1", slug: "video-generation", bindings: { prompt: "hello", brandKitId: "bk-1" } },
          ],
        },
      },
      source: "hosted",
      fetchedAt: FIXED_NOW,
    },
    agent: {
      slug: "creative-strategist-v1",
      binding: null,
      manifest: null,
      source: "missing",
    },
    workspace: { policy: null, forkRegistered: false, source: "missing" },
    projectMd: { memory: null, source: "missing" },
    trace: { fork: [], source: "missing" },
    bridgeAuthUnavailable: false,
    ...overrides,
  };
}

describe("composePacket", () => {
  it("emits a v1 packet with the canonical kind", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.version).toBe(1);
    expect(packet.kind).toBe("cms-workflow-context-packet");
    expect(packet.generatedAt).toBe(FIXED_NOW);
  });

  it("derives workflow identity from the saved workflow entry", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.workflow.id).toBe("wf-1");
    expect(packet.workflow.name).toBe("Test workflow");
    expect(packet.workflow.executionAuthority).toBe("gh-app");
    expect(packet.workflow.source).toBe("hosted");
  });

  it("includes startup sequence and runtime assumptions verbatim", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.startupSequence.length).toBeGreaterThan(0);
    expect(packet.startupSequence[0]).toMatch(/project\.md/);
    expect(packet.runtimeAssumptions[0]).toMatch(/gh-app/);
  });

  it("projects nodes with manifest schemas joined in", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.nodes).toHaveLength(1);
    const node = packet.nodes[0];
    expect(node.slug).toBe("video-generation");
    expect(node.allowedInputs).toEqual(["prompt", "brandKitId"]);
    expect(node.requiredBindings).toEqual(["brandKitId"]);
    expect(node.unknownSlug).toBe(false);
  });

  it("flags unknown node slugs", () => {
    const snapshot = makeSnapshot({
      manifest: {
        envelope: makeEnvelope([]),
        source: "cache",
        fetchedAt: FIXED_NOW,
        stale: false,
      },
    });
    const packet = composePacket(snapshot, { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.nodes[0].unknownSlug).toBe(true);
    expect(packet.stopConditions.some((sc) => sc.code === "unknown-node-slug")).toBe(true);
  });

  it("omits artifact policy customization (defaults are stable)", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.artifactPolicy.captureOutputs).toBe(true);
    expect(packet.artifactPolicy.viewerWidget).toBe("artifact-viewer");
    expect(packet.artifactPolicy.allowedArtifactKinds).toContain("video");
  });

  it("self-eval has the required criteria and a 3-retry cap", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.selfEval.maxRetries).toBe(3);
    expect(packet.selfEval.criteria.length).toBeGreaterThan(0);
  });

  it("populates source provenance", () => {
    const packet = composePacket(makeSnapshot(), { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.sources.manifestEnvelope.kind).toBe("cache");
    expect(packet.sources.manifestEnvelope.capabilityCount).toBe(1);
    expect(packet.sources.savedWorkflow.kind).toBe("hosted");
    expect(packet.sources.workspacePolicy.kind).toBe("missing");
  });

  it("emits a workflow-not-found stop condition when no saved workflow resolves", () => {
    const snapshot = makeSnapshot({
      savedWorkflow: { result: null, source: "missing" },
    });
    const packet = composePacket(snapshot, { workflowId: "missing-id", now: FIXED_NOW });
    expect(packet.workflow.id).toBe("missing-id");
    expect(packet.stopConditions.some((sc) => sc.code === "workflow-not-found" && sc.severity === "error")).toBe(true);
  });

  it("emits manifest-cache-stale when the cached envelope is older than 24h", () => {
    const snapshot = makeSnapshot({
      manifest: {
        envelope: makeEnvelope([]),
        source: "cache",
        fetchedAt: "1970-01-01T00:00:00.000Z",
        stale: true,
      },
    });
    const packet = composePacket(snapshot, { workflowId: "wf-1", now: FIXED_NOW });
    expect(packet.stopConditions.some((sc) => sc.code === "manifest-cache-stale" && sc.severity === "warn")).toBe(true);
  });
});
