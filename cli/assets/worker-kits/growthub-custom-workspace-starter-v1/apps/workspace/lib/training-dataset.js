/**
 * Canonical, browser-safe training dataset serialization.
 *
 * The no-code handoff and the server-side remote-compute data plane import
 * this exact module, so downloaded/staged JSONL bytes cannot drift because two
 * writers formatted the same traces differently.
 */
import { normalizeDistillationTrace } from "./distillation-gateway.js";

export const TRAINING_DATASET_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";

function str(value) {
  return String(value ?? "");
}

export function trainingTraceToDatasetRecord(row) {
  const input = str(row?.inputPrompt).trim();
  const output = str(row?.agentOutput).trim();
  if (!input || !output) return null;
  return {
    instruction: TRAINING_DATASET_INSTRUCTION,
    input,
    output,
  };
}

export function trainingTraceToJsonlLine(row) {
  const record = trainingTraceToDatasetRecord(row);
  return record ? `${JSON.stringify(record)}\n` : "";
}

export function buildTrainingDatasetJsonl(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(trainingTraceToJsonlLine)
    .filter(Boolean)
    .join("");
}

/**
 * Canonical lossless-to-training bridge for one normalized distillation trace.
 * The caller controls ordering and hashes the exact returned UTF-8 bytes.
 * Invalid or incomplete traces fail closed instead of producing blank rows.
 */
export function distillationTraceToJsonlLine(row) {
  const trace = normalizeDistillationTrace(row);
  if (
    trace.schema !== "growthub-distillation-trace-v1"
    || !trace.traceId
    || !trace.prompt.trim()
    || !trace.response.trim()
  ) {
    throw new Error("distillation trace is incomplete and cannot enter JSONL");
  }
  return `${JSON.stringify(trace)}\n`;
}

export function buildDistillationTraceJsonl(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(distillationTraceToJsonlLine)
    .join("");
}
