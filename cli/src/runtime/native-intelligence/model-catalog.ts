/**
 * cli/src/runtime/native-intelligence/model-catalog.ts
 *
 * Static local-model registry — pure typed data, no FS, no imports from other
 * CLI modules.
 *
 * To add a model:   add an entry here. Nothing else changes.
 * To add a family:  add entries with new `family` + extend `LocalModelFamily`
 *                   in contract.ts + extend `getBackendConfig` in provider.ts
 *                   only if the family has a distinct default endpoint.
 *
 * Mirrors the house conventions in:
 *   - cli/src/templates/catalog.ts
 *   - cli/src/kits/catalog.ts
 */

import type { LocalModelVariant } from "./contract.js";

export const DEFAULT_LOCAL_MODEL_ID = "gemma3:4b";

export const MODEL_CATALOG: LocalModelVariant[] = [
  {
    id: "gemma3:4b",
    family: "gemma3",
    displayName: "Gemma 3 4B",
    hfRepoId: "google/gemma-3-4b-it",
    ollamaTag: "gemma3:4b",
    contextLength: 128_000,
    recommendedQuant: "q4_k_m",
    strengths: ["general", "planning", "summarization"],
    hardwareHint: "CPU or any consumer GPU",
    defaultEndpointEnv: "OLLAMA_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
    recommended: true,
  },
  {
    id: "gemma-4-9b-it",
    family: "gemma3",
    displayName: "Gemma 4 9B Instruct",
    hfRepoId: "google/gemma-4-9b-it",
    ollamaTag: "gemma4:9b",
    contextLength: 128_000,
    recommendedQuant: "q4_k_m",
    strengths: ["general", "multilingual", "planning"],
    hardwareHint: "1x consumer GPU (12GB+)",
    defaultEndpointEnv: "OLLAMA_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "qwen3.5-coder-32b",
    family: "qwen-coder",
    displayName: "Qwen 3.5 Coder 32B",
    hfRepoId: "Qwen/Qwen3.5-Coder-32B-Instruct",
    ollamaTag: "qwen3.5-coder:32b",
    contextLength: 128_000,
    recommendedQuant: "awq",
    strengths: ["coding", "agentic", "tool-use"],
    hardwareHint: "1x RTX 4090 / 2x consumer GPU",
    defaultEndpointEnv: "QWEN_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "minimax-m1-80k",
    family: "minimax",
    displayName: "MiniMax M1 (80k ctx)",
    hfRepoId: "MiniMaxAI/MiniMax-M1-80k",
    contextLength: 80_000,
    recommendedQuant: "awq",
    strengths: ["long-context", "reasoning", "multilingual"],
    hardwareHint: "2x RTX 4090 / datacenter GPU",
    defaultEndpointEnv: "MINIMAX_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "kimi-k2.5",
    family: "kimi",
    displayName: "Kimi K2.5",
    hfRepoId: "moonshotai/Kimi-K2.5",
    contextLength: 200_000,
    recommendedQuant: "awq",
    strengths: ["long-context", "agentic", "research"],
    hardwareHint: "datacenter GPU (80GB+)",
    defaultEndpointEnv: "KIMI_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "deepseek-v3.2",
    family: "deepseek",
    displayName: "DeepSeek V3.2",
    hfRepoId: "deepseek-ai/DeepSeek-V3.2",
    contextLength: 128_000,
    recommendedQuant: "awq",
    strengths: ["reasoning", "coding", "math"],
    hardwareHint: "datacenter GPU (80GB+)",
    defaultEndpointEnv: "DEEPSEEK_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "glm-5-32b",
    family: "glm",
    displayName: "GLM 5 32B",
    hfRepoId: "THUDM/GLM-5-32B",
    ollamaTag: "glm5:32b",
    contextLength: 128_000,
    recommendedQuant: "awq",
    strengths: ["reasoning", "multilingual", "tool-use"],
    hardwareHint: "1x RTX 4090 / 2x consumer GPU",
    defaultEndpointEnv: "GLM_BASE_URL",
    defaultEndpointUrl: "http://127.0.0.1:11434/v1",
  },
];

// ---------------------------------------------------------------------------
// Catalog helpers (pure, no side effects)
// ---------------------------------------------------------------------------

export function listLocalModelVariants(): LocalModelVariant[] {
  return [...MODEL_CATALOG];
}

export function getLocalModelVariant(id: string | undefined): LocalModelVariant | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return MODEL_CATALOG.find((entry) => entry.id === trimmed || entry.ollamaTag === trimmed);
}

export function getDefaultLocalModel(): LocalModelVariant {
  const entry = getLocalModelVariant(DEFAULT_LOCAL_MODEL_ID);
  if (!entry) {
    throw new Error(
      `MODEL_CATALOG must contain the default local model id "${DEFAULT_LOCAL_MODEL_ID}".`,
    );
  }
  return entry;
}

/**
 * Infer the canonical family id from any concrete model tag.
 *
 * Catalog match wins; otherwise a case-insensitive prefix scan covers
 * user-entered custom ids (e.g. "gemma3n:e4b", "qwen3-coder-plus").
 */
export function inferFamilyFromModelId(modelId: string): import("./contract.js").LocalModelFamily {
  const hit = getLocalModelVariant(modelId);
  if (hit) return hit.family;

  const lower = modelId.toLowerCase();
  if (lower.includes("gemma3n")) return "gemma3n";
  if (lower.includes("codegemma")) return "codegemma";
  if (lower.includes("gemma")) return "gemma3";
  if (lower.includes("qwen") && lower.includes("coder")) return "qwen-coder";
  if (lower.includes("qwen")) return "qwen-coder";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("kimi")) return "kimi";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("glm")) return "glm";
  return "gemma3";
}
