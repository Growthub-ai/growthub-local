import type {
  CompiledHostedWorkflowConfig,
  PipelineLike,
} from "./types.js";

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
