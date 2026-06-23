/**
 * Run Status Deltas V1 — truthful, evidence-backed run hydration.
 *
 * Turns a sandbox/workflow run record (the same `lastResponse`-shaped object
 * the run console already consumes) into a small, display-ready status
 * summary: is the run running / completed / failed, what is the latest log
 * line, did it produce output.
 *
 * Hard rules (this is why the helper exists instead of ad-hoc UI logic):
 *   - FINAL status is derived from exitCode / error / httpStatus ONLY. An
 *     arbitrary stdout line never becomes a trusted "step completed".
 *   - Per-step status is surfaced ONLY when the record carries a structured
 *     `events`/`steps` array. We do not invent steps by parsing logs.
 *   - Pure: no fetch, no React, no mutation. Never throws. Bounded string
 *     lengths. Secret-shaped text is redacted. Legacy records are supported.
 *
 * This module deliberately does NOT import React and does NOT call fetch.
 */

import { redactSecretsFromText } from "./orchestration-graph.js";

const MAX_LINE = 240;
const MAX_EVENTS = 50;
const EVENT_STATUS = new Set(["pending", "running", "completed", "failed", "info"]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function clampNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boundedRedact(text) {
  const redacted = redactSecretsFromText(safeString(text));
  return redacted.length > MAX_LINE ? `${redacted.slice(0, MAX_LINE - 1)}…` : redacted;
}

// Last non-empty line of a stream, redacted + length-bounded. Used purely as
// a human-readable "latest activity" preview — NOT as execution truth.
function lastLogLine(text) {
  const lines = safeString(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  return boundedRedact(lines[lines.length - 1]);
}

function emptyDeltas() {
  return {
    kind: "growthub-run-status-deltas-v1",
    version: 1,
    status: "idle",
    ok: false,
    statusSource: "none",
    exitCode: null,
    httpStatus: null,
    durationMs: null,
    startedAt: "",
    latestLog: null,
    hasOutput: false,
    receiptWritten: false,
    steps: [],
    events: []
  };
}

// Final status from hard evidence only.
function deriveStatus(record) {
  const exitCode = clampNumber(record.exitCode);
  const errorText = safeString(record.error || record.errorText).trim();
  const httpStatus = clampNumber(record.httpStatus ?? record.status);
  const lifecycle = safeString(record.lifecycleStatus).trim().toLowerCase();

  if (lifecycle === "canceled" || lifecycle === "cancelled" || record.canceled === true) {
    return { status: "canceled", ok: false, statusSource: "lifecycle" };
  }
  if (errorText || (exitCode != null && exitCode !== 0) || (httpStatus != null && (httpStatus < 200 || httpStatus >= 400))) {
    return { status: "failed", ok: false, statusSource: errorText ? "error" : exitCode != null ? "exit-code" : "http-status" };
  }
  if (exitCode === 0 || (httpStatus != null && httpStatus >= 200 && httpStatus < 300)) {
    return { status: "completed", ok: true, statusSource: exitCode === 0 ? "exit-code" : "http-status" };
  }
  // No terminal evidence yet. Distinguish actively-running from unknown using
  // an explicit running flag only — never from the mere presence of logs.
  if (record.running === true || lifecycle === "running" || lifecycle === "in_progress") {
    return { status: "running", ok: false, statusSource: "lifecycle" };
  }
  return { status: "unknown", ok: false, statusSource: "none" };
}

// Normalize a structured event array IF the record carries one. Malformed
// entries are dropped, not trusted. Status is constrained to a safe enum.
function normalizeEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];
  const out = [];
  for (const raw of rawEvents) {
    if (out.length >= MAX_EVENTS) break;
    if (!raw || typeof raw !== "object") continue;
    const label = boundedRedact(raw.label ?? raw.name ?? raw.node ?? raw.step);
    if (!label) continue;
    const statusRaw = safeString(raw.status).trim().toLowerCase();
    const status = EVENT_STATUS.has(statusRaw) ? statusRaw : "info";
    out.push({
      label,
      status,
      at: safeString(raw.at ?? raw.timestamp ?? raw.ts).trim(),
      detail: raw.detail != null ? boundedRedact(raw.detail) : ""
    });
  }
  return out;
}

/**
 * Derive truthful run status deltas from a run record (`lastResponse` shape).
 * Accepts the raw run record or a `{ lastResponse }` wrapper. Returns the
 * empty/idle envelope for missing or non-object input.
 */
function deriveRunStatusDeltas(input) {
  try {
    if (!input || typeof input !== "object") return emptyDeltas();
    const record = input.lastResponse && typeof input.lastResponse === "object" ? input.lastResponse : input;
    if (!record || typeof record !== "object") return emptyDeltas();

    const { status, ok, statusSource } = deriveStatus(record);
    const stderrLine = lastLogLine(record.stderr);
    const stdoutLine = lastLogLine(record.stdout);
    // Prefer stderr only when the run failed; otherwise the freshest stdout.
    let latestLog = null;
    if (status === "failed" && stderrLine) latestLog = { stream: "stderr", text: stderrLine };
    else if (stdoutLine) latestLog = { stream: "stdout", text: stdoutLine };
    else if (stderrLine) latestLog = { stream: "stderr", text: stderrLine };

    const output = record.output ?? record.normalizedOutput;
    const hasOutput = output != null && safeString(output).trim() !== "";
    const exportsAvailable = Array.isArray(record?.exports?.available) && record.exports.available.length > 0;

    const events = normalizeEvents(record.events ?? record.stepEvents ?? record.steps);

    return {
      kind: "growthub-run-status-deltas-v1",
      version: 1,
      status,
      ok,
      statusSource,
      exitCode: clampNumber(record.exitCode),
      httpStatus: clampNumber(record.httpStatus ?? record.status),
      durationMs: clampNumber(record.durationMs ?? record.elapsedMs),
      startedAt: safeString(record.ranAt ?? record.startedAt).trim(),
      latestLog,
      hasOutput,
      // A receipt is "written" only with real evidence of a persisted result.
      receiptWritten: Boolean(ok && (hasOutput || exportsAvailable || safeString(record.runId).trim())),
      steps: events,
      events
    };
  } catch (_error) {
    return emptyDeltas();
  }
}

const RUN_STATUS_LABELS = {
  idle: "Idle",
  unknown: "Awaiting result",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled"
};

function runStatusLabel(status) {
  return RUN_STATUS_LABELS[safeString(status).trim()] || "Awaiting result";
}

export { deriveRunStatusDeltas, runStatusLabel, RUN_STATUS_LABELS };
