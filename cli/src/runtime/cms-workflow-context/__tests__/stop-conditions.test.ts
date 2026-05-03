import { describe, expect, it } from "vitest";
import type { CapabilityManifest, CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
import type { CapabilityNode } from "@growthub/api-contract/capabilities";
import { detectStopConditions } from "../stop-conditions.js";
import type { PacketSourcesSnapshot } from "../load-sources.js";

const T = "2030-01-01T00:00:00.000Z";

function cap(slug: string, partial: Partial<CapabilityManifest> = {}): CapabilityManifest {
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
        { key: "prompt", label: "Prompt", required: true, fieldType: "long-text" },
      ],
    },
    provenance: { originType: "hosted", recordedAt: T },
    ...partial,
  };
}

function envelope(caps: CapabilityManifest[]): CapabilityManifestEnvelope {
  return { version: 1, host: "h", fetchedAt: T, source: "hosted", capabilities: caps };
}

function baseline(overrides: Partial<PacketSourcesSnapshot> = {}): PacketSourcesSnapshot {
  return {
    manifest: { envelope: envelope([cap("video-generation", { requiredBindings: ["brandKitId"] })]), source: "cache", fetchedAt: T, stale: false },
    savedWorkflow: {
      result: {
        entry: { workflowId: "wf", pipelineId: "wf", name: "x", nodeCount: 1, executionMode: "hosted", createdAt: T, source: "hosted" },
        detail: { pipeline: {}, createdAt: T },
        pipeline: {
          pipelineId: "wf",
          executionMode: "hosted",
          nodes: [{ id: "n1", slug: "video-generation", bindings: { prompt: "go", brandKitId: "bk-1" } }],
        },
      },
      source: "hosted",
    },
    agent: { slug: "x", binding: null, manifest: null, source: "missing" },
    workspace: { policy: null, forkRegistered: false, source: "missing" },
    projectMd: { memory: null, source: "missing" },
    trace: { fork: [], source: "missing" },
    bridgeAuthUnavailable: false,
    ...overrides,
  };
}

describe("detectStopConditions", () => {
  it("returns missing-binding when a required binding is absent", () => {
    const snapshot = baseline();
    snapshot.savedWorkflow.result!.pipeline.nodes[0].bindings = { prompt: "go" };
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("missing-binding");
  });

  it("returns schema-mismatch for unknown binding keys", () => {
    const snapshot = baseline();
    snapshot.savedWorkflow.result!.pipeline.nodes[0].bindings = { prompt: "go", brandKitId: "bk-1", surprise: 1 };
    const codes = detectStopConditions(snapshot);
    expect(codes.some((s) => s.code === "schema-mismatch" && s.severity === "warn")).toBe(true);
  });

  it("returns unknown-node-slug when manifest lacks the slug", () => {
    const snapshot = baseline({
      manifest: { envelope: envelope([]), source: "cache", fetchedAt: T, stale: false },
    });
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("unknown-node-slug");
  });

  it("returns manifest-cache-missing when no cache exists", () => {
    const snapshot = baseline({
      manifest: { envelope: null, source: "missing", stale: false },
    });
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("manifest-cache-missing");
  });

  it("returns bridge-auth-unavailable when caller signals missing auth", () => {
    const snapshot = baseline({ bridgeAuthUnavailable: true });
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("bridge-auth-unavailable");
  });

  it("returns workspace-not-governed when path is provided but no fork is registered", () => {
    const snapshot = baseline({
      workspace: { policy: null, forkRegistered: false, workspacePath: "/tmp/fake", source: "missing" },
    });
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("workspace-not-governed");
  });

  it("returns workflow-not-found when no saved workflow resolves", () => {
    const snapshot = baseline({ savedWorkflow: { result: null, source: "missing" } });
    const codes = detectStopConditions(snapshot).map((s) => s.code);
    expect(codes).toContain("workflow-not-found");
  });

  it("returns agent-not-bound when slug is provided but unresolved", () => {
    const snapshot = baseline({
      agent: { slug: "ghost", binding: null, manifest: null, source: "missing", bridgeFetchError: "401" },
    });
    const stops = detectStopConditions(snapshot);
    const sc = stops.find((s) => s.code === "agent-not-bound");
    expect(sc?.severity).toBe("error");
  });

  it("returns agent-not-bound (warn) when auto-select is ambiguous", () => {
    const snapshot = baseline({
      agent: { slug: undefined, binding: null, manifest: null, source: "missing", autoSelectAmbiguous: true },
    });
    const sc = detectStopConditions(snapshot).find((s) => s.code === "agent-not-bound");
    expect(sc?.severity).toBe("warn");
  });

  it("emits no error-severity stop conditions in a fully healthy snapshot", () => {
    const snapshot = baseline({
      // Provide a resolved agent so `agent-not-bound` doesn't fire.
      agent: {
        slug: "creative-strategist-v1",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        binding: { agentSlug: "creative-strategist-v1", executionAuthority: "gh-app" } as any,
        manifest: null,
        source: "local",
      },
    });
    const stops = detectStopConditions(snapshot).filter((s) => s.severity === "error");
    expect(stops).toEqual([]);
  });
});
