import pc from "picocolors";
import type {
  NodeContractSummary,
  PipelineLike,
  PreExecutionSummary,
  PreExecutionSummaryInput,
} from "./types.js";
import { compileToHostedWorkflowConfig } from "./compile.js";
import { introspectNodeContract } from "./introspect.js";
import { normalizeNodeBindings, validateNodeBindings } from "./normalize.js";

function renderInputLine(input: NodeContractSummary["inputs"][number]): string {
  const required = input.required ? pc.red("required") : pc.green("optional");
  return `${pc.dim("·")} ${input.label} ${pc.dim(`(${input.type})`)} ${required}`;
}

function countNodeAssets(bindings: Record<string, unknown>): number {
  let count = 0;
  for (const [key, value] of Object.entries(bindings)) {
    if (Array.isArray(value) && (key.toLowerCase().includes("image") || key.toLowerCase().includes("asset") || key.toLowerCase().includes("ref"))) {
      count += value.length;
    }
  }
  return count;
}

export function renderContractCard(contract: NodeContractSummary): string[] {
  const lines: string[] = [
    `${pc.bold(contract.displayName)}  ${pc.dim(contract.slug)}`,
    `${pc.dim("Family:")} ${contract.family}  ${pc.dim("Execution:")} ${contract.executionStrategy}`,
    `${pc.dim("Kind:")} ${contract.executionKind}  ${pc.dim("Node Type:")} ${contract.nodeType}`,
    `${pc.dim("Bindings:")} ${contract.requiredBindings.length > 0 ? contract.requiredBindings.join(", ") : "none"}`,
    `${pc.dim("Outputs:")} ${contract.outputTypes.length > 0 ? contract.outputTypes.join(", ") : "none"}`,
  ];

  if (contract.inputs.length > 0) {
    lines.push("", pc.bold("Input Contract"));
    lines.push(...contract.inputs.map(renderInputLine));
  }

  if (contract.outputs.length > 0) {
    lines.push("", pc.bold("Output Contract"));
    lines.push(
      ...contract.outputs.map((output) => `${pc.dim("·")} ${output.key} ${pc.dim(`(${output.type})`)}`),
    );
  }

  return lines;
}

export function buildPreExecutionSummary(input: PreExecutionSummaryInput): PreExecutionSummary {
  const warnings: string[] = [];
  const nodes = input.pipeline.nodes.map((node) => {
    const capability = input.registryBySlug.get(node.slug);
    if (!capability) {
      warnings.push(`Unknown capability slug: ${node.slug}`);
      return {
        nodeId: node.id,
        slug: node.slug,
        requiredMissing: [],
        bindingCount: Object.keys(node.bindings ?? {}).length,
        assetCount: countNodeAssets(node.bindings ?? {}),
        outputTypes: [],
      };
    }

    const normalized = normalizeNodeBindings(node.bindings, capability);
    const validation = validateNodeBindings(normalized.bindings, capability);
    const contract = introspectNodeContract(capability);

    if (!validation.valid) {
      warnings.push(
        `${node.slug}: ${[...validation.missingRequiredBindings, ...validation.missingRequiredInputs].join(", ")}`,
      );
    }

    return {
      nodeId: node.id,
      slug: node.slug,
      requiredMissing: [...validation.missingRequiredBindings, ...validation.missingRequiredInputs],
      bindingCount: Object.keys(normalized.bindings).length,
      assetCount: countNodeAssets(normalized.bindings),
      outputTypes: contract.outputTypes,
    };
  });

  const normalizedPipeline: PipelineLike = {
    ...input.pipeline,
    nodes: input.pipeline.nodes.map((node) => {
      const capability = input.registryBySlug.get(node.slug);
      if (!capability) return node;
      const normalized = normalizeNodeBindings(node.bindings, capability);
      return { ...node, bindings: normalized.bindings };
    }),
  };

  return {
    pipelineId: input.pipeline.pipelineId,
    executionMode: input.pipeline.executionMode,
    nodeCount: input.pipeline.nodes.length,
    warnings,
    nodes,
    compiledConfig: compileToHostedWorkflowConfig(normalizedPipeline),
  };
}

export function renderPreExecutionSummary(summary: PreExecutionSummary): string[] {
  const lines: string[] = [
    `${pc.bold("Pre-Execution Contract Summary")} ${pc.dim(summary.pipelineId)}`,
    `${pc.dim("Mode:")} ${summary.executionMode}  ${pc.dim("Nodes:")} ${summary.nodeCount}`,
    `${pc.dim("Compiled:")} ${summary.compiledConfig.nodes.length} nodes / ${summary.compiledConfig.edges.length} edges`,
    "",
  ];

  for (const [index, node] of summary.nodes.entries()) {
    const missing = node.requiredMissing.length > 0
      ? pc.red(`missing: ${node.requiredMissing.join(", ")}`)
      : pc.green("ready");
    const outputs = node.outputTypes.length > 0 ? node.outputTypes.join(", ") : "none";
    lines.push(
      `${pc.dim(`${index + 1}.`)} ${pc.bold(node.slug)} ${pc.dim(node.nodeId)} · bindings=${node.bindingCount} · assets=${node.assetCount} · outputs=${outputs} · ${missing}`,
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", pc.yellow("Warnings"));
    lines.push(...summary.warnings.map((warning) => `${pc.dim("·")} ${warning}`));
  }

  return lines;
}

export function renderPreSaveReview(input: {
  workflowName: string;
  summary: PreExecutionSummary;
}): string[] {
  const lines: string[] = [
    `${pc.bold("Pre-Save Workflow Review")} ${pc.dim(input.workflowName)}`,
    `${pc.dim("Pipeline:")} ${input.summary.pipelineId}`,
    `${pc.dim("Mode:")} ${input.summary.executionMode}`,
    `${pc.dim("Compiled:")} ${input.summary.compiledConfig.nodes.length} nodes / ${input.summary.compiledConfig.edges.length} edges`,
  ];

  if (input.summary.warnings.length > 0) {
    lines.push("", pc.yellow(`Warnings: ${input.summary.warnings.length}`));
  }

  return lines;
}
