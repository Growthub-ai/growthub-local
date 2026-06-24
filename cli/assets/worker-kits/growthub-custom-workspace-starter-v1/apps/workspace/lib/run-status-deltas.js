/**
 * Run status deltas — pure, evidence-only projection of a run record.
 *
 * Turns a sandbox/workflow run record (the `lastResponse` envelope, or a
 * parsed run record) into a small ordered list of step deltas the UI can
 * render as a live timeline. It is deliberately conservative:
 *
 *   - NO fake progress. A step is only marked `ok`/`bad` when there is
 *     concrete evidence (a structured event status, or the run's terminal
 *     exitCode/error). An arbitrary log line NEVER becomes a trusted
 *     "step completed".
 *   - Final phase is derived from exitCode/error ONLY.
 *   - When step detail comes from logs (not structured events), the result
 *     is flagged `derivedFrom: "logs"` so the UI can label it as log-derived
 *     rather than claiming per-step execution truth.
 *
 * Contract: pure (no fetch, no React, no mutation), deterministic, and it
 * NEVER throws — any malformed input degrades to a safe minimal delta.
 * Strings are bounded and secret-shaped fragments are redacted.
 */

const MAX_STEPS = 50;
const MAX_LABEL = 120;
const MAX_NOTE = 240;

// Status vocabularies (lowercased) for classifying structured event states.
const OK_WORDS = ["ok", "success", "succeeded", "complete", "completed", "done", "passed"];
const BAD_WORDS = ["fail", "failed", "error", "errored", "rejected", "canceled", "cancelled"];
const RUNNING_WORDS = ["running", "in_progress", "in-progress", "active", "executing", "started"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

// Conservative secret redaction + length bound. Mirrors the spirit of the
// trace panel's redactor but is self-contained so this lib never throws and
// has no coupling. Redacts `key=value` / `key: value` pairs whose key looks
// sensitive, and long opaque tokens.
function redactAndBound(input, max) {
  let text = safeString(input);
  if (!text) return "";
  try {
    text = text.replace(
      /\b([A-Za-z0-9_-]*(?:secret|token|key|password|passwd|authorization|bearer|api[_-]?key)[A-Za-z0-9_-]*)\s*([:=])\s*("?)[^\s"']+\3/gi,
      (_match, key, sep) => `${key}${sep} [redacted]`
    );
    // Long opaque tokens (e.g. sk-..., ghp_..., jwt-ish) → redacted.
    text = text.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");
  } catch {
    // If a regex engine edge case ever throws, fall through with raw-but-bounded.
  }
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return text;
}

function boundLabel(value, fallback) {
  const label = redactAndBound(value, MAX_LABEL);
  return label || fallback;
}

function classifyEventState(rawStatus) {
  const status = safeString(rawStatus).toLowerCase().trim();
  if (!status) return "waiting";
  if (BAD_WORDS.some((word) => status.includes(word))) return "bad";
  if (OK_WORDS.some((word) => status.includes(word))) return "ok";
  if (RUNNING_WORDS.some((word) => status.includes(word))) return "running";
  return "waiting";
}

// Pull the run record out of a raw value: object, or JSON string envelope.
function parseRecord(input) {
  if (isPlainObject(input)) return input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function lastNonEmptyLine(text) {
  const safe = safeString(text);
  if (!safe) return "";
  const lines = safe.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

// Map a structured events/steps array into bounded step deltas. Each item is
// trusted ONLY for its own declared status — never inferred.
function stepsFromEvents(events) {
  const out = [];
  for (const item of events) {
    if (out.length >= MAX_STEPS) break;
    if (!isPlainObject(item)) continue;
    const label = boundLabel(
      item.label ?? item.name ?? item.step ?? item.node ?? item.title,
      "Step"
    );
    const state = classifyEventState(item.status ?? item.state ?? item.result);
    const note = item.message != null || item.detail != null
      ? redactAndBound(item.message ?? item.detail, MAX_NOTE)
      : "";
    out.push({
      label,
      state,
      at: safeString(item.at ?? item.timestamp ?? item.ranAt).slice(0, 40),
      note,
    });
  }
  return out;
}

/**
 * Derive a run-status delta projection.
 *
 * @param {object|string|null} input lastResponse envelope or parsed record.
 * @returns {{
 *   phase: "idle"|"running"|"succeeded"|"failed",
 *   ok: boolean,
 *   exitCode: number|null,
 *   error: string,
 *   ranAt: string,
 *   durationMs: number|null,
 *   derivedFrom: "events"|"logs"|"none",
 *   steps: Array<{ label:string, state:string, at:string, note:string }>
 * }}
 */
function deriveRunStatusDeltas(input) {
  const empty = {
    phase: "idle",
    ok: false,
    exitCode: null,
    error: "",
    ranAt: "",
    durationMs: null,
    derivedFrom: "none",
    steps: [],
  };
  try {
    const record = parseRecord(input);
    if (!record) return empty;

    const exitCode = Number.isFinite(record.exitCode) ? Number(record.exitCode) : null;
    const error = redactAndBound(record.error, MAX_NOTE);
    const ranAt = safeString(record.ranAt).slice(0, 40);
    const durationMs = Number.isFinite(record.durationMs) ? Number(record.durationMs) : null;
    const statusWord = safeString(record.status).toLowerCase().trim();
    const stdout = safeString(record.stdout);
    const hasEvidenceOfStart = Boolean(ranAt) || exitCode !== null || Boolean(stdout) || Boolean(error);

    // ── Terminal phase from exitCode / error ONLY ──
    let phase;
    let ok = false;
    if (error || (exitCode !== null && exitCode !== 0)) {
      phase = "failed";
    } else if (exitCode === 0) {
      phase = "succeeded";
      ok = true;
    } else if (RUNNING_WORDS.includes(statusWord) || (hasEvidenceOfStart && !statusWord)) {
      phase = "running";
    } else {
      phase = "idle";
    }

    // ── Structured events take precedence; else conservative log-derived ──
    const structured = Array.isArray(record.events)
      ? record.events
      : Array.isArray(record.steps)
        ? record.steps
        : Array.isArray(record.stepEvents)
          ? record.stepEvents
          : null;

    let derivedFrom = "none";
    const steps = [];

    if (structured && structured.length) {
      const mapped = stepsFromEvents(structured);
      if (mapped.length) {
        derivedFrom = "events";
        steps.push(...mapped);
      }
    }

    if (!steps.length && hasEvidenceOfStart) {
      derivedFrom = "logs";
      // 1) Started — evidence-backed (we know the run began).
      steps.push({ label: "Run started", state: "ok", at: ranAt, note: "" });
      // 2) Latest log line — informational only, NEVER marked ok/bad per line.
      const latest = lastNonEmptyLine(stdout);
      if (latest) {
        steps.push({
          label: "Logs",
          state: phase === "running" ? "running" : "waiting",
          at: "",
          note: redactAndBound(latest, MAX_NOTE),
        });
      }
    }

    // Terminal truth from exitCode/error ONLY — appended regardless of how the
    // body steps were derived. A structured event stream that omits the final
    // state (e.g. all events "completed" but the run exited non-zero) still
    // gets an authoritative Completed/Failed step from exitCode/error.
    if (steps.length) {
      if (phase === "succeeded") {
        steps.push({ label: "Completed", state: "ok", at: "", note: durationMs != null ? `${durationMs} ms` : "" });
      } else if (phase === "failed") {
        steps.push({ label: "Failed", state: "bad", at: "", note: error || (exitCode != null ? `exit ${exitCode}` : "") });
      }
    }

    // Cap length, but always preserve the terminal step (the last entry) so
    // truth is never sliced off by a long event stream.
    const capped = steps.length > MAX_STEPS
      ? [...steps.slice(0, MAX_STEPS - 1), steps[steps.length - 1]]
      : steps;

    return { phase, ok, exitCode, error, ranAt, durationMs, derivedFrom, steps: capped };
  } catch {
    return empty;
  }
}

export { deriveRunStatusDeltas, classifyEventState };
