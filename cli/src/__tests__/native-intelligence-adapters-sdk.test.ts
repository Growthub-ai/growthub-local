import { describe, expect, it } from "vitest";
import type { AdapterKind, LocalModelRuntimeRef } from "@growthub/api-contract/adapters";

describe("@growthub/api-contract adapters — local intelligence", () => {
  it("includes local-intelligence adapter kind (compile-time)", () => {
    const k: AdapterKind = "local-intelligence";
    expect(k).toBe("local-intelligence");
  });

  it("accepts LocalModelRuntimeRef shape", () => {
    const ref: LocalModelRuntimeRef = {
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434/v1/chat/completions",
      modelId: "gemma3:4b",
      status: "available",
    };
    expect(ref.modelId).toContain("gemma");
  });
});
