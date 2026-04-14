import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spinnerStart = vi.fn();
const spinnerStop = vi.fn();
const fetchHostedCreditsMock = vi.fn(async () => ({
  totalAvailable: 34.5,
  creditsUsedThisPeriod: 0.05,
  creditsPerMonth: 100,
}));
const saveHostedWorkflowMock = vi.fn(async () => ({
  workflowId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
}));
const executeWorkflowMock = vi.fn(async (_input, opts?: { onEvent?: (event: Record<string, unknown>) => Promise<void> | void }) => {
  await opts?.onEvent?.({ type: "node_start", nodeId: "node_e3480038977c" });
  await opts?.onEvent?.({ type: "node_complete", nodeId: "node_e3480038977c" });
  return {
    executionId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
    threadId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
    status: "succeeded",
    startedAt: "2026-04-14T05:00:00.000Z",
    completedAt: "2026-04-14T05:00:36.000Z",
    nodeResults: {
      node_e3480038977c: {
        slug: "image-generation",
        status: "succeeded",
      },
    },
    artifacts: [
      { artifactId: "images/foo.png", artifactType: "image", nodeId: "node_e3480038977c" },
    ],
    summary: {
      imageCount: 1,
      workflowRunId: "f26e66be-5f4a-469c-85b6-ec49243f564c",
      keyboardShortcutHint: "Open the full run in Growthub if you want the expanded UI view.",
    },
  };
});

vi.mock("@clack/prompts", () => ({
  spinner: () => ({
    start: spinnerStart,
    stop: spinnerStop,
  }),
  log: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
  intro: vi.fn(),
  note: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  isCancel: () => false,
}));

vi.mock("../auth/session-store.js", () => ({
  readSession: () => ({
    hostedBaseUrl: "http://localhost:3000",
    accessToken: "tok",
    userId: "9dd7fa1b-1491-46da-962f-f2fe7342d013",
    expiresAt: "2099-01-01T00:00:00.000Z",
  }),
  isSessionExpired: () => false,
}));

vi.mock("../auth/hosted-client.js", () => ({
  fetchHostedCredits: fetchHostedCreditsMock,
  saveHostedWorkflow: saveHostedWorkflowMock,
  HostedEndpointUnavailableError: class HostedEndpointUnavailableError extends Error {},
}));

vi.mock("../runtime/hosted-execution-client/index.js", () => ({
  createHostedExecutionClient: () => ({
    executeWorkflow: executeWorkflowMock,
  }),
}));

const artifactCreateMock = vi.fn();

vi.mock("../runtime/artifact-contracts/index.js", () => ({
  createArtifactStore: () => ({
    create: artifactCreateMock,
  }),
}));

vi.mock("../auth/workflow-access.js", () => ({
  getWorkflowAccess: () => ({ state: "ready", reason: "" }),
}));

vi.mock("../utils/banner.js", () => ({
  printPaperclipCliBanner: vi.fn(),
}));

describe("executeHostedPipeline", () => {
  const stdoutWrite = vi.spyOn(process.stdout, "write");
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    spinnerStart.mockReset();
    spinnerStop.mockReset();
    fetchHostedCreditsMock.mockClear();
    saveHostedWorkflowMock.mockClear();
    executeWorkflowMock.mockClear();
    stdoutWrite.mockClear();
    consoleLog.mockClear();
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("shows startup loading, progress, summary, and credits for hosted execution", async () => {
    const { executeHostedPipeline } = await import("../commands/pipeline.js");

    await executeHostedPipeline({
      pipelineId: "pipe_d37338d337f40b76",
      threadId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
      executionMode: "hosted",
      nodes: [
        {
          id: "node_e3480038977c",
          slug: "image-generation",
          bindings: {
            prompt: "Create a polished software product hero image.",
          },
        },
      ],
      metadata: {
        workflowName: "Image Generation Workflow",
      },
    });

    expect(spinnerStart).toHaveBeenCalledWith("Preparing hosted workflow execution...");
    expect(spinnerStop).toHaveBeenCalledWith("Hosted workflow execution started.");
    const writes = stdoutWrite.mock.calls.map((call) => String(call[0]));
    expect(writes.some((line) => line.includes("Workflow run"))).toBe(true);
    expect(writes.some((line) => line.includes("100%"))).toBe(true);
    const logs = consoleLog.mock.calls.map((call) => call.join(" "));
    expect(logs.some((line) => line.includes("Pipeline Execution Result"))).toBe(true);
    expect(logs.some((line) => line.includes("workflow_run_id: f26e66be-5f4a-469c-85b6-ec49243f564c"))).toBe(true);
    expect(logs.some((line) => line.includes("Credits:"))).toBe(true);
    expect(logs.some((line) => line.includes("available: $34.50"))).toBe(true);
  });
});
