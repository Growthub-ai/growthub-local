import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const confirmMock = vi.fn();
const introMock = vi.fn();
const outroMock = vi.fn();
const cancelMock = vi.fn();
const noteMock = vi.fn();
const logErrorMock = vi.fn();
const multiselectMock = vi.fn();
const textMock = vi.fn();
const downloadBundledKitMock = vi.fn();
const listBundledKitsMock = vi.fn();
const listRegisteredKitForksMock = vi.fn();
const registerKitForkMock = vi.fn();
const planKitForkSyncMock = vi.fn();
const startKitForkSyncJobMock = vi.fn();
const listKitForkSyncJobsMock = vi.fn();
const readKitForkSyncJobMock = vi.fn();
const runPreparedKitForkSyncJobMock = vi.fn();

vi.mock("@clack/prompts", () => ({
  select: selectMock,
  confirm: confirmMock,
  text: textMock,
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

vi.mock("../kits/fork-sync.js", () => ({
  listRegisteredKitForks: listRegisteredKitForksMock,
  registerKitFork: registerKitForkMock,
  planKitForkSync: planKitForkSyncMock,
  startKitForkSyncJob: startKitForkSyncJobMock,
  listKitForkSyncJobs: listKitForkSyncJobsMock,
  readKitForkSyncJob: readKitForkSyncJobMock,
  runPreparedKitForkSyncJob: runPreparedKitForkSyncJobMock,
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
        activationModes: ["export"],
        bundleId: "growthub-open-higgsfield-studio-v1",
        bundleVersion: "1.0.0",
        type: "worker",
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

    listRegisteredKitForksMock.mockReturnValue([]);
    listKitForkSyncJobsMock.mockReturnValue([]);
    planKitForkSyncMock.mockReturnValue({
      registration: {
        id: "my-higgsfield-fork",
        kitId: "growthub-open-higgsfield-studio-v1",
        localKitId: "growthub-open-higgsfield-studio-v1",
        forkPath: "/tmp/forks/higgsfield",
        repoRoot: "/tmp/forks",
        repoRelativePath: "higgsfield",
        baseBranch: "main",
        branchPrefix: "sync",
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
        baselineVersion: "1.0.0",
        lastSyncedAt: null,
        lastSyncedUpstreamVersion: null,
        lastJobId: null,
      },
      upstreamVersion: "1.0.1",
      baselineVersion: "1.0.0",
      dirtyWorkingTree: false,
      upstreamChangedFiles: 3,
      forkCustomizedFiles: 2,
      potentialConflictFiles: [],
      localOnlyFiles: ["LOCAL_ONLY.md"],
      upstreamOnlyFiles: ["UPSTREAM_ONLY.md"],
      packageJsonFiles: ["package.json"],
      previewFiles: ["package.json", "LOCAL_ONLY.md"],
    });
    registerKitForkMock.mockReturnValue({
      registration: {
        id: "my-higgsfield-fork",
        kitId: "growthub-open-higgsfield-studio-v1",
        localKitId: "growthub-open-higgsfield-studio-v1",
        forkPath: "/tmp/forks/higgsfield",
        repoRoot: "/tmp/forks",
        repoRelativePath: "higgsfield",
        baseBranch: "main",
        branchPrefix: "sync",
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
        baselineVersion: "1.0.0",
        lastSyncedAt: null,
        lastSyncedUpstreamVersion: null,
        lastJobId: null,
      },
      baselinePath: "/tmp/paperclip/kits/fork-sync/baselines/my-higgsfield-fork/snapshot",
      upstreamVersion: "1.0.0",
    });
    startKitForkSyncJobMock.mockReturnValue({
      job: {
        id: "kit-sync-123",
        forkId: "my-higgsfield-fork",
        kitId: "growthub-open-higgsfield-studio-v1",
        status: "queued",
        createdAt: "2026-04-16T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        pid: 12345,
        branchName: "sync/my-higgsfield-fork-12345678",
        worktreePath: "/tmp/paperclip/kits/fork-sync/worktrees/my-higgsfield-fork/kit-sync-123",
        logPath: "/tmp/paperclip/kits/fork-sync/jobs/kit-sync-123.log",
        reportPath: "/tmp/paperclip/kits/fork-sync/jobs/kit-sync-123-report.json",
        skillPath: "/tmp/paperclip/kits/fork-sync/jobs/kit-sync-123-skill.md",
        error: null,
        summary: null,
      },
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

  it("downloads a non-default custom workspace kit from the same filtered list", async () => {
    listBundledKitsMock.mockReturnValue([
      {
        id: "growthub-open-higgsfield-studio-v1",
        family: "studio",
        name: "Growthub Agent Worker Kit - Open Higgsfield Studio",
        version: "1.0.0",
        description: "Self-contained local execution environment for Open Higgsfield.",
        briefType: "open-higgsfield-visual-production",
        executionMode: "export",
        activationModes: ["export"],
        bundleId: "growthub-open-higgsfield-studio-v1",
        bundleVersion: "1.0.0",
        type: "worker",
      },
      {
        id: "growthub-twenty-crm-v1",
        family: "studio",
        name: "Growthub Agent Worker Kit - Twenty CRM",
        version: "1.0.0",
        description: "Self-contained local execution environment for Twenty CRM.",
        briefType: "twenty-crm-growth-stack",
        executionMode: "export",
        activationModes: ["export"],
        bundleId: "growthub-twenty-crm-v1",
        bundleVersion: "1.0.0",
        type: "worker",
      },
    ]);

    downloadBundledKitMock.mockImplementation((kitId: string, _out: string | undefined, options: { onProgress?: (progress: { phase: string; percent: number; detail: string }) => void }) => {
      options.onProgress?.({ phase: "copying", percent: 50, detail: `${kitId}:default` });
      options.onProgress?.({ phase: "done", percent: 100, detail: "complete" });
      return {
        folderPath: `/tmp/kits/growthub-agent-worker-kit-${kitId.replace("growthub-", "").replace("-v1", "-v1")}`,
        zipPath: `/tmp/kits/growthub-agent-worker-kit-${kitId.replace("growthub-", "").replace("-v1", "-v1")}.zip`,
      };
    });

    selectMock
      .mockResolvedValueOnce("studio")
      .mockResolvedValueOnce("growthub-twenty-crm-v1")
      .mockResolvedValueOnce("actions")
      .mockResolvedValueOnce("download");
    confirmMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const { runInteractivePicker } = await import("../commands/kit.js");
    const result = await runInteractivePicker({});

    expect(result).toBe("done");
    expect(downloadBundledKitMock).toHaveBeenCalledWith(
      "growthub-twenty-crm-v1",
      undefined,
      expect.objectContaining({
        onProgress: expect.any(Function),
      }),
    );
  });

  it("runs the interactive fork-sync wizard and launches a detached job", async () => {
    selectMock
      .mockResolvedValueOnce("studio")
      .mockResolvedValueOnce("growthub-open-higgsfield-studio-v1")
      .mockResolvedValueOnce("actions")
      .mockResolvedValueOnce("fork-sync");
    confirmMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    textMock
      .mockResolvedValueOnce("/tmp/forks/higgsfield")
      .mockResolvedValueOnce("my-higgsfield-fork")
      .mockResolvedValueOnce("main")
      .mockResolvedValueOnce("sync");

    const { runInteractivePicker } = await import("../commands/kit.js");
    const result = await runInteractivePicker({});

    expect(result).toBe("done");
    expect(registerKitForkMock).toHaveBeenCalledWith({
      forkId: "my-higgsfield-fork",
      kitId: "growthub-open-higgsfield-studio-v1",
      forkPath: "/tmp/forks/higgsfield",
      baseBranch: "main",
      branchPrefix: "sync",
    });
    expect(planKitForkSyncMock).toHaveBeenCalledWith("my-higgsfield-fork");
    expect(startKitForkSyncJobMock).toHaveBeenCalledWith("my-higgsfield-fork");
    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("Fork sync agent flow completed."));

    const printedOutput = consoleLogSpy.mock.calls.flat().join("\n");
    expect(printedOutput).toContain("Fork sync plan");
    expect(printedOutput).toContain("kit-sync-123");
  });
});
