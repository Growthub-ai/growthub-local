import type {
  NodeInputField,
  NodeInputSchema,
} from "@growthub/api-contract";
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

// ---------------------------------------------------------------------------
// B6: hosted NodeInputSchema → CLI NodeInputFieldContract
// ---------------------------------------------------------------------------

function nodeInputFieldTypeToContractType(field: NodeInputField): ContractFieldType {
  switch (field.fieldType) {
    case "text":
    case "long-text":
    case "select":
    case "url":
    case "file":
    case "url-or-file":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "json":
      return "object";
    default:
      return "unknown";
  }
}

function projectHostedInputField(field: NodeInputField): NodeInputFieldContract {
  return {
    key: field.key,
    label: field.label?.trim() ? field.label : humanizeFieldKey(field.key),
    type: nodeInputFieldTypeToContractType(field),
    required: field.required === true,
    defaultValue: field.defaultValue,
  };
}

function extractHostedInputSchema(node: CmsCapabilityNode): NodeInputSchema | null {
  const schema = node.manifestMetadata?.inputSchema;
  if (!schema || typeof schema !== "object") return null;
  const fields = (schema as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;
  return schema as NodeInputSchema;
}

// ---------------------------------------------------------------------------
// Contract summary
// ---------------------------------------------------------------------------

export function introspectNodeContract(node: CmsCapabilityNode): NodeContractSummary {
  const inputTemplate = node.executionTokens.input_template ?? {};
  const outputMapping = node.executionTokens.output_mapping ?? {};

  // B6: prefer hosted input schema when present. Fall back to
  // input_template heuristics for any field the hosted schema does
  // not cover.
  const hostedSchema = extractHostedInputSchema(node);
  const hostedFields = hostedSchema?.fields ?? [];
  const hostedByKey = new Map<string, NodeInputField>(
    hostedFields.map((field) => [field.key, field]),
  );

  const hostedContracts: NodeInputFieldContract[] = hostedFields.map(projectHostedInputField);
  const heuristicContracts: NodeInputFieldContract[] = Object.entries(inputTemplate)
    .filter(([key]) => !hostedByKey.has(key))
    .map(([key, value]) => {
      const required = value === "" || value === null || value === undefined;
      return {
        key,
        label: humanizeFieldKey(key),
        type: toFieldType(value),
        required,
        defaultValue: value,
      };
    });

  const inputs: NodeInputFieldContract[] = [...hostedContracts, ...heuristicContracts];

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
