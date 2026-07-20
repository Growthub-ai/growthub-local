/**
 * Deterministic streaming redaction for governed inference output.
 *
 * A finite-state carry buffer plus a precompiled pattern set runs
 * incrementally over token chunks. Matches are replaced with [REDACTED] and
 * the surrounding tail is held back so a partial match can never be split
 * across chunk boundaries and leak. Every redaction is recorded as a bounded
 * event carrying the source offset and a hash of the matched value — raw PII
 * never enters receipts, spans, or the cache. When any redaction fires, the
 * gateway caches only the redacted response.
 */

import { createHmac, randomBytes } from "node:crypto";
import { sha256Hex } from "./contracts.js";

/**
 * Redaction preview hashes are ALWAYS keyed (HMAC-SHA256). An unkeyed hash of
 * low-entropy PII (a 9-digit SSN, a 10-digit phone number) is trivially
 * reversible by enumeration once a receipt is shared. Key precedence:
 * operator workspace signing key, then the operator cache HMAC key, then a
 * per-process ephemeral key (safe default; correlation is then process-local).
 */
let processPreviewKey = null;
function keyDescriptor(key, source) {
  return { key, keyId: sha256Hex(`growthub-redaction-key:${key}`).slice(0, 16), source };
}
export function resolveRedactionPreviewKey(env = process.env) {
  const workspaceKey = String(env?.GROWTHUB_WORKSPACE_SIGNING_KEY || "").trim();
  if (workspaceKey) return keyDescriptor(`growthub-redaction-preview:${workspaceKey}`, "workspace");
  const cacheOperatorKey = String(env?.GROWTHUB_INFERENCE_CACHE_HMAC_KEY || "").trim();
  if (cacheOperatorKey) return keyDescriptor(`growthub-redaction-preview:${cacheOperatorKey}`, "cache-operator");
  // Process-ephemeral: safe default, but hashes stop correlating across
  // restarts. The receipt records this tier so the trade-off is visible.
  if (!processPreviewKey) processPreviewKey = randomBytes(32).toString("hex");
  return keyDescriptor(processPreviewKey, "process-ephemeral");
}

function previewHash(key, raw) {
  return createHmac("sha256", key).update(String(raw)).digest("hex");
}

/**
 * Hold-back window in characters. Must be at least as long as the longest
 * realistic single match (a spaced 19-digit PAN is 28 chars; long emails can
 * exceed that). A candidate match that crosses the release cut is retained in
 * the carry, so matches inside the window are never split.
 */
const DEFAULT_HOLDBACK_CHARS = 64;

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Ordered pattern set. Priority resolves overlaps deterministically:
 * an SSN inside a longer digit run is claimed by the more specific rule.
 * `validate` receives the raw match and may veto it (Luhn for cards).
 */
export const REDACTION_PATTERN_SET = Object.freeze([
  Object.freeze({
    id: "ssn",
    type: "PII_SSN",
    source: "\\b(?!000|666|9\\d{2})\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}\\b",
    priority: 0,
  }),
  Object.freeze({
    id: "credit-card",
    type: "PII_CREDIT_CARD",
    source: "\\b\\d(?:[ -]?\\d){12,18}\\b",
    priority: 1,
    validate: (raw) => {
      const digits = raw.replace(/[ -]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    },
  }),
  Object.freeze({
    id: "email",
    type: "PII_EMAIL",
    source: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}\\b",
    priority: 2,
  }),
  Object.freeze({
    id: "phone",
    type: "PII_PHONE",
    // Separators are required so plain integers are not treated as phones.
    source: "(?:\\+?1[ .-])?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}\\b",
    priority: 3,
  }),
]);

export const REDACTION_PLACEHOLDER = "[REDACTED]";

export function compileRedactionPatterns(requested = []) {
  const wanted = Array.isArray(requested) && requested.length
    ? new Set(requested.map((value) => String(value || "").toLowerCase()))
    : null;
  const patterns = REDACTION_PATTERN_SET
    .filter((pattern) => !wanted || wanted.has(pattern.id) || wanted.has(pattern.type.toLowerCase()))
    .map((pattern) => ({ ...pattern, regex: new RegExp(pattern.source, "g") }));
  return {
    patterns,
    patternsSha256: sha256Hex(JSON.stringify(patterns.map((pattern) => ({ id: pattern.id, source: pattern.source })))),
  };
}

