import { describe, expect, it } from "vitest";
import type {
  NativeIntelligenceConfig,
  IntelligenceProviderType,
} from "../runtime/native-intelligence/contract.js";
import { DEFAULT_INTELLIGENCE_CONFIG } from "../runtime/native-intelligence/contract.js";

describe("multi-provider intelligence types", () => {
  describe("IntelligenceProviderType", () => {
    it("accepts all valid provider types", () => {
      const validProviders: IntelligenceProviderType[] = [
        "local",
        "claude",
        "openai",
        "gemini",
        "openrouter",
      ];
      // Type-level check — if this compiles, the types are correct
      expect(validProviders).toHaveLength(5);
    });
  });

  describe("NativeIntelligenceConfig", () => {
    it("has correct default values", () => {
      expect(DEFAULT_INTELLIGENCE_CONFIG.modelId).toBe("gemma3");
      expect(DEFAULT_INTELLIGENCE_CONFIG.backendType).toBe("local");
      expect(DEFAULT_INTELLIGENCE_CONFIG.defaultTemperature).toBe(0.3);
      expect(DEFAULT_INTELLIGENCE_CONFIG.defaultMaxTokens).toBe(4096);
      expect(DEFAULT_INTELLIGENCE_CONFIG.timeoutMs).toBe(30_000);
    });

    it("supports providerType and providerModelId fields", () => {
      const config: NativeIntelligenceConfig = {
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "claude",
        providerModelId: "claude-sonnet-4-6",
        apiKey: "sk-test-key",
        endpoint: "https://api.anthropic.com/v1/messages",
      };
      expect(config.providerType).toBe("claude");
      expect(config.providerModelId).toBe("claude-sonnet-4-6");
    });

    it("supports gemini provider config", () => {
      const config: NativeIntelligenceConfig = {
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "gemini",
        providerModelId: "gemini-2.5-flash",
        apiKey: "AIza-test-key",
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
      };
      expect(config.providerType).toBe("gemini");
    });

    it("supports openrouter provider config", () => {
      const config: NativeIntelligenceConfig = {
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "openrouter",
        providerModelId: "meta-llama/llama-4-maverick",
        apiKey: "sk-or-test-key",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
      };
      expect(config.providerType).toBe("openrouter");
    });

    it("supports openai provider config", () => {
      const config: NativeIntelligenceConfig = {
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "openai",
        providerModelId: "gpt-4o",
        apiKey: "sk-test-key",
        endpoint: "https://api.openai.com/v1/chat/completions",
      };
      expect(config.providerType).toBe("openai");
    });

    it("preserves backward compatibility with local-only config", () => {
      const localConfig: NativeIntelligenceConfig = {
        modelId: "gemma3",
        backendType: "local",
        endpoint: "http://localhost:8080/v1/chat/completions",
        localModel: "gemma3:4b",
        defaultTemperature: 0.3,
        defaultMaxTokens: 4096,
        timeoutMs: 30_000,
      };
      // providerType and providerModelId are optional — should not break
      expect(localConfig.providerType).toBeUndefined();
      expect(localConfig.providerModelId).toBeUndefined();
    });
  });

  describe("provider backend routing", () => {
    it("creates backend for local provider (existing path preserved)", async () => {
      // This test verifies the import works and the function exists.
      // We cannot integration-test live endpoints, but we verify the factory
      // does not throw when given valid config.
      const { createNativeIntelligenceBackend } = await import(
        "../runtime/native-intelligence/provider.js"
      );
      expect(typeof createNativeIntelligenceBackend).toBe("function");

      // Verify it returns an object with a complete method
      const backend = createNativeIntelligenceBackend({
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "local",
      });
      expect(backend).toBeDefined();
      expect(typeof backend.complete).toBe("function");
    });

    it("creates backend for claude provider", async () => {
      const { createNativeIntelligenceBackend } = await import(
        "../runtime/native-intelligence/provider.js"
      );
      const backend = createNativeIntelligenceBackend({
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "claude",
        providerModelId: "claude-sonnet-4-6",
        apiKey: "sk-test",
        endpoint: "https://api.anthropic.com/v1/messages",
      });
      expect(backend).toBeDefined();
      expect(typeof backend.complete).toBe("function");
    });

    it("creates backend for gemini provider", async () => {
      const { createNativeIntelligenceBackend } = await import(
        "../runtime/native-intelligence/provider.js"
      );
      const backend = createNativeIntelligenceBackend({
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "gemini",
        providerModelId: "gemini-2.5-flash",
        apiKey: "AIza-test",
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
      });
      expect(backend).toBeDefined();
      expect(typeof backend.complete).toBe("function");
    });

    it("creates backend for openrouter provider", async () => {
      const { createNativeIntelligenceBackend } = await import(
        "../runtime/native-intelligence/provider.js"
      );
      const backend = createNativeIntelligenceBackend({
        ...DEFAULT_INTELLIGENCE_CONFIG,
        providerType: "openrouter",
        providerModelId: "meta-llama/llama-4-maverick",
        apiKey: "sk-or-test",
      });
      expect(backend).toBeDefined();
      expect(typeof backend.complete).toBe("function");
    });

    it("falls back to local/openai-compat for unknown providerType", async () => {
      const { createNativeIntelligenceBackend } = await import(
        "../runtime/native-intelligence/provider.js"
      );
      const backend = createNativeIntelligenceBackend({
        ...DEFAULT_INTELLIGENCE_CONFIG,
        // No providerType set — should default to local/openai-compatible
      });
      expect(backend).toBeDefined();
      expect(typeof backend.complete).toBe("function");
    });
  });
});
