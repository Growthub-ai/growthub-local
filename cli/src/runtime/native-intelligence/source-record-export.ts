/**
 * JSONL-ready export for local-intelligence sandbox envelopes (distillation substrate).
 * Does not train models — external tooling consumes these records.
 */

import { createHash } from "node:crypto";
import type { LocalIntelligenceSandboxTaskInput, LocalModelSandboxRunEnvelope } from "./contract.js";

export const LOCAL_INTELLIGENCE_TRACE_RECORD_VERSION = "growthub-local-intelligence-trace-v1" as const;

export interface LocalIntelligenceTraceExportRecord {
  version: typeof LOCAL_INTELLIGENCE_TRACE_RECORD_VERSION;
  taskId: string;
  businessObjectType: string;
  modelId: string;
  systemPromptHash: string;
  input: {
    userIntent: string;
    availableContracts: Array<{ slug: string; displayName: string }>;
    bindings?: Record<string, unknown>;
  };
  output: {
    json?: Record<string, unknown>;
    toolIntents: unknown[];
    warnings: string[];
  };
  validation: {
    acceptedToolIntents: unknown[];
    rejectedToolIntents: unknown[];
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Keys that must never leave the tenant boundary in trace exports. */
const SENSITIVE_KEY = /^(password|passwd|secret|token|apikey|api_key|authorization|authheader|cookie|set-cookie|privatekey|private_key|credential|bearer|access_token|refresh_token|client_secret)$/i;

function redactString(s: string): string {
  let t = s;
  if (/bearer\s+[\w.-]+/i.test(t)) t = t.replace(/bearer\s+[\w.-]+/gi, "bearer [REDACTED]");
  if (/sk-[a-zA-Z0-9]{8,}/.test(t)) t = t.replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) return "[REDACTED]";
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(t)) {
    t = t.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
  }
  return t;
}

/**
 * Deep-redact values suitable for JSONL / shared analytics pipelines.
 * Conservative: unknown object shapes are still descended; sensitive keys stripped.
 */
export function redactForTraceExport(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactForTraceExport);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = redactForTraceExport(v);
  }
  return out;
}

export function sandboxEnvelopeToTraceRecord(
  taskInput: LocalIntelligenceSandboxTaskInput,
  envelope: LocalModelSandboxRunEnvelope,
  /** Optional extra material for prompt hash (never log raw system prompts by default). */
  hashMaterial?: string,
): LocalIntelligenceTraceExportRecord {
  const hashBasis = hashMaterial ?? `${taskInput.taskId}\n${taskInput.userIntent}`;
  const raw: LocalIntelligenceTraceExportRecord = {
    version: LOCAL_INTELLIGENCE_TRACE_RECORD_VERSION,
    taskId: envelope.taskId,
    businessObjectType: envelope.businessObjectType,
    modelId: envelope.adapter.modelId,
    systemPromptHash: sha256(hashBasis),
    input: {
      userIntent: taskInput.userIntent,
      availableContracts: taskInput.context.availableContracts.map((c) => ({
        slug: c.slug,
        displayName: c.displayName,
      })),
      bindings: taskInput.context.bindings,
    },
    output: {
      json: envelope.result.json,
      toolIntents: envelope.result.toolIntents,
      warnings: envelope.result.warnings,
    },
    validation: {
      acceptedToolIntents: envelope.validatedToolIntents ?? [],
      rejectedToolIntents: envelope.rejectedToolIntents ?? [],
    },
  };
  return redactForTraceExport(raw) as LocalIntelligenceTraceExportRecord;
}

export function formatTraceRecordJsonl(record: LocalIntelligenceTraceExportRecord): string {
  return `${JSON.stringify(record)}\n`;
}
