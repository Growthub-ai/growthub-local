import type { CapabilityManifest } from "@growthub/api-contract";
import type {
  CompiledHostedWorkflowConfig,
  PipelineLike,
} from "./types.js";
import { validateAgainstSchema } from "./schema-validator.js";

export function inferWorkflowName(pipeline: PipelineLike): string {
  const metadataName = pipeline.metadata?.workflowName;
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  return pipeline.pipelineId?.trim() || `${pipeline.nodes[0]?.slug ?? "workflow"} workflow`;
}

export function compileToHostedWorkflowConfig(
  pipeline: PipelineLike,
  opts?: { workflowName?: string },
): CompiledHostedWorkflowConfig {
  const cmsNodes = pipeline.nodes.map((node, index) => ({
    id: node.id,
    type: "cmsNode",
    position: { x: (index + 1) * 300, y: 0 },
    data: {
      slug: node.slug,
      inputs: node.bindings,
    },
  }));

  const edges: Array<Record<string, unknown>> = [];
  for (const node of pipeline.nodes) {
    const upstreamNodeIds = node.upstreamNodeIds ?? [];
    if (upstreamNodeIds.length === 0) {
      edges.push({
        id: `e-start-1-${node.id}`,
        source: "start-1",
        target: node.id,
      });
      continue;
    }

    for (const upstreamNodeId of upstreamNodeIds) {
      edges.push({
        id: `e-${upstreamNodeId}-${node.id}`,
        source: upstreamNodeId,
        target: node.id,
      });
    }
  }

  const upstreamSources = new Set(
    pipeline.nodes.flatMap((node) => node.upstreamNodeIds ?? []),
  );

  for (const node of pipeline.nodes) {
    if (!upstreamSources.has(node.id)) {
      edges.push({
        id: `e-${node.id}-end-1`,
        source: node.id,
        target: "end-1",
      });
    }
  }

  return {
    name: opts?.workflowName ?? inferWorkflowName(pipeline),
    nodes: [
      { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: {} },
      ...cmsNodes,
      { id: "end-1", type: "end", position: { x: (cmsNodes.length + 1) * 300, y: 0 }, data: {} },
    ],
    edges,
  };
}

// ---------------------------------------------------------------------------
// Schema-aware pre-compile validation
// ---------------------------------------------------------------------------

export interface PipelineSchemaValidationIssue {
  nodeId: string;
  slug: string;
  warning: string;
}

export interface PipelineSchemaValidationResult {
  valid: boolean;
  issues: PipelineSchemaValidationIssue[];
}

/**
 * Validate a pipeline's per-node bindings against their NodeInputSchema
 * contracts. When a manifest lookup is missing or lacks an inputSchema,
 * the node is skipped — the existing ad-hoc introspection path stays
 * authoritative (additive-only rule).
 */
export function validatePipelineAgainstSchemas(
  pipeline: PipelineLike,
  manifestsBySlug: Map<string, CapabilityManifest>,
): PipelineSchemaValidationResult {
  const issues: PipelineSchemaValidationIssue[] = [];
  for (const node of pipeline.nodes) {
    const manifest = manifestsBySlug.get(node.slug);
    if (!manifest?.inputSchema) continue;
    const result = validateAgainstSchema(manifest.inputSchema, node.bindings, {
      requiredBindings: manifest.requiredBindings,
    });
    for (const warning of result.warnings) {
      issues.push({ nodeId: node.id, slug: node.slug, warning });
    }
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}
