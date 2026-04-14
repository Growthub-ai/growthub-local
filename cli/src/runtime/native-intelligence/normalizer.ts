/**
 * Native Intelligence — Normalizer (Phase 2)
 *
 * Turns user/agent-friendly inputs into runtime-safe shapes using the
 * intelligence layer. This is where the first big reliability jump comes
 * from because it:
 *   - Normalizes local assets into contract-safe refs
 *   - Fills provider-neutral defaults
 *   - Detects placeholder-like values
 *   - Converts friendly values into compiled node inputs
 *   - Spots incomplete bindings and proposes fixes
 *
 * Works alongside (not replacing) the existing deterministic normalizer
 * in cms-node-contracts/normalize.ts. The intelligence normalizer adds
 * semantic understanding on top of the mechanical normalization.
 *
 * Falls back to deterministic normalization when model is unavailable.
 */

import type {
  NativeIntelligenceBackend,
  BindingNormalizationInput,
  BindingNormalizationResult,
  NormalizedField,
  NodeContractSummary,
} from "./contract.js";

// ---------------------------------------------------------------------------
// System prompt for binding normalization
// ---------------------------------------------------------------------------

const NORMALIZER_SYSTEM_PROMPT = `You are a binding normalizer for the Growthub workflow platform.
Your job is to take raw user/agent input bindings for a CMS workflow node and normalize them into runtime-safe shapes.

Given a node contract (input schema) and raw bindings, you must:
1. Identify which bindings are present and which are missing
2. Detect placeholder-like values ("enter X", "select Y", empty strings, "placeholder")
3. Coerce types where possible (string "123" -> number 123, "true" -> boolean true)
4. Propose defaults for missing optional fields based on the contract
5. Flag required fields that cannot be inferred
6. Normalize asset references into consistent formats

Rules:
- NEVER invent values for required fields — only flag them as missing
- For optional fields with obvious defaults (e.g., quality=1080, format="mp4"), propose the default
- Detect and clear placeholder strings
- Preserve user-provided values that are already valid

Respond in JSON:
{
  "fields": [
    {
      "key": "string",
      "originalValue": "any",
      "normalizedValue": "any",
      "action": "kept | coerced | defaulted | cleared | inferred",
      "reason": "string | null"
    }
  ],
  "missingRequired": ["string — keys of required fields that are missing"],
  "warnings": ["string — warnings about the normalization"],
  "confidence": 0.0-1.0
}`;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export async function intelligentNormalizeBindings(
  input: BindingNormalizationInput,
  backend: NativeIntelligenceBackend,
): Promise<BindingNormalizationResult> {
  const userPrompt = buildNormalizerPrompt(input);

  try {
    const completion = await backend.complete({
      systemPrompt: NORMALIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.1,
      maxTokens: 2048,
      responseFormat: "json",
    });

    const parsed = parseJsonSafe<NormalizerResponse>(completion.text);
    if (parsed) {
      return toNormalizationResult(parsed, input);
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return buildDeterministicNormalization(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback (no model required)
// ---------------------------------------------------------------------------

export function buildDeterministicNormalization(
  input: BindingNormalizationInput,
): BindingNormalizationResult {
  const { rawBindings, contract } = input;
  const fields: NormalizedField[] = [];
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  const normalizedBindings: Record<string, unknown> = {};

  for (const field of contract.inputs) {
    const rawValue = rawBindings[field.key];
    const hasValue = field.key in rawBindings;

    if (!hasValue) {
      if (field.required) {
        missingRequired.push(field.key);
        fields.push({
          key: field.key,
          originalValue: undefined,
          normalizedValue: undefined,
          action: "cleared",
          reason: `Required field "${field.label}" is not provided.`,
        });
      } else if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
        normalizedBindings[field.key] = field.defaultValue;
        fields.push({
          key: field.key,
          originalValue: undefined,
          normalizedValue: field.defaultValue,
          action: "defaulted",
          reason: `Using contract default for "${field.label}".`,
        });
      }
      continue;
    }

    if (isPlaceholderValue(rawValue)) {
      if (field.required) {
        missingRequired.push(field.key);
        warnings.push(`"${field.label}" contains a placeholder value and is required.`);
      }
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: field.defaultValue ?? "",
        action: "cleared",
        reason: "Placeholder value detected and cleared.",
      });
      normalizedBindings[field.key] = field.defaultValue ?? "";
      continue;
    }

    const coerced = coerceToFieldType(rawValue, field.type);
    if (coerced !== rawValue) {
      normalizedBindings[field.key] = coerced;
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: coerced,
        action: "coerced",
        reason: `Coerced from ${typeof rawValue} to ${field.type}.`,
      });
    } else {
      normalizedBindings[field.key] = rawValue;
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: rawValue,
        action: "kept",
      });
    }
  }

  for (const [key, value] of Object.entries(rawBindings)) {
    if (contract.inputs.some((i) => i.key === key)) continue;
    normalizedBindings[key] = value;
    fields.push({
      key,
      originalValue: value,
      normalizedValue: value,
      action: "kept",
      reason: "Extra binding not in contract — passed through.",
    });
  }

  return {
    normalizedBindings,
    fields,
    missingRequired,
    warnings,
    confidence: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Placeholder detection
// ---------------------------------------------------------------------------

function isPlaceholderValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("enter ") ||
    normalized.startsWith("select ") ||
    normalized === "placeholder" ||
    normalized === "todo" ||
    normalized === "tbd" ||
    normalized === "n/a" ||
    normalized === "none" ||
    normalized === "your_" ||
    normalized.startsWith("your_") ||
    normalized.startsWith("<") && normalized.endsWith(">")
  );
}

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

