import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: fsMock,
}));

vi.mock("../config/home.js", () => ({
  resolvePaperclipHomeDir: () => "/tmp/test-paperclip-home",
  expandHomePrefix: (p: string) => p,
}));

describe("qwen-code contract", () => {
  it("exports defaults with expected shape", async () => {
    const { DEFAULT_QWEN_CODE_CONFIG, QWEN_CODE_APPROVAL_MODES } = await import("../runtime/qwen-code/contract.js");
    expect(DEFAULT_QWEN_CODE_CONFIG.binaryPath).toBe("qwen");
    expect(DEFAULT_QWEN_CODE_CONFIG.defaultModel).toBe("qwen3-coder");
    expect(QWEN_CODE_APPROVAL_MODES).toEqual(["default", "auto-edit", "yolo"]);
  });
});

describe("qwen-code config persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    fsMock.existsSync.mockReset();
    fsMock.readFileSync.mockReset();
    fsMock.writeFileSync.mockReset();
    fsMock.chmodSync.mockReset();
  });

  it("returns defaults when config file is missing", async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { readQwenCodeConfig, DEFAULT_QWEN_CODE_CONFIG } = await import("../runtime/qwen-code/index.js");
    const config = readQwenCodeConfig();
    expect(config.binaryPath).toBe(DEFAULT_QWEN_CODE_CONFIG.binaryPath);
    expect(config.defaultModel).toBe(DEFAULT_QWEN_CODE_CONFIG.defaultModel);
  });

  it("parses and normalizes valid stored config", async () => {
    fsMock.existsSync.mockImplementation((targetPath: unknown) => String(targetPath).includes("config.json"));
    fsMock.readFileSync.mockReturnValue(
      JSON.stringify({
        binaryPath: "qwen-custom",
        defaultModel: "qwen3.6-plus",
        approvalMode: "yolo",
        cwd: "/tmp/repo",
        timeoutMs: 90_000,
        env: { OPENAI_API_KEY: "test-key" },
      }),
    );

    const { readQwenCodeConfig } = await import("../runtime/qwen-code/index.js");
    const config = readQwenCodeConfig();
    expect(config.binaryPath).toBe("qwen-custom");
    expect(config.defaultModel).toBe("qwen3.6-plus");
    expect(config.approvalMode).toBe("yolo");
    expect(config.cwd).toBe("/tmp/repo");
  });

  it("persists provider keys into secure harness auth storage", async () => {
    fsMock.existsSync.mockImplementation((targetPath: unknown) => String(targetPath).includes("harness-auth"));
    fsMock.readFileSync.mockReturnValue("{}");

    const { writeQwenCodeConfig, DEFAULT_QWEN_CODE_CONFIG } = await import("../runtime/qwen-code/index.js");
    writeQwenCodeConfig({
      ...DEFAULT_QWEN_CODE_CONFIG,
      env: {
        OPENAI_API_KEY: "secret-openai-key",
      },
    });

    const writes = fsMock.writeFileSync.mock.calls.map((call) => ({
      path: String(call[0]),
      content: String(call[1]),
    }));
    const configWrite = writes.find((entry) => entry.path.includes("qwen-code/config.json"));
    const authWrite = writes.find((entry) => entry.path.includes("harness-auth/qwen-code.json"));
    expect(configWrite?.content.includes("secret-openai-key")).toBe(false);
    expect(authWrite?.content.includes("secret-openai-key")).toBe(true);
  });
});

describe("qwen-code health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unavailable when binary is missing", async () => {
    const provider = await import("../runtime/qwen-code/provider.js");
    vi.spyOn(provider, "detectQwenVersion").mockReturnValue({
      found: false,
      version: null,
      resolvedPath: "qwen",
    });

    const { checkHealth } = await import("../runtime/qwen-code/health.js");
    const health = checkHealth("qwen", {});
    expect(health.status).toBe("unavailable");
    expect(health.summary).toContain("not found");
  });

  it("returns degraded when binary exists but no API key", async () => {
    const provider = await import("../runtime/qwen-code/provider.js");
    vi.spyOn(provider, "detectQwenVersion").mockReturnValue({
      found: true,
      version: "1.2.3",
      resolvedPath: "qwen",
    });
    vi.stubEnv("DASHSCOPE_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");

    const { checkHealth } = await import("../runtime/qwen-code/health.js");
    const health = checkHealth("qwen", {});
    expect(health.status).toBe("degraded");
    expect(health.summary).toContain("no API key configured");
  });
});

describe("qwen-code CLI adapter formatter", () => {
  it("prints JSON result text", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { printQwenStreamEvent } = await import("../adapters/qwen/format-event.js");

    printQwenStreamEvent(JSON.stringify({ type: "result", text: "done" }), false);

    expect(logSpy).toHaveBeenCalledWith("done");
    logSpy.mockRestore();
  });

  it("prints raw text for non-json lines", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { printQwenStreamEvent } = await import("../adapters/qwen/format-event.js");

    printQwenStreamEvent("plain output", false);

    expect(logSpy).toHaveBeenCalledWith("plain output");
    logSpy.mockRestore();
  });
});
