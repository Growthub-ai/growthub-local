/**
 * MiniMax-M1 — Provider / HTTP Adapter
 *
 * Thin adapter that calls an OpenAI-compatible /v1/chat/completions endpoint
 * (vLLM reference stack) serving MiniMax-M1. No SDK dependency — uses Node's
 * built-in fetch.
 *
 * Server lifecycle is explicitly out of scope: multi-GPU serving is not
 * something a local CLI hub should spawn silently. Use `buildServeCommand()`
 * to print a copy-pasteable `vllm serve` invocation.
 */

import { spawnSync } from "node:child_process";
import type {
  MiniMaxM1Config,
  MiniMaxM1ExecutionResult,
} from "./contract.js";
import { DEFAULT_MINIMAX_M1_CONFIG } from "./contract.js";

// ---------------------------------------------------------------------------
// Headless generation
// ---------------------------------------------------------------------------

export async function executeHeadlessPrompt(
  prompt: string,
  configOverride?: Partial<MiniMaxM1Config>,
): Promise<MiniMaxM1ExecutionResult> {
  const config = { ...DEFAULT_MINIMAX_M1_CONFIG, ...configOverride };
  const startMs = Date.now();

  const url = joinUrl(config.baseUrl, "/v1/chat/completions");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(config.env),
  };
  for (const [k, v] of Object.entries(config.env)) {
    if (k.toLowerCase().startsWith("x-") || k === "Authorization") headers[k] = v;
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    temperature: config.temperature,
    top_p: config.topP,
    stream: false,
  };
  if (config.maxOutputTokens > 0) body.max_tokens = config.maxOutputTokens;

  const controller = new AbortController();
  const timeoutHandle = config.timeoutMs > 0
    ? setTimeout(() => controller.abort(), config.timeoutMs)
    : null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (!response.ok) {
      return {
        exitCode: response.status,
        timedOut: false,
        stdout: "",
        stderr: `${response.status} ${response.statusText}: ${text.slice(0, 2000)}`,
        durationMs: Date.now() - startMs,
        usage: emptyUsage(),
      };
    }

    const parsed = safeParseJson(text);
    const message = extractAssistantMessage(parsed);
    const usage = extractUsage(parsed);

    return {
      exitCode: 0,
      timedOut: false,
      stdout: message,
      stderr: "",
      durationMs: Date.now() - startMs,
      usage,
    };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const aborted = (err as { name?: string }).name === "AbortError";
    return {
      exitCode: aborted ? 124 : 1,
      timedOut: aborted,
      stdout: "",
      stderr: (err as Error).message ?? "fetch error",
      durationMs: Date.now() - startMs,
      usage: emptyUsage(),
    };
  }
}

// ---------------------------------------------------------------------------
// Server reachability probe (used by health checks)
// ---------------------------------------------------------------------------

export async function probeServer(
  baseUrl: string,
  env: Record<string, string> = {},
  timeoutMs = 4_000,
): Promise<{ reachable: boolean; modelsReported: string[]; error: string | null }> {
  const url = joinUrl(baseUrl, "/v1/models");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildAuthHeaders(env),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!response.ok) {
      return { reachable: false, modelsReported: [], error: `${response.status} ${response.statusText}` };
    }
    const parsed = safeParseJson(await response.text());
    const modelsReported = extractModelIds(parsed);
    return { reachable: true, modelsReported, error: null };
  } catch (err) {
    clearTimeout(t);
    return { reachable: false, modelsReported: [], error: (err as Error).message ?? "probe failed" };
  }
}

// ---------------------------------------------------------------------------
// vLLM binary detection (for setup guidance only)
// ---------------------------------------------------------------------------

export function detectVllmBinary(): boolean {
  try {
    const result = spawnSync("vllm", ["--version"], {
      timeout: 5_000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Copy-pasteable `vllm serve` command builder
// ---------------------------------------------------------------------------

export function buildServeCommand(configOverride?: Partial<MiniMaxM1Config>): string {
  const config = { ...DEFAULT_MINIMAX_M1_CONFIG, ...configOverride };
  const port = extractPort(config.baseUrl) ?? 8000;
  const parts = [
    "vllm serve",
    config.model,
    `--tensor-parallel-size ${config.tensorParallel}`,
    `--port ${port}`,
    `--max-model-len ${config.maxModelLen}`,
    "--enable-auto-tool-choice",
    "--tool-call-parser hermes",
  ];
  return parts.join(" \\\n  ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

function buildAuthHeaders(env: Record<string, string>): Record<string, string> {
  const key = env.MINIMAX_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

function extractAssistantMessage(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === "string" ? content : "";
}

function extractUsage(parsed: unknown): MiniMaxM1ExecutionResult["usage"] {
  const usage = (parsed as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== "object") return emptyUsage();
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
  };
}

function emptyUsage(): MiniMaxM1ExecutionResult["usage"] {
  return { promptTokens: null, completionTokens: null, totalTokens: null };
}

function extractModelIds(parsed: unknown): string[] {
  const data = (parsed as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => (entry && typeof entry === "object" ? (entry as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === "string");
}

function extractPort(baseUrl: string): number | null {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.port) return Number.parseInt(parsed.port, 10);
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
    return null;
  } catch {
    return null;
  }
}
