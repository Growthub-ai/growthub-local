import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readIntelligenceConfig,
  writeIntelligenceConfig,
  getActiveModel,
} from "../runtime/native-intelligence/index.js";
import type { NativeIntelligenceConfig } from "../runtime/native-intelligence/contract.js";

describe("native-intelligence config round-trip", () => {
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "gh-intel-"));
    originalHome = process.env.PAPERCLIP_HOME;
    process.env.PAPERCLIP_HOME = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.PAPERCLIP_HOME;
    } else {
      process.env.PAPERCLIP_HOME = originalHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("round-trips providerType and providerModelId (was silently dropped before)", () => {
    const input: NativeIntelligenceConfig = {
      modelId: "gemma3",
      backendType: "hosted",
      endpoint: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-test",
      providerType: "claude",
      providerModelId: "claude-sonnet-4-6",
      defaultTemperature: 0.3,
      defaultMaxTokens: 4096,
      timeoutMs: 30_000,
    };
    writeIntelligenceConfig(input);
    const out = readIntelligenceConfig();
    expect(out.providerType).toBe("claude");
    expect(out.providerModelId).toBe("claude-sonnet-4-6");
    expect(out.apiKey).toBe("sk-test");
    expect(out.backendType).toBe("hosted");
  });

  it("persists widened canonical family ids (qwen-coder, minimax, kimi, deepseek, glm)", () => {
    for (const family of ["qwen-coder", "minimax", "kimi", "deepseek", "glm"] as const) {
      writeIntelligenceConfig({
        modelId: family,
        backendType: "local",
        endpoint: "http://127.0.0.1:11434/v1/chat/completions",
      });
      expect(readIntelligenceConfig().modelId).toBe(family);
    }
  });

  it("getActiveModel resolves config > env > catalog-default in that order", () => {
    // 1. no config, no env → catalog default
    const def = getActiveModel();
    expect(def.source).toBe("catalog-default");
    expect(def.id).toBe("gemma3:4b");

    // 2. env wins when no config
    process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL = "qwen3.5-coder-32b";
    try {
      const fromEnv = getActiveModel();
      expect(fromEnv.source).toBe("env");
      expect(fromEnv.id).toBe("qwen3.5-coder-32b");
    } finally {
      delete process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL;
    }

    // 3. config wins when present
    writeIntelligenceConfig({
      modelId: "minimax",
      backendType: "local",
      endpoint: "http://127.0.0.1:11434/v1/chat/completions",
      localModel: "minimax-m1-80k",
    });
    const fromConfig = getActiveModel();
    expect(fromConfig.source).toBe("config");
    expect(fromConfig.id).toBe("minimax-m1-80k");
    expect(fromConfig.variant?.family).toBe("minimax");
  });

  it("validateModelId falls back to gemma3 on junk input without throwing", () => {
    // Write raw JSON with a bogus modelId — simulates an older config file.
    const configDir = path.resolve(tmpHome, "native-intelligence");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.resolve(configDir, "config.json"),
      JSON.stringify({ modelId: "not-a-real-family", backendType: "local", endpoint: "x" }),
    );
    const out = readIntelligenceConfig();
    expect(out.modelId).toBe("gemma3");
  });
});
