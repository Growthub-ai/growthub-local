import { describe, it, expect } from "vitest";
import type { AdapterKind, LocalModelRuntimeRef } from "@growthub/api-contract/adapters";

describe("@growthub/api-contract local-intelligence adapter", () => {
  it("declares local-intelligence on AdapterKind", () => {
    const k: AdapterKind = "local-intelligence";
    expect(k).toBe("local-intelligence");
  });

  it("accepts LocalModelRuntimeRef metadata", () => {
    const ref: LocalModelRuntimeRef = {
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434/v1",
      modelId: "gemma3:4b",
      status: "available",
    };
    expect(ref.modelId).toBe("gemma3:4b");
  });
});
