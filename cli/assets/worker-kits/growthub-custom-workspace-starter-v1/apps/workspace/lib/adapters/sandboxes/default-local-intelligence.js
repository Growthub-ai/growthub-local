/**
 * Sandbox adapter — governed local OpenAI-compatible inference (JSON-only).
 *
 * Uses the same mental model as Growthub Local Intelligence: chat-completions
 * transport, normalized JSON envelope on stdout. Tool intents are proposals
 * only — this adapter performs no tool execution and never resolves env secrets
 * beyond what the sandbox-run route already placed on `request.env`.
 */

import { Buffer } from "node:buffer";
import { registerSandboxAdapter } from "./sandbox-adapter-registry.js";

const MAX_OUT = 256 * 1024;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function clampStream(buffer) {
  if (buffer.length <= MAX_OUT) return buffer.toString("utf8");
  return `${buffer.slice(0, MAX_OUT).toString("utf8")}\n…\n[truncated]`;
}

function resolveChatCompletionsUrl(mode, explicit) {
  const e = String(explicit || "").trim();
  if (e && /^https?:\/\//i.test(e)) {
    if (e.includes("/chat/completions")) return e.replace(/\/+$/, "");
    return `${e.replace(/\/+$/, "")}/chat/completions`;
  }
  const m = String(mode || "ollama").toLowerCase();
  if (m === "custom-openai-compatible") {
    if (!e) throw new Error("localEndpoint (full chat completions URL) is required for custom-openai-compatible mode");
    if (e.includes("/chat/completions")) return e.replace(/\/+$/, "");
    return `${e.replace(/\/+$/, "")}/chat/completions`;
  }
  const ollamaBase = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  if (m === "lmstudio") {
    const b = (process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1").replace(/\/$/, "");
    return `${b}/chat/completions`;
  }
  if (m === "vllm") {
    const b = String(process.env.VLLM_BASE_URL || "").trim().replace(/\/$/, "");
    if (!b) throw new Error("VLLM_BASE_URL is required for vllm intelligenceAdapterMode");
    return `${b}/chat/completions`;
  }
  return `${ollamaBase}/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "You are Growthub workspace sandbox local intelligence.",
    "Reply with a single JSON object only, matching:",
    "{\"text\":string optional,\"json\":object optional,\"toolIntents\":[],\"warnings\":[],\"confidence\":number}",
    "toolIntents are proposals only — never claim execution or access to secrets.",
  ].join("\n");
}

function resolveOpenAiApiKey() {
  const key = String(process.env.OPENAI_API_KEY || process.env.OPENAI || "").trim();
  return key || null;
}

function extractResponsesText(outer) {
  if (!outer || typeof outer !== "object") return "";
  if (typeof outer.output_text === "string" && outer.output_text.trim()) {
    return outer.output_text.trim();
  }
  const output = Array.isArray(outer.output) ? outer.output : [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function parseModelJsonContent(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { text, warnings: ["model completion was not valid JSON"], toolIntents: [], confidence: 0 };
  }
}

function buildSandboxEnvelope({ request, box, model, endpoint, mode, parsed, rawText, durationMs }) {
  return {
    ok: true,
    exitCode: 0,
    durationMs,
    stdout: JSON.stringify({
      version: "growthub-local-model-sandbox-v1",
      taskId: request.runId,
      businessObjectType: "sandbox-environment",
      adapter: {
        kind: "local-intelligence",
        mode,
        modelId: model,
        endpoint,
      },
      result: {
        text: typeof parsed.text === "string" ? parsed.text : undefined,
        json: parsed.json && typeof parsed.json === "object" ? parsed.json : undefined,
        toolIntents: Array.isArray(parsed.toolIntents) ? parsed.toolIntents : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      },
      rawText,
      latencyMs: durationMs,
      createdAt: new Date().toISOString(),
    }, null, 2),
    stderr: "",
    adapterMeta: {
      adapter: "local-intelligence",
      endpoint,
      model,
      locality: mode === "openai-responses" ? "server" : "local",
    },
  };
}

async function runOpenAiResponses(request, box, started) {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error:
        "OpenAI API key is not configured on the server. Set OPENAI_API_KEY or OPENAI in the environment where the workspace app runs.",
      adapterMeta: { adapter: "local-intelligence", mode: "openai-responses" },
    };
  }

  const endpoint = String(box.localEndpoint || "").trim() || OPENAI_RESPONSES_URL;
  const model = String(box.localModel || "").trim() || "gpt-5.2";
  const explicitMessages = Array.isArray(box.messages)
    ? box.messages.filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    : null;
  const input = explicitMessages && explicitMessages.length > 0
    ? explicitMessages
    : [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: box.userIntent },
      ];

  const body = {
    model,
    input,
    text: { format: { type: "json_object" } },
    store: false,
  };

  const controller = new AbortController();
  const ms = Number(request.timeoutMs) > 0 ? Math.min(Number(request.timeoutMs), 600000) : 90000;
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = clampStream(buf);
    const durationMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        exitCode: 1,
        durationMs,
        stdout: "",
        stderr: "",
        error: `OpenAI Responses HTTP ${res.status}`,
        adapterMeta: { adapter: "local-intelligence", endpoint, model, mode: "openai-responses" },
      };
    }

    let outer;
    try {
      outer = JSON.parse(text);
    } catch {
      outer = null;
    }
    const innerText = extractResponsesText(outer) || text;
    const parsed = parseModelJsonContent(innerText);
    return buildSandboxEnvelope({
      request,
      box,
      model,
      endpoint,
      mode: "openai-responses",
      parsed,
      rawText: text,
      durationMs,
    });
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: clampStream(Buffer.from(String(err.message || err), "utf8")),
      error: err.name === "AbortError" ? `timed out after ${ms}ms` : err.message || "fetch failed",
      adapterMeta: { adapter: "local-intelligence", endpoint, model, mode: "openai-responses" },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function run(request) {
  const started = Date.now();
  const box = request.intelligenceSandbox;
  if (!box || typeof box.userIntent !== "string") {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: "intelligenceSandbox.userIntent is required for local-intelligence adapter",
      adapterMeta: { adapter: "local-intelligence" },
    };
  }

  const adapterMode = String(box.intelligenceAdapterMode || "ollama").trim().toLowerCase();
  if (adapterMode === "openai-responses") {
    return runOpenAiResponses(request, box, started);
  }

  let endpoint;
  try {
    endpoint = resolveChatCompletionsUrl(box.intelligenceAdapterMode, box.localEndpoint);
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: err.message || String(err),
      adapterMeta: { adapter: "local-intelligence" },
    };
  }

  const model =
    String(box.localModel || "").trim()
    || String(process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL || process.env.OLLAMA_MODEL || "").trim()
    || "gemma3:4b";

  // Two calling modes (both governed, both JSON-only):
  // 1. Legacy single-turn: caller passes `userIntent` and gets the canonical
  //    workspace-sandbox system prompt + one user message.
  // 2. Structured chat: caller passes `messages: [{role, content}, ...]` and
  //    the adapter forwards the full conversation to the OpenAI-compatible
  //    chat completions endpoint. This is what the workspace helper uses to
  //    carry thread context across turns so the local model can resume work
  //    inside one conversation. The caller is responsible for keeping the
  //    leading system message stable across turns (KV-cache friendly).
  const explicitMessages = Array.isArray(box.messages)
    ? box.messages.filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    : null;
  const messages = explicitMessages && explicitMessages.length > 0
    ? explicitMessages
    : [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: box.userIntent },
      ];
  const body = {
    model,
    messages,
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const ms = Number(request.timeoutMs) > 0 ? Math.min(Number(request.timeoutMs), 600000) : 60000;
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = clampStream(buf);
    const durationMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        exitCode: 1,
        durationMs,
        stdout: text,
        stderr: "",
        error: `local model HTTP ${res.status}`,
        adapterMeta: { adapter: "local-intelligence", endpoint, model },
      };
    }

    let parsed;
    let outer;
    try {
      outer = JSON.parse(text);
    } catch {
      outer = null;
    }
    if (outer && Array.isArray(outer.choices) && outer.choices[0]?.message?.content) {
      const inner = String(outer.choices[0].message.content || "").trim();
      try {
        parsed = JSON.parse(inner);
      } catch {
        parsed = { text: inner, warnings: ["model completion was not valid JSON"], toolIntents: [], confidence: 0 };
      }
    } else if (outer && typeof outer === "object") {
      parsed = outer;
    } else {
      parsed = { text, warnings: ["invalid JSON from model"], toolIntents: [], confidence: 0 };
    }

    return buildSandboxEnvelope({
      request,
      box,
      model,
      endpoint,
      mode: box.intelligenceAdapterMode || "ollama",
      parsed,
      rawText: text,
      durationMs,
    });
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: clampStream(Buffer.from(String(err.message || err), "utf8")),
      error: err.name === "AbortError" ? `timed out after ${ms}ms` : err.message || "fetch failed",
      adapterMeta: { adapter: "local-intelligence", endpoint, model },
    };
  } finally {
    clearTimeout(timer);
  }
}

registerSandboxAdapter({
  id: "local-intelligence",
  label: "Local intelligence (OpenAI-compatible)",
  description:
    "Calls local Ollama / LM Studio / vLLM Chat Completions or server-side OpenAI Responses with JSON-only output. Tool intents are proposals — not executed here.",
  locality: "local",
  supportedRuntimes: [],
  run,
});
