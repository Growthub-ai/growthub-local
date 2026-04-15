import * as p from "@clack/prompts";
import type { LlmConfig } from "../config/schema.js";

export async function promptLlm(): Promise<LlmConfig | undefined> {
  const configureLlm = await p.confirm({
    message: "Configure an LLM provider now?",
    initialValue: false,
  });

  if (p.isCancel(configureLlm)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (!configureLlm) return undefined;

  const provider = await p.select({
    message: "LLM provider",
    options: [
      { value: "claude" as const, label: "Claude (Anthropic)" },
      { value: "openai" as const, label: "OpenAI" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const apiKey = await p.password({
    message: `${provider === "claude" ? "Anthropic" : "OpenAI"} API key`,
    validate: (val: string) => {
      if (!val) return "API key is required";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return { provider, apiKey };
}

// ---------------------------------------------------------------------------
// Extended provider prompt for memory / intelligence multi-provider config
// ---------------------------------------------------------------------------

export type ExtendedProvider = "local" | "claude" | "openai" | "gemini" | "openrouter";

export interface ExtendedProviderConfig {
  provider: ExtendedProvider;
  apiKey?: string;
  modelId?: string;
  endpoint?: string;
}

const PROVIDER_LABELS: Record<ExtendedProvider, string> = {
  local: "Local (Ollama / vLLM — no API key needed)",
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Gemini (Google)",
  openrouter: "OpenRouter (100+ models)",
};

const DEFAULT_MODELS: Record<ExtendedProvider, string> = {
  local: "gemma3:4b",
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
  openrouter: "meta-llama/llama-4-maverick",
};

export async function promptExtendedProvider(
  context: string,
): Promise<ExtendedProviderConfig | null> {
  const provider = await p.select({
    message: `Choose ${context} provider`,
    options: (Object.keys(PROVIDER_LABELS) as ExtendedProvider[]).map((key) => ({
      value: key,
      label: PROVIDER_LABELS[key],
    })),
  });

  if (p.isCancel(provider)) return null;

  const selectedProvider = provider as ExtendedProvider;

  if (selectedProvider === "local") {
    const modelId = await p.text({
      message: "Local model id",
      placeholder: DEFAULT_MODELS.local,
      defaultValue: DEFAULT_MODELS.local,
    });
    if (p.isCancel(modelId)) return null;
    return {
      provider: "local",
      modelId: String(modelId).trim() || DEFAULT_MODELS.local,
    };
  }

  const apiKey = await p.password({
    message: `${PROVIDER_LABELS[selectedProvider]} API key`,
    validate: (val: string) => {
      if (!val) return "API key is required for this provider";
    },
  });
  if (p.isCancel(apiKey)) return null;

  const modelId = await p.text({
    message: "Model id",
    placeholder: DEFAULT_MODELS[selectedProvider],
    defaultValue: DEFAULT_MODELS[selectedProvider],
  });
  if (p.isCancel(modelId)) return null;

  return {
    provider: selectedProvider,
    apiKey: String(apiKey),
    modelId: String(modelId).trim() || DEFAULT_MODELS[selectedProvider],
  };
}
