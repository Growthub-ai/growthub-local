/**
 * Canonical, browser-safe training dataset serialization.
 *
 * The no-code handoff and the server-side remote-compute data plane import
 * this exact module, so downloaded/staged JSONL bytes cannot drift because two
 * writers formatted the same traces differently.
 */

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
