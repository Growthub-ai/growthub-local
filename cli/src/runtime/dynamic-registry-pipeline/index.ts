/**
 * Dynamic Registry Pipeline Builder
 *
 * Allows agents to assemble dynamic pipelines from CMS-backed primitives
 * using the same mental model GH MAX already uses, but in a generalized
 * runtime path.
 *
 * Key rule: The builder assembles pipelines from registered node contracts,
 * not from arbitrary ad hoc instructions.
 *
 * Responsibilities:
 *   - assemble node graphs from resolved capability definitions
 *   - validate required bindings before execution
 *   - infer execution path from node types
 *   - package pipeline into hosted-execute or provider-assembly input
 *   - preserve compatibility with GH MAX / manifest runtime concepts
 */

import { randomBytes } from "node:crypto";
import {
  createCmsCapabilityRegistryClient,
  type CmsCapabilityNode,
} from "../cms-capability-registry/index.js";
import type {
  DynamicRegistryPipeline,
  DynamicRegistryPipelineNode,
  PipelineExecutionMode,
  PipelineValidationResult,
  PipelineValidationIssue,
  PipelineExecutionPackage,
  SerializedPipeline,
} from "./types.js";

export type {
  DynamicRegistryPipeline,
  DynamicRegistryPipelineNode,
  PipelineExecutionMode,
  PipelineValidationResult,
  PipelineValidationIssue,
  PipelineExecutionPackage,
  NodeOutputSummary,
  SerializedPipeline,
} from "./types.js";

// ---------------------------------------------------------------------------
// Pipeline ID generation
// ---------------------------------------------------------------------------

function generatePipelineId(): string {
  return `pipe_${randomBytes(8).toString("hex")}`;
}

