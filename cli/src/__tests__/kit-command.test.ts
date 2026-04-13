import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const confirmMock = vi.fn();
const introMock = vi.fn();
const outroMock = vi.fn();
const cancelMock = vi.fn();
const noteMock = vi.fn();
const logErrorMock = vi.fn();
const multiselectMock = vi.fn();
const downloadBundledKitMock = vi.fn();
const listBundledKitsMock = vi.fn();

vi.mock("@clack/prompts", () => ({
  select: selectMock,
  confirm: confirmMock,
  intro: introMock,
  outro: outroMock,
  cancel: cancelMock,
  note: noteMock,
  multiselect: multiselectMock,
  log: {
    error: logErrorMock,
  },
  isCancel: () => false,
}));

vi.mock("../kits/service.js", () => ({
  downloadBundledKit: downloadBundledKitMock,
  inspectBundledKit: vi.fn(),
  listBundledKits: listBundledKitsMock,
  resolveKitPath: vi.fn(),
  validateKitDirectory: vi.fn(),
  fuzzyResolveKitId: (kitId: string) => kitId,
}));

vi.mock("../utils/banner.js", () => ({
  printPaperclipCliBanner: vi.fn(),
}));

describe("kit interactive download flow", () => {
  const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });

    listBundledKitsMock.mockReturnValue([
      {
        id: "growthub-open-higgsfield-studio-v1",
        family: "studio",
        name: "Growthub Agent Worker Kit - Open Higgsfield Studio",
        version: "1.0.0",
        description: "Self-contained local execution environment for Open Higgsfield.",
        briefType: "open-higgsfield-visual-production",
        executionMode: "export",
      },
    ]);

    downloadBundledKitMock.mockImplementation((kitId: string, out: string | undefined, options: { onProgress?: (progress: { phase: string; percent: number; detail: string }) => void }) => {
      options.onProgress?.({ phase: "copying", percent: 50, detail: `${kitId}:${out ?? "default"}` });
      options.onProgress?.({ phase: "done", percent: 100, detail: "complete" });
      return {
        folderPath: "/tmp/kits/growthub-agent-worker-kit-open-higgsfield-studio-v1",
        zipPath: "/tmp/kits/growthub-agent-worker-kit-open-higgsfield-studio-v1.zip",
      };
    });
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
  });

  it("downloads a selected kit from the interactive flow and prints success output", async () => {
    selectMock
      .mockResolvedValueOnce("studio")
      .mockResolvedValueOnce("growthub-open-higgsfield-studio-v1")
      .mockResolvedValueOnce("actions")
      .mockResolvedValueOnce("download");
    confirmMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const { runInteractivePicker } = await import("../commands/kit.js");
    const result = await runInteractivePicker({});

    expect(result).toBe("done");
    expect(multiselectMock).not.toHaveBeenCalled();
    expect(downloadBundledKitMock).toHaveBeenCalledWith(
      "growthub-open-higgsfield-studio-v1",
      undefined,
      expect.objectContaining({
        onProgress: expect.any(Function),
      }),
    );
    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("Kit exported successfully."));

    const printedOutput = consoleLogSpy.mock.calls.flat().join("\n");
    expect(printedOutput).toContain("Open folder:");
    expect(printedOutput).toContain("/tmp/kits/growthub-agent-worker-kit-open-higgsfield-studio-v1");
    expect(printedOutput).toContain("Kit exported successfully.");
  });
});
