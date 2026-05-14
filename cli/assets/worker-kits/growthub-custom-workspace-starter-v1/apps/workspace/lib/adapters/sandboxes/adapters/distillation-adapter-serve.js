/**
 * Distillation adapter serving drop-zone.
 *
 * Serves a trained LoRA adapter through the existing sandbox-environment
 * execution plane without merging weights or exposing credentials to the
 * browser. The sandbox-run route resolves envRefs server-side and persists
 * stdout/stderr into growthub.source-records.json.
 */

import { Buffer } from "node:buffer";
import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";

const MAX_OUT = 256 * 1024;

function clamp(buffer) {
  if (buffer.length <= MAX_OUT) return buffer.toString("utf8");
  return `${buffer.slice(0, MAX_OUT).toString("utf8")}\n...\n[truncated]`;
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "vllm" || mode === "custom-openai-compatible") return mode;
  return "ollama";
}

function resolveChatCompletionsUrl(mode, explicitEndpoint) {
  const endpoint = String(explicitEndpoint || "").trim();
  if (endpoint && /^https?:\/\//i.test(endpoint)) {
    if (endpoint.includes("/chat/completions")) return endpoint.replace(/\/+$/, "");
    return `${endpoint.replace(/\/+$/, "")}/chat/completions`;
  }

  if (mode === "vllm") {
    const base = String(process.env.VLLM_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("VLLM_BASE_URL or localEndpoint is required for distillation-adapter-serve vllm mode");
    return `${base}/chat/completions`;
  }

  if (mode === "custom-openai-compatible") {
    throw new Error("localEndpoint is required for distillation-adapter-serve custom-openai-compatible mode");
  }

  const base = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1").trim().replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

function pickBearerToken(env) {
  const keys = [
    "OPENAI_API_KEY",
    "VLLM_API_KEY",
    "OLLAMA_API_KEY",
    "DISTILLATION_ADAPTER_API_KEY",
    "API_KEY",
  ];
  for (const key of keys) {
    if (typeof env?.[key] === "string" && env[key].trim()) return env[key].trim();
  }
  return "";
}

function buildMessages(request) {
  const command = String(request.command || "").trim();
  const system = [
    "You are a Growthub Local distilled adapter served through AWaC sandbox-environment.",
    "Use the adapter's learned workspace behavior. Return the final answer only unless the prompt explicitly asks for structured output.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: command },
  ];
}

async function run(request) {
  const started = Date.now();
  const mode = normalizeMode(request?.adapterMode || request?.intelligenceSandbox?.intelligenceAdapterMode);
  const endpoint = resolveChatCompletionsUrl(
    mode,
    request?.localEndpoint || request?.intelligenceSandbox?.localEndpoint || process.env.DISTILLATION_ADAPTER_BASE_URL
  );
  const model = String(
    request?.localModel
      || request?.intelligenceSandbox?.localModel
      || process.env.DISTILLATION_ADAPTER_MODEL
      || process.env.OLLAMA_MODEL
      || ""
  ).trim();

  if (!model) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: "localModel or DISTILLATION_ADAPTER_MODEL is required for distillation-adapter-serve",
      adapterMeta: { adapter: "distillation-adapter-serve", mode, endpoint },
    };
  }

  const body = {
    model,
    messages: buildMessages(request),
    temperature: Number.isFinite(Number(process.env.DISTILLATION_ADAPTER_TEMPERATURE))
      ? Number(process.env.DISTILLATION_ADAPTER_TEMPERATURE)
      : 0.2,
    stream: false,
  };

  const token = pickBearerToken(request.env || {});
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  const timeoutMs = Number(request.timeoutMs) > 0 ? Math.min(Number(request.timeoutMs), 600000) : 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = clamp(Buffer.from(await res.arrayBuffer()));
    const durationMs = Date.now() - started;

    if (!res.ok) {
      return {
        ok: false,
        exitCode: 1,
        durationMs,
        stdout: text,
        stderr: "",
        error: `distillation adapter HTTP ${res.status}`,
        adapterMeta: { adapter: "distillation-adapter-serve", mode, endpoint, model },
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const content = parsed?.choices?.[0]?.message?.content;
    const stdout = typeof content === "string" && content.trim() ? content.trim() : text;

    return {
      ok: true,
      exitCode: 0,
      durationMs,
      stdout,
      stderr: "",
      adapterMeta: {
        adapter: "distillation-adapter-serve",
        mode,
        endpoint,
        model,
        credentials: token ? "server-resolved-env-ref" : "none",
      },
    };
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: clamp(Buffer.from(String(err?.message || err), "utf8")),
      error: err?.name === "AbortError" ? `timed out after ${timeoutMs}ms` : err?.message || "fetch failed",
      adapterMeta: { adapter: "distillation-adapter-serve", mode, endpoint, model },
    };
  } finally {
    clearTimeout(timer);
  }
}

registerSandboxAdapter({
  id: "distillation-adapter-serve",
  label: "Distillation adapter serve",
  description: "Calls an adapter-only Ollama, vLLM, or OpenAI-compatible chat endpoint from a governed sandbox row. No weight merge step.",
  locality: "local",
  supportedRuntimes: [],
  run,
});