function coerceToFieldType(value: unknown, targetType: string): unknown {
  if (targetType === "number" && typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
  }

  if (targetType === "boolean" && typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }

  if (targetType === "array" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not valid JSON array — return as-is
    }
  }

  if (targetType === "object" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Not valid JSON object — return as-is
    }
  }

  return value;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildNormalizerPrompt(input: BindingNormalizationInput): string {
  const { nodeSlug, rawBindings, contract, userIntent, executionMode } = input;

  const sections: string[] = [
    `Node Slug: ${nodeSlug}`,
    `Execution Mode: ${executionMode ?? "hosted"}`,
  ];

  if (userIntent) {
    sections.push(`User Intent: ${userIntent}`);
  }

  sections.push("", "Contract Inputs:");
  for (const field of contract.inputs) {
    sections.push(
      `  - ${field.key} (${field.type}): ${field.required ? "REQUIRED" : "optional"}`
      + (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== ""
        ? ` [default: ${JSON.stringify(field.defaultValue)}]`
        : ""),
    );
  }

  sections.push("", "Raw Bindings:");
  for (const [key, value] of Object.entries(rawBindings)) {
    sections.push(`  - ${key}: ${JSON.stringify(value)}`);
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface NormalizerResponse {
  fields?: Array<{
    key?: string;
    originalValue?: unknown;
    normalizedValue?: unknown;
    action?: string;
    reason?: string;
  }>;
  missingRequired?: string[];
  warnings?: string[];
  confidence?: number;
}

function toNormalizationResult(
  raw: NormalizerResponse,
  input: BindingNormalizationInput,
): BindingNormalizationResult {
  const normalizedBindings: Record<string, unknown> = {};
  const fields: NormalizedField[] = [];

  if (Array.isArray(raw.fields)) {
    for (const f of raw.fields) {
      if (typeof f.key !== "string") continue;
      const action = validateAction(f.action);
      normalizedBindings[f.key] = f.normalizedValue ?? f.originalValue ?? input.rawBindings[f.key];
      fields.push({
        key: f.key,
        originalValue: f.originalValue ?? input.rawBindings[f.key],
        normalizedValue: f.normalizedValue ?? f.originalValue ?? input.rawBindings[f.key],
        action,
        reason: typeof f.reason === "string" ? f.reason : undefined,
      });
    }
  }

  for (const [key, value] of Object.entries(input.rawBindings)) {
    if (!(key in normalizedBindings)) {
      normalizedBindings[key] = value;
    }
  }

  return {
    normalizedBindings,
    fields,
    missingRequired: Array.isArray(raw.missingRequired) ? raw.missingRequired : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}

function validateAction(action: unknown): NormalizedField["action"] {
  const valid = ["kept", "coerced", "defaulted", "cleared", "inferred"];
  if (typeof action === "string" && valid.includes(action)) {
    return action as NormalizedField["action"];
  }
  return "kept";
}

// ---------------------------------------------------------------------------
// JSON parse helper
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(text: string): T | null {
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as T;
    }
    return null;
  } catch {
    return null;
  }
}
