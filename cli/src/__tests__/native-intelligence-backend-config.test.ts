import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBackendConfig } from "../runtime/native-intelligence/provider.js";

const TRACKED_ENV_VARS = [
  "QWEN_BASE_URL",
  "MINIMAX_BASE_URL",
  "KIMI_BASE_URL",
  "DEEPSEEK_BASE_URL",
  "GLM_BASE_URL",
  "OLLAMA_BASE_URL",
  "OPENAI_COMPATIBLE_URL",
];

describe("native-intelligence getBackendConfig", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of TRACKED_ENV_VARS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TRACKED_ENV_VARS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("returns the catalog-default endpoint for known models", () => {
    const cfg = getBackendConfig("qwen3.5-coder-32b");
    expect(cfg.family).toBe("qwen-coder");
    expect(cfg.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(cfg.chatCompletionsUrl).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(cfg.source).toBe("catalog-default");
  });

  it("honors family-specific env vars over the catalog default", () => {
    process.env.QWEN_BASE_URL = "http://qwen-host:9000/v1";
    const cfg = getBackendConfig("qwen3.5-coder-32b");
    expect(cfg.baseUrl).toBe("http://qwen-host:9000/v1");
    expect(cfg.source).toBe("catalog-env");
  });

  it("routes minimax / kimi / deepseek / glm through their respective env vars", () => {
    process.env.MINIMAX_BASE_URL = "http://minimax:1000/v1";
    process.env.KIMI_BASE_URL = "http://kimi:2000/v1";
    process.env.DEEPSEEK_BASE_URL = "http://deepseek:3000/v1";
    process.env.GLM_BASE_URL = "http://glm:4000/v1";

    expect(getBackendConfig("minimax-m1-80k").baseUrl).toBe("http://minimax:1000/v1");
    expect(getBackendConfig("kimi-k2.5").baseUrl).toBe("http://kimi:2000/v1");
    expect(getBackendConfig("deepseek-v3.2").baseUrl).toBe("http://deepseek:3000/v1");
    expect(getBackendConfig("glm-5-32b").baseUrl).toBe("http://glm:4000/v1");
  });

  it("appends /chat/completions if the base URL does not already end with it", () => {
    process.env.QWEN_BASE_URL = "http://qwen-host:9000/v1/";
    const cfg = getBackendConfig("qwen3.5-coder-32b");
    expect(cfg.chatCompletionsUrl).toBe("http://qwen-host:9000/v1/chat/completions");
  });

  it("does not double-append /chat/completions", () => {
    process.env.QWEN_BASE_URL = "http://qwen-host:9000/v1/chat/completions";
    const cfg = getBackendConfig("qwen3.5-coder-32b");
    expect(cfg.chatCompletionsUrl).toBe("http://qwen-host:9000/v1/chat/completions");
  });

  it("falls through to OPENAI_COMPATIBLE_URL for unknown models", () => {
    process.env.OPENAI_COMPATIBLE_URL = "http://proxy:8080/v1";
    const cfg = getBackendConfig("some-unknown-tag");
    expect(cfg.baseUrl).toBe("http://proxy:8080/v1");
    expect(cfg.source).toBe("catalog-env");
  });

  it("falls through to OLLAMA_BASE_URL when no other source applies", () => {
    process.env.OLLAMA_BASE_URL = "http://my-ollama:11434/v1";
    const cfg = getBackendConfig("some-unknown-tag");
    expect(cfg.baseUrl).toBe("http://my-ollama:11434/v1");
    expect(cfg.source).toBe("catalog-env");
  });

  it("falls through to the built-in ollama default when no env var is set", () => {
    const cfg = getBackendConfig("some-unknown-tag");
    expect(cfg.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(cfg.source).toBe("ollama-default");
  });
});
