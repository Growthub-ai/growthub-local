/**
 * Schema Validator
 *
 * One validator across every surface. Consumes `NodeInputSchema` from the
 * v1 public contract and returns a `ContractValidationResult` that mirrors
 * the CLI's existing warning / missing shape so downstream renderers do
 * not branch on "have schema / don't have schema".
 *
 * Called by:
 *   - interactive fill flow (CLI workflow schema fill)
 *   - non-interactive fill (--bindings-file / --stdin)
 *   - agent-native run (growthub workflow schema run)
 *   - schema-aware compile path (cms-node-contracts/compile.ts)
 */

import type {
  NodeInputField,
  NodeInputSchema,
  NumberField,
  SelectField,
  ArrayField,
} from "@growthub/api-contract";
import type { ContractValidationResult } from "./types.js";

const NONEMPTY = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" &&
  !(Array.isArray(v) && v.length === 0);

function validateField(
  field: NodeInputField,
  value: unknown,
  warnings: string[],
): boolean {
  if (field.required && !NONEMPTY(value)) return false;
  if (!NONEMPTY(value)) return true;

  switch (field.fieldType) {
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) {
        warnings.push(`Field '${field.key}' must be a number`);
        return false;
      }
      const nf = field as NumberField;
      if (nf.integer && !Number.isInteger(num)) {
        warnings.push(`Field '${field.key}' must be an integer`);
        return false;
      }
      if (typeof nf.min === "number" && num < nf.min) {
        warnings.push(`Field '${field.key}' must be >= ${nf.min}`);
        return false;
      }
      if (typeof nf.max === "number" && num > nf.max) {
        warnings.push(`Field '${field.key}' must be <= ${nf.max}`);
        return false;
      }
      return true;
    }
    case "boolean":
      if (typeof value !== "boolean") {
        warnings.push(`Field '${field.key}' must be a boolean`);
        return false;
      }
      return true;
    case "select": {
      const sf = field as SelectField;
      if (sf.options && sf.options.length > 0) {
        const allowed = new Set(sf.options.map((o) => o.value));
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          if (typeof v !== "string" || !allowed.has(v)) {
            warnings.push(`Field '${field.key}' value '${String(v)}' is not in allowed options`);
            return false;
          }
        }
      }
      return true;
    }
    case "array": {
      const af = field as ArrayField;
      if (!Array.isArray(value)) {
        warnings.push(`Field '${field.key}' must be an array`);
        return false;
      }
      if (typeof af.minItems === "number" && value.length < af.minItems) {
        warnings.push(`Field '${field.key}' requires >= ${af.minItems} items`);
        return false;
      }
      if (typeof af.maxItems === "number" && value.length > af.maxItems) {
        warnings.push(`Field '${field.key}' requires <= ${af.maxItems} items`);
        return false;
      }
      return true;
    }
    case "url":
    case "url-or-file":
    case "file":
    case "json":
    case "text":
    case "long-text":
    default:
      return true;
  }
}

export interface ValidateSchemaOptions {
  /** Required binding keys outside the schema (e.g. provider keys). */
  requiredBindings?: string[];
}

export function validateAgainstSchema(
  schema: NodeInputSchema,
  bindings: Record<string, unknown>,
  options: ValidateSchemaOptions = {},
): ContractValidationResult {
  const warnings: string[] = [];
  const missingRequiredInputs: string[] = [];

  for (const field of schema.fields) {
    const value = bindings[field.key];
    const ok = validateField(field, value, warnings);
    if (!ok && field.required && !NONEMPTY(value)) {
      missingRequiredInputs.push(field.key);
    }
  }

  const missingRequiredBindings: string[] = [];
  for (const key of options.requiredBindings ?? []) {
    const value = bindings[key];
    if (!NONEMPTY(value)) missingRequiredBindings.push(key);
  }
  if (missingRequiredBindings.length > 0) {
    warnings.unshift(`Missing required bindings: ${missingRequiredBindings.join(", ")}`);
  }
  if (missingRequiredInputs.length > 0) {
    warnings.unshift(`Missing required inputs: ${missingRequiredInputs.join(", ")}`);
  }

  return {
    valid:
      missingRequiredInputs.length === 0 &&
      missingRequiredBindings.length === 0 &&
      warnings.length === missingRequiredInputs.length + missingRequiredBindings.length,
    missingRequiredInputs,
    missingRequiredBindings,
    warnings,
  };
}
