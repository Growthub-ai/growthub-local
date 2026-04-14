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

      const body: Record<string, unknown> = {
        model: config.modelId,
        messages,
        temperature: input.temperature ?? config.defaultTemperature ?? 0.3,
        max_tokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096,
      };

      if (input.responseFormat === "json") {
        body.response_format = { type: "json_object" };
      }

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

        const response = await fetch(config.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new NativeIntelligenceBackendError(
            response.status,
            `Model backend responded with ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const result = (await response.json()) as OpenAICompatibleResponse;
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
