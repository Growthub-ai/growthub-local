/**
 * JSONL-ready export for local-intelligence sandbox envelopes (distillation substrate).
 * Does not train models — external tooling consumes these records.
 */

import { createHash } from "node:crypto";
import type { LocalModelSandboxRunEnvelope } from "./contract.js";

export interface LocalIntelligenceTraceRecordV1 {
  version: "growthub-local-intelligence-trace-v1";
  taskId: string;
  businessObjectType: string;
  businessObjectId?: string;
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
  /**
   * Provenance — optional, additive (back-compat with existing corpora).
   * Stamped by `growthub intelligence export` so every governed trace is
   * source-hashed (dedupe + incremental), capability-tagged, label-typed,
   * and redaction-classified. Enterprise-safe by construction.
   */
  provenance?: {
    sourceHash: string;
    sourceRef: string;
    surface: string;
    capabilityTag: string;
    labelType: string;
    redactionStatus: "clean" | "redacted" | "blocked";
  };
  createdAt: string;
}

export function hashSystemPrompt(systemPrompt: string): string {
  return createHash("sha256").update(systemPrompt, "utf8").digest("hex");
}

export function sandboxEnvelopeToTraceRecord(
  envelope: LocalModelSandboxRunEnvelope,
  options: {
    systemPrompt: string;
    userIntent: string;
    availableContracts?: Array<{ slug: string; displayName: string }>;
  },
): LocalIntelligenceTraceRecordV1 {
  return {
    version: "growthub-local-intelligence-trace-v1",
    taskId: envelope.taskId,
    businessObjectType: envelope.businessObjectType,
    businessObjectId: envelope.businessObjectId,
    modelId: envelope.adapter.modelId,
    systemPromptHash: hashSystemPrompt(options.systemPrompt),
    input: {
      userIntent: options.userIntent,
      availableContracts: options.availableContracts ?? [],
      bindings:
        envelope.result.json && typeof envelope.result.json === "object" && envelope.result.json !== null
          && "bindings" in envelope.result.json
          && typeof (envelope.result.json as { bindings?: unknown }).bindings === "object"
          ? ((envelope.result.json as { bindings: Record<string, unknown> }).bindings)
          : undefined,
    },
    output: {
      json: envelope.result.json,
      toolIntents: envelope.result.toolIntents,
      warnings: [
        ...envelope.result.warnings,
        ...(envelope.validatedToolIntents?.flatMap((v) => v.warnings) ?? []),
      ],
    },
    validation: {
      acceptedToolIntents: envelope.validatedToolIntents ?? [],
      rejectedToolIntents: envelope.rejectedToolIntents ?? [],
    },
    createdAt: envelope.createdAt,
  };
}

export function formatTraceRecordLine(record: LocalIntelligenceTraceRecordV1): string {
  return `${JSON.stringify(record)}\n`;
}
