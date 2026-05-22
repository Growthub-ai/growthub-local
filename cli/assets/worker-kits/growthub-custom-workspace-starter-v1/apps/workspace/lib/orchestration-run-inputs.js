/**
 * Live Runs Console V2 — manual run input contract.
 *
 * Pure helper for discovering, validating, normalizing, and redacting the
 * manual run-input envelope used by form / human-input nodes in the
 * orchestration graph.
 *
 * Contract:
 *
 *   {
 *     "kind":   "growthub-workflow-run-inputs-v1",
 *     "source": "manual",
 *     "values": { "<fieldId>": "<safe string>" },
 *     "files":  [{ "id": "<attachmentId>", "name": "...", "size": <bytes> }]
 *   }
 *
 * Invariants:
 *   - No React, no fetch, no workspace mutation.
 *   - Secret-looking values (Bearer tokens, api_key= patterns, password=, etc.)
 *     are redacted before display and before persistence.
 *   - Field IDs marked as `secret` are stripped to `secretRef` only — raw
 *     values are never accepted from the browser into a run record.
 *   - Backward compatible: workflows without human-input nodes return
 *     { requiresInput: false } and the rest of the pipeline behaves as it
 *     did in V1.
 */

import { parseOrchestrationGraph, redactSecretsFromText } from "./orchestration-graph.js";

const RUN_INPUTS_KIND = "growthub-workflow-run-inputs-v1";
const MAX_RUN_INPUT_VALUES = 64;
const MAX_RUN_INPUT_FIELD_BYTES = 8 * 1024;
const MAX_RUN_INPUT_TOTAL_BYTES = 64 * 1024;
const MAX_RUN_INPUT_FILES = 16;

const KNOWN_FIELD_TYPES = new Set([
  "text",
  "string",
  "email",
  "url",
  "number",
  "integer",
  "textarea",
  "json",
  "boolean",
  "checkbox",
  "secretRef",
  "secret-ref",
  "select"
]);

const SECRETISH_KEYS = /^(api[_-]?key|token|password|secret|authorization|bearer)$/i;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function byteLength(value) {
  try {
    return Buffer.byteLength(safeString(value), "utf8");
  } catch {
    return safeString(value).length;
  }
}

function parseFieldDescriptor(entry) {
  if (!entry || typeof entry !== "object") return null;
  const idRaw = safeString(entry.key || entry.id || entry.name).trim();
  if (!idRaw) return null;
  const id = idRaw.replace(/\s+/g, "_");
  const descriptor = safeString(entry.value ?? entry.type ?? entry.help).trim();
  const lower = descriptor.toLowerCase();
  let type = "text";
  let helpText = "";
  if (KNOWN_FIELD_TYPES.has(lower)) {
    type = lower === "secret-ref" ? "secretRef" : lower;
  } else if (descriptor) {
    helpText = descriptor;
  }
  const isSecret = type === "secretRef" || SECRETISH_KEYS.test(id);
  return {
    id,
    label: safeString(entry.label || idRaw).trim() || id,
    type: isSecret ? "secretRef" : type,
    required: entry.required !== false && entry.optional !== true,
    helpText,
    isSecret
  };
}

function discoverRunInputSchema(graphValue) {
  const graph = parseOrchestrationGraph(graphValue) || graphValue || null;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const fields = [];
  const seen = new Set();
  let requiresInput = false;
  let title = "";
  let instructions = "";

  for (const node of nodes) {
    const type = safeString(node?.type).trim();
    const action = safeString(node?.config?.action).trim();
    const isHumanInputForm = type === "human-input" || action === "form";
    if (!isHumanInputForm) continue;
    const config = node?.config && typeof node.config === "object" ? node.config : {};
    if (!title) title = safeString(config.title).trim();
    if (!instructions) instructions = safeString(config.instructions).trim();
    const requiredFlag = config.required !== false && config.requiresInput !== false;
    if (requiredFlag) requiresInput = true;
    const rawFields = Array.isArray(config.fields) ? config.fields : [];
    for (const raw of rawFields) {
      const descriptor = parseFieldDescriptor(raw);
      if (!descriptor) continue;
      if (seen.has(descriptor.id)) continue;
      seen.add(descriptor.id);
      if (!requiredFlag) descriptor.required = false;
      fields.push(descriptor);
    }
  }

  return {
    kind: RUN_INPUTS_KIND,
    requiresInput: requiresInput && fields.length > 0,
    title: title || "Run inputs",
    instructions,
    fields
  };
}

