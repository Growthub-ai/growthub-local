/**
 * Pure utilities for the sandbox agent auth helper.
 *
 * Extracted so the constants and the redaction function can be imported
 * without pulling in Next.js path-aliased modules (`@/lib/workspace-config`
 * etc.). Tests load this file directly to verify the runtime behaviour of
 * the redaction and status taxonomy.
 *
 * No Next-aliased imports. No node-only APIs. Safe to ship in any runtime.
 */

const KNOWN_AGENT_AUTH_STATUSES = Object.freeze([
  "active",     // confirmed authenticated (login exit 0, or `auth status` exit 0)
  "reachable",  // CLI installed and callable, but auth NOT yet confirmed
  "stale",      // CLI reachable but auth-shaped failure detected
  "missing",    // binary not found on PATH
  "checking",   // transient UI state during a probe
  "unknown"     // indeterminate
]);

const SAFE_ROW_PATCH_FIELDS = Object.freeze([
  "agentAuthStatus",
  "agentAuthProvider",
  "agentAuthLastChecked",
  "agentAuthLastExitCode",
  "agentAuthLastMessage",
  "agentAuthLastLoginUrl"
]);

const TOKEN_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi
];

const TOKEN_PREFIX_PATTERNS = [
  /(access[_-]?token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(refresh[_-]?token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(oauth[_-]?token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(session[_-]?(?:key|token)["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(api[_-]?key["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(password["']?\s*[:=]\s*)["']?[^\s"',}]+/gi
];

function redactSecrets(text) {
  if (typeof text !== "string" || !text) return "";
  let next = text;
  for (const pattern of TOKEN_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  for (const pattern of TOKEN_PREFIX_PATTERNS) {
    next = next.replace(pattern, "$1[redacted]");
  }
  return next;
}

export {
  KNOWN_AGENT_AUTH_STATUSES,
  SAFE_ROW_PATCH_FIELDS,
  TOKEN_PATTERNS,
  TOKEN_PREFIX_PATTERNS,
  redactSecrets
};