function collectMatches(patterns, text) {
  const matches = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.regex.lastIndex += 1;
        continue;
      }
      if (typeof pattern.validate === "function" && !pattern.validate(match[0])) continue;
      matches.push({ start: match.index, end: match.index + match[0].length, raw: match[0], type: pattern.type, priority: pattern.priority });
    }
  }
  // Deterministic overlap resolution: earliest start, then rule priority,
  // then longest match. Later overlapping candidates are dropped.
  matches.sort((a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end);
  const selected = [];
  let lastEnd = -1;
  for (const candidate of matches) {
    if (candidate.start < lastEnd) continue;
    selected.push(candidate);
    lastEnd = candidate.end;
  }
  return selected;
}

/**
 * Incremental redactor. `process(chunk)` returns the safely releasable
 * redacted text; `flush()` drains the remaining carry. Offsets in events are
 * absolute character offsets in the unredacted source stream.
 */
export function createStreamingRedactor({ patterns: requestedPatterns, holdbackChars = DEFAULT_HOLDBACK_CHARS, previewKey = "" } = {}) {
  const { patterns, patternsSha256 } = compileRedactionPatterns(requestedPatterns);
  const keyInfo = previewKey && typeof previewKey === "object" && previewKey.key
    ? { key: String(previewKey.key), keyId: String(previewKey.keyId || sha256Hex(`growthub-redaction-key:${previewKey.key}`).slice(0, 16)), source: String(previewKey.source || "caller") }
    : String(previewKey || "")
      ? { key: String(previewKey), keyId: sha256Hex(`growthub-redaction-key:${previewKey}`).slice(0, 16), source: "caller" }
      : resolveRedactionPreviewKey();
  const hashKey = keyInfo.key;
  const holdback = Math.max(32, Math.min(1024, Math.floor(Number(holdbackChars) || DEFAULT_HOLDBACK_CHARS)));
  let carry = "";
  let sourceBase = 0;
  const events = [];

  // Characters that can participate in a match. Cutting between two of them
  // would fabricate a word boundary in the carry that the full text does not
  // have, so the release cut backs off to a real token boundary (bounded).
  const TOKEN_CHAR = /[A-Za-z0-9@._%+()-]/;

  function tokenSafeCut(buffer, cutLimit) {
    let cut = cutLimit;
    const floor = Math.max(0, cutLimit - 4096);
    while (cut > floor && cut < buffer.length && TOKEN_CHAR.test(buffer[cut - 1]) && TOKEN_CHAR.test(buffer[cut])) cut -= 1;
    return cut;
  }

  function drain(buffer, cutLimit) {
    const matches = collectMatches(patterns, buffer);
    // Never release a match candidate that crosses the cut: pull the cut back
    // to the start of the first crossing match so it stays whole in the carry.
    let cut = cutLimit >= buffer.length ? buffer.length : tokenSafeCut(buffer, cutLimit);
    for (const match of matches) {
      if (match.start < cut && match.end > cut) {
        cut = match.start;
        break;
      }
    }
    let released = "";
    let cursor = 0;
    for (const match of matches) {
      if (match.end > cut) break;
      released += buffer.slice(cursor, match.start) + REDACTION_PLACEHOLDER;
      events.push({
        type: match.type,
        start_char_offset: sourceBase + match.start,
        length: match.raw.length,
        redacted_preview_hash: previewHash(hashKey, match.raw),
      });
      cursor = match.end;
    }
    released += buffer.slice(cursor, cut);
    carry = buffer.slice(cut);
    sourceBase += cut;
    return released;
  }

  return {
    patternsSha256,
    keyInfo: { keyId: keyInfo.keyId, source: keyInfo.source },
    process(chunk) {
      const buffer = carry + String(chunk ?? "");
      const cutLimit = Math.max(0, buffer.length - holdback);
      return drain(buffer, cutLimit);
    },
    flush() {
      const buffer = carry;
      carry = "";
      const released = drain(buffer, buffer.length);
      return released;
    },
    events() {
      return events.map((event) => ({ ...event }));
    },
  };
}

/** One-shot redaction over a complete string with the same pattern set. */
export function redactText(text, { patterns, previewKey = "" } = {}) {
  const redactor = createStreamingRedactor({ patterns, holdbackChars: 32, previewKey });
  const released = redactor.process(String(text ?? "")) + redactor.flush();
  return { text: released, events: redactor.events(), patternsSha256: redactor.patternsSha256, keyInfo: redactor.keyInfo };
}

/** Normalize governed redaction config into gateway defaults. */
export function normalizeRedactionPolicy(raw) {
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return { enabled: false, patterns: [] };
  const patterns = Array.isArray(raw.patterns) ? raw.patterns.map((value) => String(value || "").toLowerCase()).filter(Boolean) : [];
  return { enabled: true, patterns };
}
