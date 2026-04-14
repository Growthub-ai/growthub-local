import type { CmsCapabilityNode } from "../cms-capability-registry/index.js";
import { isPlaceholderString } from "../hosted-execution-client/index.js";
import { introspectNodeContract } from "./introspect.js";
import type {
  ContractValidationResult,
  NormalizedBindings,
} from "./types.js";

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return isPlaceholderString(value) ? "" : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  return value;
}

function coerceValue(value: unknown, templateValue: unknown): unknown {
  if (templateValue === undefined) return value;

  if (typeof templateValue === "number") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return templateValue;
  }

  if (typeof templateValue === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
    return templateValue;
  }

  if (Array.isArray(templateValue)) {
    return Array.isArray(value) ? value : templateValue;
  }

  if (templateValue && typeof templateValue === "object") {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    return templateValue;
  }

  return value;
}

export function normalizeNodeBindings(
  rawBindings: Record<string, unknown> | undefined,
  node: CmsCapabilityNode,
): NormalizedBindings {
  const template = node.executionTokens.input_template ?? {};
  const incoming = rawBindings ?? {};
  const merged: Record<string, unknown> = {};
  let providedCount = 0;
  let defaultedCount = 0;
  let normalizedCount = 0;

  for (const [key, templateValue] of Object.entries(template)) {
    const hasIncoming = Object.prototype.hasOwnProperty.call(incoming, key);
    const rawValue = hasIncoming ? incoming[key] : templateValue;
    const sanitized = sanitizeValue(rawValue);
    const coerced = coerceValue(sanitized, templateValue);
    merged[key] = coerced;

    if (hasIncoming) providedCount += 1;
    if (!hasIncoming) defaultedCount += 1;
    if (sanitized !== rawValue || coerced !== sanitized) normalizedCount += 1;
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in merged)) {
      merged[key] = sanitizeValue(value);
      providedCount += 1;
    }
  }

  return {
    bindings: merged,
    providedCount,
    defaultedCount,
    normalizedCount,
  };
}

export function validateNodeBindings(
  normalizedBindings: Record<string, unknown>,
  node: CmsCapabilityNode,
): ContractValidationResult {
  const contract = introspectNodeContract(node);
  const missingRequiredInputs: string[] = [];
  const missingRequiredBindings: string[] = [];

  for (const input of contract.inputs) {
    if (!input.required) continue;
    const value = normalizedBindings[input.key];
    if (value === undefined || value === null || value === "") {
      missingRequiredInputs.push(input.key);
    }
  }

  for (const key of contract.requiredBindings) {
    const value = normalizedBindings[key];
    if (value === undefined || value === null || value === "") {
      missingRequiredBindings.push(key);
    }
  }

  const warnings: string[] = [];
  if (missingRequiredBindings.length > 0) {
    warnings.push(`Missing required bindings: ${missingRequiredBindings.join(", ")}`);
  }
  if (missingRequiredInputs.length > 0) {
    warnings.push(`Missing required inputs: ${missingRequiredInputs.join(", ")}`);
  }

  return {
    valid: missingRequiredBindings.length === 0 && missingRequiredInputs.length === 0,
    missingRequiredInputs,
    missingRequiredBindings,
    warnings,
  };
}
