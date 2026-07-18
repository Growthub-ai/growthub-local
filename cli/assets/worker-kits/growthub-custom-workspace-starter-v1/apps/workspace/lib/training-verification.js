/**
 * Training verification — the pure proof gate between `deployed` and
 * `verified`. No React, no fetch, no fs. Mirrors the bond/validation
 * semantics already in training-ledger.js (one truth) but exposes them as
 * a reusable, individually-tested verifier so the Training Runtime modal,
 * the runtime drivers, and the ledger all demote identically.
 *
 * The invariant: a registered endpoint is only `verified` when its
 * response body carries the EXPECTED tuned model tag. A base-model
 * response, a malformed body, an error envelope, or a missing `model`
 * field all DEMOTE — never silently pass. There is no fake proof.
 */

/**
 * Verify a single chat-completion response against the expected tuned tag.
 *
 * @param {object} input
 * @param {string} input.expectedTag - the tuned model tag the run reserved
 * @param {string} [input.baseModel] - the base the tune started from (demotes if served)
 * @param {object|string|null} [input.responseBody] - the captured response (object or JSON string)
 * @returns {{ verified: boolean, reason: string, demotion: ""|"base-model"|"malformed"|"error"|"missing"|"mismatch"|"no-expected-tag", servedModel: string, snippet: string }}
 */
export function verifyTunedResponse({ expectedTag = "", baseModel = "", responseBody = null } = {}) {
  const expected = String(expectedTag || "").trim();
  if (!expected) {
    return { verified: false, reason: "no expected tuned tag reserved", demotion: "no-expected-tag", servedModel: "", snippet: "" };
  }

  let body = responseBody;
  if (typeof body === "string") {
    if (!body.trim()) return { verified: false, reason: "empty response body", demotion: "malformed", servedModel: "", snippet: "" };
    try {
      body = JSON.parse(body);
    } catch {
      return { verified: false, reason: "response body is not valid JSON", demotion: "malformed", servedModel: "", snippet: "" };
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { verified: false, reason: "response body is not an object", demotion: "malformed", servedModel: "", snippet: "" };
  }
  if (body.error) {
    return { verified: false, reason: `endpoint returned an error: ${String(body.error?.message || body.error).slice(0, 120)}`, demotion: "error", servedModel: "", snippet: "" };
  }

  const servedModel = String(body.model || "").trim();
  const content = body?.choices?.[0]?.message?.content;
  const snippet = typeof content === "string" ? content.slice(0, 160) : "";

  if (!servedModel) {
    return { verified: false, reason: "response carries no `model` field — cannot prove the tuned weights served it", demotion: "missing", servedModel: "", snippet };
  }
  if (baseModel && servedModel === String(baseModel).trim()) {
    return { verified: false, reason: `response served the base model (${servedModel}), not the tuned tag (${expected})`, demotion: "base-model", servedModel, snippet };
  }
  if (servedModel !== expected) {
    return { verified: false, reason: `response model (${servedModel}) does not match the expected tuned tag (${expected})`, demotion: "mismatch", servedModel, snippet };
  }
  return { verified: true, reason: `verified: response model tag matches ${expected} — tuned weights, not the base`, demotion: "", servedModel, snippet };
}

/**
 * Derive endpoint verification straight from an api-registry row's stamped
 * lastResponse. Pure convenience over verifyTunedResponse for the ledger /
 * driver path, where the response is already persisted as a string.
 */
export function deriveEndpointVerification({ registryRow, expectedTag, baseModel = "" } = {}) {
  if (!registryRow) return { verified: false, reason: "no registry row", demotion: "missing", servedModel: "", snippet: "", testedAt: "" };
  const result = verifyTunedResponse({ expectedTag, baseModel, responseBody: registryRow.lastResponse ?? null });
  return { ...result, testedAt: String(registryRow.lastTested || "") };
}
