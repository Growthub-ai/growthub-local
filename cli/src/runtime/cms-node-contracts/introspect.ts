import type { CmsCapabilityNode } from "../cms-capability-registry/index.js";
import type {
  ContractFieldType,
  NodeContractSummary,
  NodeInputFieldContract,
  NodeOutputFieldContract,
} from "./types.js";

function toFieldType(value: unknown): ContractFieldType {
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value && typeof value === "object") return "object";
  return "unknown";
}

function outputTypeFromSchema(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string") {
    return (value as { type: string }).type;
  }
  return toFieldType(value);
}

export function humanizeFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function introspectNodeContract(node: CmsCapabilityNode): NodeContractSummary {
  const inputTemplate = node.executionTokens.input_template ?? {};
  const outputMapping = node.executionTokens.output_mapping ?? {};

  const inputs: NodeInputFieldContract[] = Object.entries(inputTemplate).map(([key, value]) => {
    const required = value === "" || value === null || value === undefined;
    return {
      key,
      label: humanizeFieldKey(key),
      type: toFieldType(value),
      required,
      defaultValue: value,
    };
  });

  const outputs: NodeOutputFieldContract[] = Object.entries(outputMapping).map(([key, value]) => ({
    key,
    type: outputTypeFromSchema(value),
    required: false,
  }));

  return {
    slug: node.slug,
    displayName: node.displayName,
    family: node.family,
    nodeType: node.nodeType,
    executionKind: node.executionKind,
    executionStrategy: node.executionBinding.strategy,
    requiredBindings: node.requiredBindings ?? [],
    outputTypes: node.outputTypes ?? [],
    inputs,
    outputs,
  };
}
