import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { expandHomePrefix, resolveDefaultConfigPath } from "../config/home.js";
import { resolveGrowthubRepoRoot } from "../utils/repo-root.js";

type AgentReasonOpts = {
  root?: string;
  config?: string;
  prompt: string;
};

function readPaperclipConfig(configPath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickBaseUrl(config: Record<string, unknown> | null): string | undefined {
  const fromEnv =
    process.env.GROWTHUB_MODEL_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.VLLM_OPENAI_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const llm = config && typeof config.llm === "object" && config.llm !== null ? (config.llm as Record<string, unknown>) : null;
  const base = llm && typeof llm.baseUrl === "string" ? llm.baseUrl : undefined;
  return base?.trim() || undefined;
}

function pickModel(): string {
  return (
    process.env.GROWTHUB_MODEL_NAME?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "google/gemma-4-E4B-it"
  );
}

/**
 * Single-turn chat completion against an OpenAI-compatible server (vLLM, etc.).
 * Private prompts / system instructions stay outside this OSS path; use env.
 */
export async function agentReasonCommand(opts: AgentReasonOpts): Promise<void> {
  const root = opts.root?.trim() ? path.resolve(opts.root) : resolveGrowthubRepoRoot();
  const configPath =
    opts.config?.trim() ||
    process.env.PAPERCLIP_CONFIG?.trim() ||
    resolveDefaultConfigPath();

  const expandedConfig = expandHomePrefix(configPath);

  const config = fs.existsSync(expandedConfig) ? readPaperclipConfig(expandedConfig) : null;
  const baseUrl = pickBaseUrl(config)?.replace(/\/$/, "");
  const model = pickModel();
  const prompt = opts.prompt?.trim();

  if (!prompt) {
    console.error(pc.red("Missing prompt. Example: growthub agent:reason \"Plan the next CLI command\""));
    process.exit(1);
  }

  if (!baseUrl) {
    console.error(
      pc.red(
        "No OpenAI-compatible base URL. Set GROWTHUB_MODEL_BASE_URL or OPENAI_BASE_URL (or llm.baseUrl in Paperclip config).",
      ),
    );
    console.error(pc.dim(`Repo root: ${root}`));
    process.exit(1);
  }

  const apiKey = process.env.GROWTHUB_MODEL_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "anonymous";
  const url = `${baseUrl}/v1/chat/completions`;
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: Number(process.env.GROWTHUB_MODEL_TEMPERATURE ?? 0.2),
    max_tokens: Number(process.env.GROWTHUB_MODEL_MAX_TOKENS ?? 1024),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(pc.red(`HTTP ${res.status} ${res.statusText}`));
    console.error(pc.dim(t.slice(0, 2000)));
    process.exit(1);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  console.log(text);
}
