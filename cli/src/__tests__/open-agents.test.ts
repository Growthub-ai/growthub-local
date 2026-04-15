import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAgentsConfig } from "../runtime/open-agents/contract.js";

// ---------------------------------------------------------------------------
// Mock the config home so we never touch the real filesystem
// ---------------------------------------------------------------------------

vi.mock("../config/home.js", () => ({
  resolvePaperclipHomeDir: () => "/tmp/test-paperclip-home",
  expandHomePrefix: (p: string) => p,
}));

describe("open-agents contract", () => {
  it("exports DEFAULT_OPEN_AGENTS_CONFIG with expected shape", async () => {
    const { DEFAULT_OPEN_AGENTS_CONFIG } = await import("../runtime/open-agents/contract.js");
    expect(DEFAULT_OPEN_AGENTS_CONFIG).toBeDefined();
    expect(DEFAULT_OPEN_AGENTS_CONFIG.backendType).toBe("local");
    expect(DEFAULT_OPEN_AGENTS_CONFIG.endpoint).toBe("http://localhost:3000");
    expect(typeof DEFAULT_OPEN_AGENTS_CONFIG.sandboxTimeoutMs).toBe("number");
    expect(typeof DEFAULT_OPEN_AGENTS_CONFIG.timeoutMs).toBe("number");
  });
});

describe("open-agents config persistence", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("readOpenAgentsConfig returns defaults when no file exists", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const { readOpenAgentsConfig, DEFAULT_OPEN_AGENTS_CONFIG } = await import(
      "../runtime/open-agents/index.js"
    );
    const config = readOpenAgentsConfig();
    expect(config.backendType).toBe(DEFAULT_OPEN_AGENTS_CONFIG.backendType);
    expect(config.endpoint).toBe(DEFAULT_OPEN_AGENTS_CONFIG.endpoint);
  });

  it("readOpenAgentsConfig parses valid JSON", async () => {
    const stored: OpenAgentsConfig = {
      backendType: "hosted",
      endpoint: "https://my-agents.vercel.app",
      apiKey: "test-key",
      sandboxTimeoutMs: 60_000,
      timeoutMs: 10_000,
    };

    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(stored));

    const { readOpenAgentsConfig } = await import("../runtime/open-agents/index.js");
    const config = readOpenAgentsConfig();
    expect(config.backendType).toBe("hosted");
    expect(config.endpoint).toBe("https://my-agents.vercel.app");
    expect(config.apiKey).toBe("test-key");
  });

  it("readOpenAgentsConfig returns defaults for invalid JSON", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("not-json");

    const { readOpenAgentsConfig, DEFAULT_OPEN_AGENTS_CONFIG } = await import(
      "../runtime/open-agents/index.js"
    );
    const config = readOpenAgentsConfig();
    expect(config.endpoint).toBe(DEFAULT_OPEN_AGENTS_CONFIG.endpoint);
  });

  it("readOpenAgentsConfig validates backendType", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ backendType: "invalid", endpoint: "http://test:3000" }),
    );

    const { readOpenAgentsConfig } = await import("../runtime/open-agents/index.js");
    const config = readOpenAgentsConfig();
    expect(config.backendType).toBe("local");
    expect(config.endpoint).toBe("http://test:3000");
  });
});

describe("open-agents health check", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns available=true when backend responds ok", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ version: "1.0.0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { checkOpenAgentsHealth } = await import("../runtime/open-agents/provider.js");
    const result = await checkOpenAgentsHealth({
      backendType: "local",
      endpoint: "http://localhost:3000",
      timeoutMs: 5_000,
    });

    expect(result.available).toBe(true);
    expect(result.version).toBe("1.0.0");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns available=false for non-200 responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("", { status: 503, statusText: "Service Unavailable" }),
    );

    const { checkOpenAgentsHealth } = await import("../runtime/open-agents/provider.js");
    const result = await checkOpenAgentsHealth({
      backendType: "local",
      endpoint: "http://localhost:3000",
      timeoutMs: 5_000,
    });

    expect(result.available).toBe(false);
    expect(result.error).toContain("503");
  });

  it("returns available=false for network errors", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const { checkOpenAgentsHealth } = await import("../runtime/open-agents/provider.js");
    const result = await checkOpenAgentsHealth({
      backendType: "local",
      endpoint: "http://localhost:3000",
      timeoutMs: 5_000,
    });

    expect(result.available).toBe(false);
    expect(result.error).toBe("Connection refused");
  });
});

describe("open-agents event formatter", () => {
  it("formats JSON events with type prefix", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { printOpenAgentsStreamEvent } = await import(
      "../adapters/open-agents/format-event.js"
    );

    printOpenAgentsStreamEvent(
      JSON.stringify({ type: "git_commit", detail: "Committed abc123" }),
      false,
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("Committed abc123");

    consoleSpy.mockRestore();
  });

  it("prints plain text for non-JSON lines", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { printOpenAgentsStreamEvent } = await import(
      "../adapters/open-agents/format-event.js"
    );

    printOpenAgentsStreamEvent("plain text output", false);

    expect(consoleSpy).toHaveBeenCalledWith("plain text output");

    consoleSpy.mockRestore();
  });

  it("ignores empty lines", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { printOpenAgentsStreamEvent } = await import(
      "../adapters/open-agents/format-event.js"
    );

    printOpenAgentsStreamEvent("   ", false);

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("open-agents CLI adapter", () => {
  it("exports CLIAdapterModule with correct type", async () => {
    const { openAgentsCLIAdapter } = await import("../adapters/open-agents/index.js");
    expect(openAgentsCLIAdapter.type).toBe("open_agents");
    expect(typeof openAgentsCLIAdapter.formatStdoutEvent).toBe("function");
  });
});