function generateNodeId(): string {
  return `node_${randomBytes(6).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface PipelineBuilderOptions {
  threadId?: string;
  executionMode?: PipelineExecutionMode;
  metadata?: Record<string, unknown>;
}

export interface DynamicRegistryPipelineBuilder {
  /** Add a node to the pipeline. Returns the generated node ID. */
  addNode(slug: string, bindings: Record<string, unknown>, upstreamNodeIds?: string[]): string;
  /** Build the pipeline descriptor. */
  build(): DynamicRegistryPipeline;
  /** Validate the pipeline against the capability registry. */
  validate(registry?: Map<string, CmsCapabilityNode>): Promise<PipelineValidationResult>;
  /** Package the pipeline for execution. */
  package(registry?: Map<string, CmsCapabilityNode>): Promise<PipelineExecutionPackage>;
  /** Get the current node list (read-only). */
  getNodes(): readonly DynamicRegistryPipelineNode[];
}

export function createPipelineBuilder(opts?: PipelineBuilderOptions): DynamicRegistryPipelineBuilder {
  const pipelineId = generatePipelineId();
  const nodes: DynamicRegistryPipelineNode[] = [];
  const executionMode: PipelineExecutionMode = opts?.executionMode ?? "hosted";
  const threadId = opts?.threadId;
  const metadata = opts?.metadata;

  return {
    addNode(slug, bindings, upstreamNodeIds) {
      const id = generateNodeId();
      nodes.push({ id, slug, bindings, upstreamNodeIds });
      return id;
    },

    build() {
      return {
        pipelineId,
        threadId,
        nodes: [...nodes],
        executionMode,
        metadata,
      };
    },

    getNodes() {
      return nodes;
    },

    async validate(registry) {
      const capabilityMap = registry ?? await fetchCapabilityMap();
      const issues: PipelineValidationIssue[] = [];

      if (nodes.length === 0) {
        issues.push({
          severity: "error",
          message: "Pipeline has no nodes.",
        });
      }

      const nodeIds = new Set(nodes.map((n) => n.id));
      const seenSlugs = new Set<string>();

      for (const node of nodes) {
        const capability = capabilityMap.get(node.slug);

        if (!capability) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            field: "slug",
            message: `Unknown capability slug: "${node.slug}". Not found in the registry.`,
          });
          continue;
        }

        if (!capability.enabled) {
          issues.push({
            severity: "warning",
            nodeId: node.id,
            field: "slug",
            message: `Capability "${node.slug}" is disabled for this user/org.`,
          });
        }

        // Strategy-aware warning: async nodes require polling
        if (capability.executionBinding.strategy === "async_operation") {
          issues.push({
            severity: "warning",
            nodeId: node.id,
            field: "executionBinding.strategy",
            message: `Capability "${node.slug}" uses async_operation strategy. Execution will be non-blocking and requires polling for results.`,
          });
        }

        // Experimental capability warning
        if (capability.experimental) {
          issues.push({
            severity: "warning",
            nodeId: node.id,
            field: "experimental",
            message: `Capability "${node.slug}" is marked experimental and may have unstable behavior.`,
          });
        }

        // Check required bindings
        for (const requiredBinding of capability.requiredBindings) {
          if (!(requiredBinding in node.bindings)) {
            issues.push({
              severity: "error",
              nodeId: node.id,
              field: `bindings.${requiredBinding}`,
              message: `Missing required binding "${requiredBinding}" for capability "${node.slug}".`,
            });
          } else {
            // Binding is present — warn if value is empty
            const val = node.bindings[requiredBinding];
            if (val === "" || val === null || val === undefined) {
              issues.push({
                severity: "warning",
                nodeId: node.id,
                field: `bindings.${requiredBinding}`,
                message: `Required binding "${requiredBinding}" for capability "${node.slug}" is present but has an empty value.`,
              });
            }
          }
        }

        // Check upstream references
        if (node.upstreamNodeIds) {
          for (const upId of node.upstreamNodeIds) {
            if (!nodeIds.has(upId)) {
              issues.push({
                severity: "error",
                nodeId: node.id,
                field: "upstreamNodeIds",
                message: `Upstream node "${upId}" does not exist in the pipeline.`,
              });
            }
          }
        }

        seenSlugs.add(node.slug);
      }

      // Check for cycles (simple DFS)
      const cycleIssue = detectCycle(nodes);
      if (cycleIssue) {
        issues.push(cycleIssue);
      }

      return {
        valid: issues.every((i) => i.severity !== "error"),
        issues,
      };
    },

    async package(registry) {
      const capabilityMap = registry ?? await fetchCapabilityMap();
      const pipeline = this.build();

      const nodeRoutes: Record<string, "hosted-execute" | "provider-assembly" | "local-only"> = {};
      const nodeOutputSummaries: Record<string, import("./types.js").NodeOutputSummary> = {};
      const asyncNodeIds: string[] = [];
      const preflightWarnings: PipelineValidationIssue[] = [];
      const routeSet = new Set<string>();

      for (const node of pipeline.nodes) {
        const capability = capabilityMap.get(node.slug);
        const route = capability?.executionKind ?? "hosted-execute";
        nodeRoutes[node.id] = route;
        routeSet.add(route);

        // Build output summary from capability manifest
        const outputKeys = capability
          ? Object.keys(capability.executionTokens.output_mapping)
          : [];
        const outputTypes = capability?.outputTypes ?? [];
        nodeOutputSummaries[node.id] = { nodeId: node.id, slug: node.slug, outputKeys, outputTypes };

        // Track async nodes for caller awareness
        if (capability?.executionBinding.strategy === "async_operation") {
          asyncNodeIds.push(node.id);
          preflightWarnings.push({
            severity: "warning",
            nodeId: node.id,
            message: `Node "${node.slug}" (${node.id}) uses async polling strategy.`,
          });
        }

        // Warn on empty required binding values
        for (const requiredBinding of capability?.requiredBindings ?? []) {
          if (requiredBinding in node.bindings) {
            const val = node.bindings[requiredBinding];
            if (val === "" || val === null || val === undefined) {
              preflightWarnings.push({
                severity: "warning",
                nodeId: node.id,
                field: `bindings.${requiredBinding}`,
                message: `Required binding "${requiredBinding}" in node "${node.slug}" has an empty value.`,
              });
            }
          }
        }
      }

      let executionRoute: PipelineExecutionPackage["executionRoute"];
      if (routeSet.size === 1) {
        const single = [...routeSet][0];
        executionRoute = single === "local-only" ? "hosted-execute" : single as "hosted-execute" | "provider-assembly";
      } else {
        executionRoute = "mixed";
      }

      return {
        pipeline,
        executionRoute,
        nodeRoutes,
        nodeOutputSummaries,
        asyncNodeIds,
        preflightWarnings,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializePipeline(
  pipeline: DynamicRegistryPipeline,
  source: SerializedPipeline["source"] = "cli-assemble",
): SerializedPipeline {
  return {
    version: 1,
    pipeline,
    createdAt: new Date().toISOString(),
    source,
  };
}

export function deserializePipeline(raw: unknown): DynamicRegistryPipeline {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid pipeline: expected an object.");
  }

  const record = raw as Record<string, unknown>;

  // Support both wrapped (SerializedPipeline) and unwrapped (DynamicRegistryPipeline)
  const pipelineRaw = record.version === 1 && record.pipeline
    ? record.pipeline as Record<string, unknown>
    : record;

  const pipelineId = typeof pipelineRaw.pipelineId === "string"
    ? pipelineRaw.pipelineId
    : generatePipelineId();

  const nodes = Array.isArray(pipelineRaw.nodes)
    ? (pipelineRaw.nodes as DynamicRegistryPipelineNode[])
    : [];

  const executionMode = (
    pipelineRaw.executionMode === "local" ||
    pipelineRaw.executionMode === "hosted" ||
    pipelineRaw.executionMode === "hybrid"
  ) ? pipelineRaw.executionMode : "hosted";

  return {
    pipelineId,
    threadId: typeof pipelineRaw.threadId === "string" ? pipelineRaw.threadId : undefined,
    nodes,
    executionMode,
    metadata: typeof pipelineRaw.metadata === "object" && pipelineRaw.metadata !== null
      ? pipelineRaw.metadata as Record<string, unknown>
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchCapabilityMap(): Promise<Map<string, CmsCapabilityNode>> {
  const registry = createCmsCapabilityRegistryClient();
  const { nodes } = await registry.listCapabilities({ enabledOnly: false });
  return new Map(nodes.map((n) => [n.slug, n]));
}

function detectCycle(nodes: DynamicRegistryPipelineNode[]): PipelineValidationIssue | null {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, node.upstreamNodeIds ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const upstream of adjacency.get(nodeId) ?? []) {
      if (dfs(upstream)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (dfs(node.id)) {
      return {
        severity: "error",
        message: "Pipeline contains a dependency cycle.",
      };
    }
  }

  return null;
}
