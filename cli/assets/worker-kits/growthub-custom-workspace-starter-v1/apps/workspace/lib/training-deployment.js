/**
 * Training deployment — the POST-success half of the loop. Pure logic with an
 * injectable fetch (no React, no globals required, never throws). After the
 * model is built (`ollama create`) and serving locally, this captures a REAL
 * OpenAI-compatible chat-completions response from the API Registry row's
 * endpoint so the tuned-tag verification (`training-verification.js`) has real
 * evidence — never a fabricated reply.
 *
 * First principles (matches docs/CUSTOM_MODEL_TRAINING_RUNTIME_V1.md §"Strict
 * proof gates"): the API Registry row is the canonical endpoint authority; its
 * `lastResponse` is the proof; a base-model / malformed / error reply demotes.
 * This module only PRODUCES that real proof — it never asserts a pass.
 */

export const DEFAULT_PROBE_PROMPT =
  "Reply in one short line to confirm you are the tuned workspace model.";

/** OpenAI-compatible chat-completions request body for a tuned tag. */
export function buildChatProbeBody({ modelTag, prompt = DEFAULT_PROBE_PROMPT, maxTokens = 64 } = {}) {
  return {
    model: String(modelTag || "").trim(),
    messages: [{ role: "user", content: String(prompt || DEFAULT_PROBE_PROMPT) }],
    stream: false,
    max_tokens: Number(maxTokens) || 64,
  };
}

/** Resolve the full chat-completions URL from a registry row (baseUrl+endpoint). */
export function resolveChatEndpoint(registryRow) {
  const base = String(registryRow?.baseUrl || "").replace(/\/+$/, "");
  const ep = String(registryRow?.endpoint || "/chat/completions").trim();
  return `${base}${ep.startsWith("/") ? ep : `/${ep}`}`;
}

/**
 * Find the api-registry row for a custom-model integration in a workspace config.
 * Pure. Returns the row or null.
 */
export function findRegistryRow(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const o of objects) {
    if (o?.objectType !== "api-registry") continue;
    for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
      if (String(r?.integrationId || "").trim() === id) return r;
    }
  }
  return null;
}

/**
 * Call the locally-running custom model and capture the REAL response.
 * `fetchImpl` is injectable for tests/runners. Never throws — returns an
 * envelope: { ok, status, response, error }.
 */
export async function captureChatCompletion({ registryRow, modelTag, prompt, fetchImpl, headers = {}, authToken = "" } = {}) {
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return { ok: false, error: "no fetch implementation available", response: null };
  const tag = String(modelTag || registryRow?.expectedModelTag || "").trim();
  if (!tag) return { ok: false, error: "no expected model tag on the registry row", response: null };
  const url = resolveChatEndpoint(registryRow);
  if (!/^https?:\/\//.test(url)) return { ok: false, error: `registry row has no usable endpoint URL (${url})`, response: null };
  const hdrs = { "content-type": "application/json", ...headers };
  if (authToken) hdrs.authorization = `Bearer ${authToken}`;
  try {
    const res = await f(url, { method: "POST", headers: hdrs, body: JSON.stringify(buildChatProbeBody({ modelTag: tag, prompt })) });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: Boolean(res.ok), status: res.status, response: body };
  } catch (err) {
    return { ok: false, error: err?.message || "chat-completions request failed", response: null };
  }
}

/**
 * Build the governed stamp the API Registry row carries after a real test.
 * `lastResponse` is the captured body (string), which verifyTunedResponse reads.
 */
export function buildRegistryTestStamp(response, now = new Date().toISOString()) {
  const lastResponse = typeof response === "string" ? response : JSON.stringify(response ?? "");
  const served = (response && typeof response === "object" && !Array.isArray(response)) ? String(response.model || "").trim() : "";
  return { lastResponse, lastTested: String(now || new Date().toISOString()), status: served ? "connected" : "registered" };
}