function coerceFieldValue(field, raw) {
  if (raw == null) return "";
  if (field?.isSecret || field?.type === "secretRef") {
    if (raw && typeof raw === "object" && "secretRef" in raw) return raw;
    return safeString(raw);
  }
  if (field.type === "boolean" || field.type === "checkbox") {
    if (typeof raw === "boolean") return raw;
    const text = safeString(raw).trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(text);
  }
  if (field.type === "number" || field.type === "integer") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : "";
  }
  if (field.type === "json") {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw.slice(0, MAX_RUN_INPUT_FIELD_BYTES);
      }
    }
    return raw;
  }
  return safeString(raw);
}

function redactValueForPersistence(field, value) {
  if (field?.isSecret) {
    if (value && typeof value === "object" && value.secretRef) {
      return { secretRef: safeString(value.secretRef).trim() };
    }
    return { secretRef: "[redacted]" };
  }
  if (typeof value === "string") {
    const truncated = value.length > MAX_RUN_INPUT_FIELD_BYTES
      ? `${value.slice(0, MAX_RUN_INPUT_FIELD_BYTES)}…`
      : value;
    return redactSecretsFromText(truncated);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value == null) return "";
  try {
    return JSON.parse(redactSecretsFromText(JSON.stringify(value)));
  } catch {
    return "";
  }
}

function normalizeFile(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = safeString(entry.id || entry.attachmentId).trim();
  if (!id) return null;
  const name = safeString(entry.name || entry.filename || "").trim();
  const size = Number(entry.size);
  return {
    id,
    name,
    size: Number.isFinite(size) && size >= 0 ? size : 0
  };
}

function validateRunInputsEnvelope(envelope, schema) {
  if (envelope == null) return { ok: true, missing: [], unknown: [] };
  if (typeof envelope !== "object" || Array.isArray(envelope)) {
    return { ok: false, error: "runInputs must be an object", missing: [], unknown: [] };
  }
  const knownFieldIds = new Set((schema?.fields || []).map((f) => f.id));
  const values = envelope.values && typeof envelope.values === "object" && !Array.isArray(envelope.values)
    ? envelope.values
    : {};
  const valueKeys = Object.keys(values);
  if (valueKeys.length > MAX_RUN_INPUT_VALUES) {
    return { ok: false, error: `runInputs.values exceeds ${MAX_RUN_INPUT_VALUES} fields`, missing: [], unknown: [] };
  }
  let totalBytes = 0;
  for (const key of valueKeys) {
    const bytes = byteLength(values[key]);
    if (bytes > MAX_RUN_INPUT_FIELD_BYTES) {
      return { ok: false, error: `runInputs.values["${key}"] exceeds ${MAX_RUN_INPUT_FIELD_BYTES} bytes`, missing: [], unknown: [] };
    }
    totalBytes += bytes;
  }
  if (totalBytes > MAX_RUN_INPUT_TOTAL_BYTES) {
    return { ok: false, error: `runInputs.values exceeds ${MAX_RUN_INPUT_TOTAL_BYTES} bytes`, missing: [], unknown: [] };
  }
  const files = Array.isArray(envelope.files) ? envelope.files : [];
  if (files.length > MAX_RUN_INPUT_FILES) {
    return { ok: false, error: `runInputs.files exceeds ${MAX_RUN_INPUT_FILES} entries`, missing: [], unknown: [] };
  }
  const missing = (schema?.fields || [])
    .filter((f) => f.required && !(f.id in values))
    .map((f) => f.id);
  const unknown = valueKeys.filter((id) => knownFieldIds.size > 0 && !knownFieldIds.has(id));
  return { ok: missing.length === 0, missing, unknown };
}

