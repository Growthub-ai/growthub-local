/**
 * Parse sandbox row lastResponse / source-record run entries for trace viewer UI.
 */

import { redactSecretsFromText } from "./orchestration-graph.js";

function safeParseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseSandboxRunTrace(lastResponse) {
  const parsed = safeParseJson(lastResponse);
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "",
      runId: "",
      exitCode: null,
      durationMs: null,
      runtime: "",
      adapter: "",
      runLocality: "",
      error: "",
      stdout: "",
      stderr: "",
      output: "",
      ranAt: "",
      envRefsResolved: [],
      envRefsMissing: []
    };
  }
  const outputRaw = parsed.output ?? parsed.normalizedOutput ?? parsed.response;
  return {
    status: parsed.status || (parsed.exitCode === 0 && !parsed.error ? "connected" : parsed.error ? "failed" : ""),
    runId: String(parsed.runId || "").trim(),
    exitCode: parsed.exitCode ?? null,
    durationMs: parsed.durationMs ?? null,
    runtime: String(parsed.runtime || "").trim(),
    adapter: String(parsed.adapter || "").trim(),
    runLocality: String(parsed.runLocality || "").trim(),
    error: redactSecretsFromText(parsed.error || ""),
    stdout: redactSecretsFromText(typeof parsed.stdout === "string" ? parsed.stdout : JSON.stringify(parsed.stdout ?? "", null, 2)),
    stderr: redactSecretsFromText(parsed.stderr || ""),
    output: redactSecretsFromText(
      typeof outputRaw === "string" ? outputRaw : JSON.stringify(outputRaw ?? "", null, 2)
    ),
    ranAt: String(parsed.ranAt || "").trim(),
    envRefsResolved: Array.isArray(parsed.envRefsResolved) ? parsed.envRefsResolved : [],
    envRefsMissing: Array.isArray(parsed.envRefsMissing) ? parsed.envRefsMissing : []
  };
}

function normalizeRunRecord(record) {
  if (!record || typeof record !== "object") return null;
  const outputRaw = record.output ?? record.normalizedOutput ?? record.response;
  const outputText = typeof outputRaw === "string"
    ? outputRaw
    : outputRaw != null
      ? JSON.stringify(outputRaw, null, 2)
      : "";
  return {
    runId: String(record.runId || "").trim(),
    ranAt: String(record.ranAt || "").trim(),
    exitCode: record.exitCode ?? null,
    durationMs: record.durationMs ?? null,
    error: redactSecretsFromText(record.error || ""),
    stdout: redactSecretsFromText(typeof record.stdout === "string" ? record.stdout : ""),
    stderr: redactSecretsFromText(record.stderr || ""),
    output: redactSecretsFromText(outputText),
    runtime: String(record.runtime || "").trim(),
    adapter: String(record.adapter || "").trim(),
    runLocality: String(record.runLocality || "").trim(),
    status: String(record.status || "").trim(),
    envRefsResolved: Array.isArray(record.envRefsResolved) ? record.envRefsResolved : [],
    envRefsMissing: Array.isArray(record.envRefsMissing) ? record.envRefsMissing : [],
    adapterMeta: record.adapterMeta && typeof record.adapterMeta === "object" ? record.adapterMeta : null,
    templateTrace: record.templateTrace && typeof record.templateTrace === "object" ? record.templateTrace : null,
    lifecycleStatus: String(record.lifecycleStatus || "").trim(),
    version: String(record.version || "").trim()
  };
}

export { parseSandboxRunTrace, normalizeRunRecord, safeParseJson };
