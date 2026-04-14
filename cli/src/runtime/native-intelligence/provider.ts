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
  ModelCompletionInput,
  ModelCompletionResult,
} from "./contract.js";

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
// Backend creation
// ---------------------------------------------------------------------------

export function createNativeIntelligenceBackend(
  config: NativeIntelligenceConfig,
): NativeIntelligenceBackend {
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

  const normalized = primary.toLowerCase();
  if (
    (normalized.includes("localhost:8080") || normalized.includes("127.0.0.1:8080"))
    && !candidates.includes("http://127.0.0.1:11434/v1/chat/completions")
  ) {
    candidates.push("http://127.0.0.1:11434/v1/chat/completions");
  }

  return candidates;
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
