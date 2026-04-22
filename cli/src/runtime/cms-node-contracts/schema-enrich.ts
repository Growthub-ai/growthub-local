/**
 * Schema Enrichment
 *
 * Lifts the existing `input_template` / `output_mapping` introspection
 * (see `introspect.ts`) into a formal `NodeInputSchema` / `NodeOutputSchema`
 * from the v1 public contract (`@growthub/api-contract`).
 *
 * Rules:
 *   - Never widens the hosted contract. Only interprets fields already present.
 *   - Per-family heuristics drive `providerNeutralIntent` + `uiHint`.
 *   - Output field typing maps to the v1 `NodeOutputFieldType` taxonomy.
 *
 * Consumers get one renderer across CLI, hosted UI, harnesses, and agents.
 */

import type {
  CapabilityFamily,
  NodeInputField,
  NodeInputProviderNeutralIntent,
  NodeInputSchema,
  NodeInputUiHint,
  NodeOutputField,
  NodeOutputFieldType,
  NodeOutputSchema,
} from "@growthub/api-contract";
import type { CmsCapabilityNode } from "../cms-capability-registry/index.js";
import { humanizeFieldKey } from "./introspect.js";

// ---------------------------------------------------------------------------
// Provider-neutral intent inference (per-family heuristic table)
// ---------------------------------------------------------------------------

type IntentMatcher = (key: string) => boolean;

interface IntentRule {
  intent: NodeInputProviderNeutralIntent;
  match: IntentMatcher;
}

const INTENT_RULES: IntentRule[] = [
  { intent: "prompt",            match: (k) => /^(prompt|instruction|query|input_text|user_prompt)$/.test(k) },
  { intent: "negative-prompt",   match: (k) => /negative[_-]?prompt/.test(k) },
  { intent: "seed",              match: (k) => /^seed$/.test(k) || k === "random_seed" },
  { intent: "count",             match: (k) => /^(count|num|n|num_outputs|num_images|num_frames|num_samples)$/.test(k) },
  { intent: "aspect-ratio",      match: (k) => /aspect[_-]?ratio/.test(k) || k === "ratio" },
  { intent: "duration",          match: (k) => /^(duration|length|seconds|duration_seconds|duration_ms)$/.test(k) },
  { intent: "quality",           match: (k) => /^(quality|fidelity|detail)$/.test(k) },
  { intent: "style",             match: (k) => /^(style|style_preset|aesthetic)$/.test(k) },
  { intent: "model",             match: (k) => /^(model|model_id|model_name|engine)$/.test(k) },
  { intent: "reference-image",   match: (k) => /reference[_-]?image|init[_-]?image|image_url/.test(k) },
  { intent: "reference-video",   match: (k) => /reference[_-]?video|init[_-]?video|video_url/.test(k) },
  { intent: "reference-audio",   match: (k) => /reference[_-]?audio|init[_-]?audio|audio_url/.test(k) },
  { intent: "document",          match: (k) => /^(document|doc|file|attachment|pdf|source_file)$/.test(k) },
  { intent: "connection",        match: (k) => /connection[_-]?id|connection$/.test(k) },
  { intent: "api-key",           match: (k) => /api[_-]?key|secret[_-]?key/.test(k) },
];

function inferIntent(key: string): NodeInputProviderNeutralIntent {
  const normalized = key.toLowerCase();
  for (const rule of INTENT_RULES) {
    if (rule.match(normalized)) return rule.intent;
  }
  return "unspecified";
}

// ---------------------------------------------------------------------------
// Field construction
// ---------------------------------------------------------------------------

function isLongTextKey(key: string): boolean {
  const k = key.toLowerCase();
  return /prompt|description|instruction|text|content|body|long[_-]?text/.test(k);
}

function looksLikeMediaUrl(key: string): boolean {
  const k = key.toLowerCase();
  return /(image|video|audio|file|attachment|reference|init)[_-]?(url|path|src)?$/.test(k);
}

function uiHintFor(intent: NodeInputProviderNeutralIntent, key: string): NodeInputUiHint | undefined {
  if (intent === "api-key") return "password";
  if (intent === "model" || intent === "style" || intent === "quality") return "dropdown";
  if (intent === "document") return "file-picker";
  if (
    intent === "reference-image" ||
    intent === "reference-video" ||
    intent === "reference-audio"
  ) {
    return "url-or-file";
  }
  if (intent === "prompt" || intent === "negative-prompt" || isLongTextKey(key)) return "textarea";
  return undefined;
}

function fieldBase(key: string, templateValue: unknown) {
  const required = templateValue === "" || templateValue === null || templateValue === undefined;
  const intent = inferIntent(key);
  const uiHint = uiHintFor(intent, key);
  return {
    key,
    label: humanizeFieldKey(key),
    required,
    providerNeutralIntent: intent,
    uiHint,
    defaultValue: templateValue,
  };
}

function toInputField(key: string, templateValue: unknown): NodeInputField {
  const base = fieldBase(key, templateValue);
  const intent = base.providerNeutralIntent;

  if (
    intent === "reference-image" ||
    intent === "reference-video" ||
    intent === "reference-audio" ||
    looksLikeMediaUrl(key)
  ) {
    return { ...base, fieldType: "url-or-file" };
  }
  if (intent === "document") {
    return { ...base, fieldType: "file" };
  }
  if (typeof templateValue === "number") {
    return {
      ...base,
      fieldType: "number",
      integer: Number.isInteger(templateValue),
    };
  }
  if (typeof templateValue === "boolean") {
    return { ...base, fieldType: "boolean" };
  }
  if (Array.isArray(templateValue)) {
    return { ...base, fieldType: "array" };
  }
  if (templateValue && typeof templateValue === "object") {
    return { ...base, fieldType: "json", uiHint: base.uiHint ?? "json-editor" };
  }
  if (intent === "prompt" || intent === "negative-prompt" || isLongTextKey(key)) {
    return { ...base, fieldType: "long-text" };
  }
  return { ...base, fieldType: "text" };
}

// ---------------------------------------------------------------------------
// Output mapping → NodeOutputSchema
// ---------------------------------------------------------------------------

function normalizeOutputType(value: unknown, family: CapabilityFamily): NodeOutputFieldType {
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "image" || v === "video" || v === "slides" || v === "audio") return v;
    if (v === "text" || v === "long-text") return v;
    if (v === "number" || v === "boolean" || v === "array" || v === "object" || v === "file") return v;
  }
  if (value && typeof value === "object") {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") return normalizeOutputType(type, family);
    return "object";
  }
  if (family === "image") return "image";
  if (family === "video") return "video";
  if (family === "slides") return "slides";
  if (family === "text") return "long-text";
  return "unknown";
}

function toOutputField(
  key: string,
  value: unknown,
  family: CapabilityFamily,
): NodeOutputField {
  return {
    key,
    fieldType: normalizeOutputType(value, family),
    required: false,
  };
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export function enrichInputSchema(node: CmsCapabilityNode): NodeInputSchema {
  const template = node.executionTokens.input_template ?? {};
  const fields: NodeInputField[] = Object.entries(template).map(([key, value]) =>
    toInputField(key, value),
  );
  return { fields };
}

export function enrichOutputSchema(node: CmsCapabilityNode): NodeOutputSchema {
  const mapping = node.executionTokens.output_mapping ?? {};
  const outputs: NodeOutputField[] = Object.entries(mapping).map(([key, value]) =>
    toOutputField(key, value, node.family),
  );
  return { outputs };
}
