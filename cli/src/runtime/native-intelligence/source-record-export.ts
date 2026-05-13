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

export function sandboxEnvelopeToTraceRecord(
  taskInput: LocalIntelligenceSandboxTaskInput,
  envelope: LocalModelSandboxRunEnvelope,
  /** Optional extra material for prompt hash (never log raw system prompts by default). */
  hashMaterial?: string,
): LocalIntelligenceTraceExportRecord {
  const hashBasis = hashMaterial ?? `${taskInput.taskId}\n${taskInput.userIntent}`;
  return {
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
}

export function formatTraceRecordJsonl(record: LocalIntelligenceTraceExportRecord): string {
  return `${JSON.stringify(record)}\n`;
}
