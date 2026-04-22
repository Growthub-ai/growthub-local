/**
 * MiniMax-M1 — Contract Types
 *
 * Stable types for the MiniMax-M1 local intelligence primitive.
 *
 * MiniMax-M1 (https://huggingface.co/MiniMaxAI) is a 456B-total /
 * 45.9B-active MoE reasoning model with native 1M-token context and
 * strong agentic tool-use. Unlike Qwen Code / T3 Code, it is not shipped
 * as a coding CLI binary — it is a model served over an
 * OpenAI-compatible HTTP endpoint (vLLM is the reference serving stack).
 *
 * Integration strategy:
 *   - No npm dependency on minimax SDKs — HTTP fetch against /v1
 *   - Health detection via GET {baseUrl}/v1/models
 *   - Headless generation via POST {baseUrl}/v1/chat/completions
 *   - Server lifecycle is out of scope: the adapter emits a copy-pasteable
 *     `vllm serve` command rather than spawning multi-GPU workloads itself
 *
 * Guardrails:
 *   - Endpoint and model id are user-configurable (no auto-spawn)
 *   - API keys stored via the harness auth store (same primitive as qwen-code)
 *   - Thinking-budget variant gating (40k vs 80k) surfaces in config
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type MiniMaxM1Variant = "40k" | "80k";

export const MINIMAX_M1_VARIANTS: readonly MiniMaxM1Variant[] = ["40k", "80k"] as const;

export interface MiniMaxM1Config {
  /** Base URL of an OpenAI-compatible server (e.g. vLLM) serving MiniMax-M1 */
  baseUrl: string;
  /** Model id as registered by the serving backend */
  model: string;
  /** Thinking budget variant — controls which MiniMax-M1 weights are expected */
  variant: MiniMaxM1Variant;
  /** Working directory for governed chat sessions */
  cwd: string;
  /** Max output tokens (0 = server default) */
  maxOutputTokens: number;
  /** Temperature (MiniMax recommends 1.0) */
  temperature: number;
  /** Top-p (MiniMax recommends 0.95) */
  topP: number;
  /** Timeout in milliseconds for headless generation */
  timeoutMs: number;
  /** Tensor-parallel size recommended in setup guidance (UI-only hint) */
  tensorParallel: number;
  /** Max model length suggested in setup guidance (UI-only hint; 1M context) */
  maxModelLen: number;
  /** Extra headers forwarded on every request (e.g. Authorization) */
  env: Record<string, string>;
}

export const MINIMAX_M1_SUPPORTED_ENV_KEYS = [
  "MINIMAX_API_KEY",
  "OPENAI_API_KEY",
] as const;

export type MiniMaxM1SupportedEnvKey = typeof MINIMAX_M1_SUPPORTED_ENV_KEYS[number];

export const DEFAULT_MINIMAX_M1_CONFIG: MiniMaxM1Config = {
  baseUrl: "http://127.0.0.1:8000",
  model: "MiniMaxAI/MiniMax-M1-80k",
  variant: "80k",
  cwd: process.cwd(),
  maxOutputTokens: 0,
  temperature: 1.0,
  topP: 0.95,
  timeoutMs: 180_000,
  tensorParallel: 8,
  maxModelLen: 1_048_576,
  env: {},
};

// ---------------------------------------------------------------------------
// Environment detection result
// ---------------------------------------------------------------------------

export interface MiniMaxM1EnvironmentStatus {
  /** Whether the OpenAI-compatible server responded at baseUrl */
  serverReachable: boolean;
  /** Resolved base URL that was probed */
  baseUrl: string;
  /** Whether the configured model id appears in /v1/models */
  modelAvailable: boolean;
  /** Raw list of model ids reported by the server (may be empty on failure) */
  modelsReported: string[];
  /** Whether an API key (MINIMAX_API_KEY or OPENAI_API_KEY) is configured */
  apiKeyConfigured: boolean;
  /** Whether the `vllm` binary is present on PATH (for local serving guidance) */
  vllmBinaryFound: boolean;
  /** OS label for setup guidance */
  osLabel: string;
  /** Last error message if the probe failed */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Headless execution result
// ---------------------------------------------------------------------------

export interface MiniMaxM1ExecutionResult {
  /** HTTP-style outcome: 0 on success, non-zero mirrors process exitCode shape */
  exitCode: number | null;
  /** Whether the request timed out */
  timedOut: boolean;
  /** Assistant message content (best-effort extraction) */
  stdout: string;
  /** Error detail if the call failed */
  stderr: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Token usage if reported by the server */
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

// ---------------------------------------------------------------------------
// Health check result
// ---------------------------------------------------------------------------

export interface MiniMaxM1HealthResult {
  status: "available" | "degraded" | "unavailable";
  environment: MiniMaxM1EnvironmentStatus;
  summary: string;
}
