/**
 * Native Intelligence — Provider / Backend Adapter
 *
 * Thin adapter to the actual model backend. V1 supports:
 *   - Local Gemma endpoint (OpenAI-compatible API)
 *   - Hosted internal model endpoint
 *   - Easy swap later (custom fine-tuned, different model families)
 *
 * The rest of the system does not care whether the backend is:
 *   - local Gemma 3n
 *   - hosted Gemma 3
 *   - CodeGemma
 *   - a future custom fine-tuned model
 */

import type {
  NativeIntelligenceBackend,
  NativeIntelligenceConfig,
  IntelligenceProviderType,
  ModelCompletionInput,
  ModelCompletionResult,
} from "./contract.js";
import { getLocalModelVariant, inferFamilyFromModelId } from "./model-catalog.js";

// ---------------------------------------------------------------------------
// OpenAI-compatible response shape (local Gemma / vLLM / Ollama / etc.)
// ---------------------------------------------------------------------------

interface OpenAICompatibleResponse {
  id?: string;
  choices?: Array<{
    message?: { content?: string };
    text?: string;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

// ---------------------------------------------------------------------------
// Anthropic Messages API response shape
// ---------------------------------------------------------------------------

interface AnthropicResponse {
  id?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  stop_reason?: string;
}

// ---------------------------------------------------------------------------
// Gemini API response shape
// ---------------------------------------------------------------------------

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}

// ---------------------------------------------------------------------------
// Provider-specific backends
// ---------------------------------------------------------------------------

function resolveProviderType(config: NativeIntelligenceConfig): IntelligenceProviderType {
  if (config.providerType) return config.providerType;
  if (config.backendType === "local") return "local";
  return "local";
}

function createClaudeBackend(config: NativeIntelligenceConfig): NativeIntelligenceBackend {
  return {
    async complete(input: ModelCompletionInput): Promise<ModelCompletionResult> {
      const startMs = Date.now();
      const model = config.providerModelId ?? "claude-sonnet-4-6";
      const endpoint = config.endpoint || "https://api.anthropic.com/v1/messages";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096,
            system: input.systemPrompt,
            messages: [{ role: "user", content: input.userPrompt }],
            ...(input.temperature !== undefined || config.defaultTemperature !== undefined
              ? { temperature: input.temperature ?? config.defaultTemperature ?? 0.3 }
              : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new NativeIntelligenceBackendError(
            response.status,
            `Anthropic API responded with ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const result = (await response.json()) as AnthropicResponse;
        const text = result.content?.find((c) => c.type === "text")?.text ?? "";

        return {
          text,
          usage: result.usage
            ? {
                promptTokens: result.usage.input_tokens ?? 0,
                completionTokens: result.usage.output_tokens ?? 0,
                totalTokens: (result.usage.input_tokens ?? 0) + (result.usage.output_tokens ?? 0),
              }
            : undefined,
          modelId: result.model ?? model,
          latencyMs: Date.now() - startMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function createGeminiBackend(config: NativeIntelligenceConfig): NativeIntelligenceBackend {
  return {
    async complete(input: ModelCompletionInput): Promise<ModelCompletionResult> {
      const startMs = Date.now();
      const model = config.providerModelId ?? "gemini-2.5-flash";
      const baseEndpoint = config.endpoint || "https://generativelanguage.googleapis.com/v1beta";
      const endpoint = `${baseEndpoint}/models/${model}:generateContent?key=${config.apiKey ?? ""}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
            generationConfig: {
              temperature: input.temperature ?? config.defaultTemperature ?? 0.3,
              maxOutputTokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096,
              ...(input.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new NativeIntelligenceBackendError(
            response.status,
            `Gemini API responded with ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const result = (await response.json()) as GeminiResponse;
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        return {
          text,
          usage: result.usageMetadata
            ? {
                promptTokens: result.usageMetadata.promptTokenCount ?? 0,
                completionTokens: result.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: result.usageMetadata.totalTokenCount ?? 0,
              }
            : undefined,
          modelId: result.modelVersion ?? model,
          latencyMs: Date.now() - startMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function createOpenRouterBackend(config: NativeIntelligenceConfig): NativeIntelligenceBackend {
  return {
    async complete(input: ModelCompletionInput): Promise<ModelCompletionResult> {
      const startMs = Date.now();
      const model = config.providerModelId ?? "meta-llama/llama-4-maverick";
      const endpoint = config.endpoint || "https://openrouter.ai/api/v1/chat/completions";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

      try {
        const body: Record<string, unknown> = {
          model,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: input.userPrompt },
          ],
          temperature: input.temperature ?? config.defaultTemperature ?? 0.3,
          max_tokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096,
        };
        if (input.responseFormat === "json") {
          body.response_format = { type: "json_object" };
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey ?? ""}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new NativeIntelligenceBackendError(
            response.status,
            `OpenRouter API responded with ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const result = (await response.json()) as OpenAICompatibleResponse;
        return {
          text: extractCompletionText(result),
          usage: result.usage
            ? {
                promptTokens: result.usage.prompt_tokens ?? 0,
                completionTokens: result.usage.completion_tokens ?? 0,
                totalTokens: result.usage.total_tokens ?? 0,
              }
            : undefined,
          modelId: result.model ?? model,
          latencyMs: Date.now() - startMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Backend creation (unified entry point)
// ---------------------------------------------------------------------------

export function createNativeIntelligenceBackend(
  config: NativeIntelligenceConfig,
): NativeIntelligenceBackend {
  const providerType = resolveProviderType(config);

  if (providerType === "claude") return createClaudeBackend(config);
  if (providerType === "gemini") return createGeminiBackend(config);
  if (providerType === "openrouter") return createOpenRouterBackend(config);
  // "openai" and "local" both use the OpenAI-compatible path below

  return {
    async complete(input: ModelCompletionInput): Promise<ModelCompletionResult> {
      const startMs = Date.now();

      const messages = [
        { role: "system" as const, content: input.systemPrompt },
        { role: "user" as const, content: input.userPrompt },
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 30_000,
      );

      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
        };

        if (config.apiKey) {
          headers.authorization = `Bearer ${config.apiKey}`;
        }

        const modelCandidates = resolveModelCandidates(config);
        const endpointCandidates = resolveEndpointCandidates(config);
        let result: OpenAICompatibleResponse | null = null;
        let lastError: NativeIntelligenceBackendError | null = null;

        for (let endpointIndex = 0; endpointIndex < endpointCandidates.length; endpointIndex += 1) {
          const endpoint = endpointCandidates[endpointIndex];
          for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
            const model = modelCandidates[modelIndex];
            const body: Record<string, unknown> = {
              model,
              messages,
              temperature: input.temperature ?? config.defaultTemperature ?? 0.3,
              max_tokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096,
            };

            if (input.responseFormat === "json") {
              body.response_format = { type: "json_object" };
            }

            try {
              const response = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
              });

              if (response.ok) {
                result = (await response.json()) as OpenAICompatibleResponse;
                break;
              }

              const errorText = await response.text().catch(() => "");
              const backendError = new NativeIntelligenceBackendError(
                response.status,
                `Model backend responded with ${response.status}: ${errorText || response.statusText}`,
              );
              lastError = backendError;

              if (!shouldTryNextModel(response.status, errorText, model, config, modelCandidates)) {
                throw backendError;
              }
            } catch (err) {
              if (err instanceof NativeIntelligenceBackendError) {
                throw err;
              }
              lastError = new NativeIntelligenceBackendError(
                502,
                err instanceof Error ? err.message : "Unknown backend error",
              );
              const hasAnotherEndpoint = endpointIndex < endpointCandidates.length - 1;
              if (!hasAnotherEndpoint) {
                throw lastError;
              }
              break;
            }
          }
          if (result) break;
        }

        if (!result) {
          throw lastError ?? new NativeIntelligenceBackendError(502, "Model backend returned no response.");
        }

        const latencyMs = Date.now() - startMs;

        const text = extractCompletionText(result);

        return {
          text,
          usage: result.usage
            ? {
                promptTokens: result.usage.prompt_tokens ?? 0,
                completionTokens: result.usage.completion_tokens ?? 0,
                totalTokens: result.usage.total_tokens ?? 0,
              }
            : undefined,
          modelId: result.model ?? config.modelId,
          latencyMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function resolveModelCandidates(config: NativeIntelligenceConfig): string[] {
  const primary = config.modelId;
  const candidates: string[] = [];

  if (typeof config.localModel === "string" && config.localModel.trim().length > 0) {
    candidates.push(config.localModel.trim());
  }

  const envLocalModel = process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL?.trim()
    || process.env.OLLAMA_MODEL?.trim();
  if (envLocalModel && !candidates.includes(envLocalModel)) {
    candidates.push(envLocalModel);
  }

  if (!candidates.includes(primary)) {
    candidates.push(primary);
  }

  // Ollama commonly registers Gemma with explicit size tags (e.g. gemma3:4b).
  // Keep canonical model ids in config, but try a practical local fallback.
  if (
    config.backendType === "local"
    && primary === "gemma3"
    && !candidates.includes("gemma3:4b")
  ) {
    candidates.push("gemma3:4b");
  }

  return candidates;
}

function resolveEndpointCandidates(config: NativeIntelligenceConfig): string[] {
  const primary = config.endpoint;
  const candidates = [primary];

  if (config.backendType !== "local") return candidates;

  // If the configured model maps to a family with a distinct endpoint, try
  // it before the hardcoded 11434 fallback. This is what lets the same
  // local-mode code path serve Qwen / MiniMax / Kimi / DeepSeek / GLM.
  const familyEndpoint = getFamilyEndpoint(resolveActiveModelId(config));
  if (familyEndpoint && !candidates.includes(familyEndpoint)) {
    candidates.push(familyEndpoint);
  }

  const normalized = primary.toLowerCase();
  if (
    (normalized.includes("localhost:8080") || normalized.includes("127.0.0.1:8080"))
    && !candidates.includes("http://127.0.0.1:11434/v1/chat/completions")
  ) {
    candidates.push("http://127.0.0.1:11434/v1/chat/completions");
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Per-family backend routing (catalog-driven)
// ---------------------------------------------------------------------------

export interface BackendEndpointConfig {
  baseUrl: string;
  chatCompletionsUrl: string;
  family: import("./contract.js").LocalModelFamily;
  source: "catalog-env" | "catalog-default" | "ollama-default";
}

const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

/**
 * Resolve the preferred base URL + chat-completions URL for a given model id.
 *
 * Precedence:
 *   1. Env var named by the catalog entry's `defaultEndpointEnv`
 *      (e.g. QWEN_BASE_URL, MINIMAX_BASE_URL, …).
 *   2. The catalog entry's `defaultEndpointUrl`.
 *   3. `OPENAI_COMPATIBLE_URL` (generic escape hatch).
 *   4. `OLLAMA_BASE_URL`.
 *   5. Built-in Ollama default.
 */
export function getBackendConfig(modelId: string): BackendEndpointConfig {
  const variant = getLocalModelVariant(modelId);
  const family = variant?.family ?? inferFamilyFromModelId(modelId);

  const envFamilyUrl = variant?.defaultEndpointEnv
    ? process.env[variant.defaultEndpointEnv]?.trim()
    : undefined;
  if (envFamilyUrl) {
    return buildEndpointConfig(envFamilyUrl, family, "catalog-env");
  }

  if (variant?.defaultEndpointUrl) {
    return buildEndpointConfig(variant.defaultEndpointUrl, family, "catalog-default");
  }

  const genericEnv = process.env.OPENAI_COMPATIBLE_URL?.trim();
  if (genericEnv) {
    return buildEndpointConfig(genericEnv, family, "catalog-env");
  }

  const ollamaEnv = process.env.OLLAMA_BASE_URL?.trim();
  if (ollamaEnv) {
    return buildEndpointConfig(ollamaEnv, family, "catalog-env");
  }

  return buildEndpointConfig(OLLAMA_DEFAULT_BASE_URL, family, "ollama-default");
}

function buildEndpointConfig(
  baseUrl: string,
  family: import("./contract.js").LocalModelFamily,
  source: BackendEndpointConfig["source"],
): BackendEndpointConfig {
  const normalized = baseUrl.replace(/\/$/, "");
  const chat = normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
  return { baseUrl: normalized, chatCompletionsUrl: chat, family, source };
}

function resolveActiveModelId(config: NativeIntelligenceConfig): string {
  const fromLocal = typeof config.localModel === "string" ? config.localModel.trim() : "";
  if (fromLocal) return fromLocal;
  const fromEnv = process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL?.trim()
    || process.env.OLLAMA_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return config.modelId;
}

function getFamilyEndpoint(modelId: string): string | undefined {
  const variant = getLocalModelVariant(modelId);
  if (!variant) return undefined;
  const envName = variant.defaultEndpointEnv;
  const envValue = envName ? process.env[envName]?.trim() : undefined;
  const baseUrl = envValue || variant.defaultEndpointUrl;
  if (!baseUrl) return undefined;
  return buildEndpointConfig(baseUrl, variant.family, envValue ? "catalog-env" : "catalog-default").chatCompletionsUrl;
}

function shouldTryNextModel(
  status: number,
  errorText: string,
  attemptedModel: string,
  config: NativeIntelligenceConfig,
  candidates: string[],
): boolean {
  const hasNextCandidate = candidates[candidates.length - 1] !== attemptedModel;
  if (!hasNextCandidate) return false;
  if (config.backendType !== "local") return false;

  const normalizedError = errorText.toLowerCase();
  return status === 404 || normalizedError.includes("model") && normalizedError.includes("not found");
}

function extractCompletionText(response: OpenAICompatibleResponse): string {
  if (response.choices && response.choices.length > 0) {
    const choice = response.choices[0];
    if (choice.message?.content) return choice.message.content;
    if (choice.text) return choice.text;
  }
  throw new NativeIntelligenceBackendError(
    502,
    "Model backend returned no completion text.",
  );
}

// ---------------------------------------------------------------------------
// Stub backend for offline / fallback use
// ---------------------------------------------------------------------------

export function createStubBackend(): NativeIntelligenceBackend {
  return {
    async complete(input: ModelCompletionInput): Promise<ModelCompletionResult> {
      return {
        text: "",
        modelId: "stub",
        latencyMs: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Backend availability check
// ---------------------------------------------------------------------------

export async function checkBackendHealth(
  config: NativeIntelligenceConfig,
): Promise<{ available: boolean; latencyMs: number; error?: string }> {
  const startMs = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(config.endpoint.replace(/\/chat\/completions$/, "/models"), {
        method: "GET",
        headers: {
          accept: "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startMs;
      return { available: response.ok, latencyMs };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      available: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class NativeIntelligenceBackendError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