function normalizeRunInputsEnvelope(value, schema) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const schemaFields = Array.isArray(schema?.fields) ? schema.fields : [];
  const fieldsById = new Map(schemaFields.map((f) => [f.id, f]));
  const rawValues = value.values && typeof value.values === "object" && !Array.isArray(value.values)
    ? value.values
    : {};
  const safeValues = {};
  for (const [key, raw] of Object.entries(rawValues)) {
    const id = safeString(key).trim();
    if (!id) continue;
    const field = fieldsById.get(id) || parseFieldDescriptor({ key: id, value: "" });
    const coerced = coerceFieldValue(field, raw);
    safeValues[id] = redactValueForPersistence(field, coerced);
  }
  const rawFiles = Array.isArray(value.files) ? value.files : [];
  const files = rawFiles.map(normalizeFile).filter(Boolean).slice(0, MAX_RUN_INPUT_FILES);
  const source = safeString(value.source || "manual").trim() || "manual";
  return {
    kind: RUN_INPUTS_KIND,
    source,
    values: safeValues,
    files
  };
}

function redactRunInputsEnvelope(value) {
  if (!value || typeof value !== "object") return null;
  const fields = Array.isArray(value.fields) ? value.fields : [];
  const fieldsById = new Map(fields.map((f) => [f.id || f.key, f]));
  const out = {
    kind: safeString(value.kind || RUN_INPUTS_KIND).trim() || RUN_INPUTS_KIND,
    source: safeString(value.source || "manual").trim() || "manual",
    values: {},
    files: []
  };
  const rawValues = value.values && typeof value.values === "object" && !Array.isArray(value.values)
    ? value.values
    : {};
  for (const [key, raw] of Object.entries(rawValues)) {
    const field = fieldsById.get(key) || { id: key, isSecret: SECRETISH_KEYS.test(key) };
    out.values[key] = redactValueForPersistence(field, raw);
  }
  const rawFiles = Array.isArray(value.files) ? value.files : [];
  out.files = rawFiles.map(normalizeFile).filter(Boolean);
  return out;
}

function summarizeRunInputs(value) {
  if (!value || typeof value !== "object") {
    return { source: "", fieldCount: 0, fileCount: 0, fieldIds: [] };
  }
  const values = value.values && typeof value.values === "object" && !Array.isArray(value.values)
    ? value.values
    : {};
  const files = Array.isArray(value.files) ? value.files : [];
  const fieldIds = Object.keys(values);
  return {
    source: safeString(value.source || "manual").trim() || "manual",
    fieldCount: fieldIds.length,
    fileCount: files.length,
    fieldIds
  };
}

function buildInputPayloadForRunner(envelope) {
  if (!envelope || typeof envelope !== "object") return {};
  const values = envelope.values && typeof envelope.values === "object" && !Array.isArray(envelope.values)
    ? envelope.values
    : {};
  const out = {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw && typeof raw === "object" && "secretRef" in raw) {
      continue;
    }
    out[key] = raw;
  }
  return out;
}

export {
  RUN_INPUTS_KIND,
  MAX_RUN_INPUT_VALUES,
  MAX_RUN_INPUT_FIELD_BYTES,
  MAX_RUN_INPUT_TOTAL_BYTES,
  MAX_RUN_INPUT_FILES,
  discoverRunInputSchema,
  normalizeRunInputsEnvelope,
  redactRunInputsEnvelope,
  summarizeRunInputs,
  validateRunInputsEnvelope,
  buildInputPayloadForRunner,
  parseFieldDescriptor
};
