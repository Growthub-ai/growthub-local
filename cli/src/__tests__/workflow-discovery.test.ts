import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectCalls: Array<Record<string, unknown>> = [];
const confirmCalls: Array<Record<string, unknown>> = [];
const textCalls: Array<Record<string, unknown>> = [];
const spinnerStart = vi.fn();
const spinnerStop = vi.fn();
const selectQueue: unknown[] = [];
const confirmQueue: boolean[] = [];
const textQueue: string[] = [];

const executeHostedPipelineMock = vi.fn(async () => {});
const saveHostedWorkflowMock = vi.fn(async (_session: unknown, payload: { name: string }) => ({
  workflowId: `wf-${payload.name.toLowerCase().replace(/\s+/g, "-")}`,
  version: 1,
}));
const listHostedWorkflowsMock = vi.fn(async () => ({
  workflows: [
    {
      workflowId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
      name: "Image Generation Workflow",
      createdAt: "2026-04-14T04:48:49.418228+00:00",
      updatedAt: "2026-04-14T05:00:00.000000+00:00",
      versionCount: 1,
      latestVersion: {
        createdAt: "2026-04-14T04:48:49.418228+00:00",
        nodeCount: 3,
        config: {
          nodes: [
            { id: "start-1", type: "start", data: {} },
            { id: "node_e3480038977c", type: "cmsNode", data: { slug: "image-generation", inputs: { prompt: "hello" } } },
            { id: "end-1", type: "end", data: {} },
          ],
          edges: [
            { id: "e-start-1-node_e3480038977c", source: "start-1", target: "node_e3480038977c" },
            { id: "e-node_e3480038977c-end-1", source: "node_e3480038977c", target: "end-1" },
          ],
        },
      },
    },
  ],
}));
const fetchHostedWorkflowMock = vi.fn(async () => ({
  latestVersion: {
    createdAt: "2026-04-14T04:48:49.418228+00:00",
    config: {
      nodes: [
        { id: "start-1", type: "start", data: {} },
        { id: "node_e3480038977c", type: "cmsNode", data: { slug: "image-generation", inputs: { prompt: "hello" } } },
        { id: "end-1", type: "end", data: {} },
      ],
      edges: [
        { id: "e-start-1-node_e3480038977c", source: "start-1", target: "node_e3480038977c" },
        { id: "e-node_e3480038977c-end-1", source: "node_e3480038977c", target: "end-1" },
      ],
    },
  },
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  log: { error: vi.fn(), success: vi.fn() },
  spinner: () => ({
    start: spinnerStart,
    stop: spinnerStop,
  }),
  select: vi.fn(async (args: Record<string, unknown>) => {
    selectCalls.push(args);
    if (selectQueue.length === 0) {
      throw new Error("select queue exhausted");
    }
    return selectQueue.shift();
  }),
  confirm: vi.fn(async (args: Record<string, unknown>) => {
    confirmCalls.push(args);
    if (confirmQueue.length === 0) {
      throw new Error("confirm queue exhausted");
    }
    return confirmQueue.shift();
  }),
  text: vi.fn(async (args: Record<string, unknown>) => {
    textCalls.push(args);
    if (textQueue.length === 0) {
      throw new Error("text queue exhausted");
    }
    return textQueue.shift();
  }),
  multiselect: vi.fn(),
  isCancel: (value: unknown) => value === "__cancel__",
}));

vi.mock("../auth/workflow-access.js", () => ({
  getWorkflowAccess: () => ({ state: "ready", reason: "" }),
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
  HostedEndpointUnavailableError: class HostedEndpointUnavailableError extends Error {},
  listHostedWorkflows: listHostedWorkflowsMock,
  fetchHostedWorkflow: fetchHostedWorkflowMock,
  saveHostedWorkflow: saveHostedWorkflowMock,
}));

vi.mock("../runtime/cms-capability-registry/index.js", () => ({
  CAPABILITY_FAMILIES: ["image", "video", "slides", "text", "research"],
  createCmsCapabilityRegistryClient: () => ({
    listBuiltinCapabilities: (query?: { family?: string }) => {
      const nodes = [
        {
          slug: "image-generation",
          displayName: "Image Generation",
          icon: "🎨",
          family: "image",
          description: "Generate images with brand assets.",
          category: "automation",
          nodeType: "tool_execution",
          executionBinding: { strategy: "direct" },
          executionTokens: { input_template: { prompt: "", brandKitId: "", imageModel: "gpt-image-1" }, tool_name: "image_generation" },
          requiredBindings: ["provider-api-key"],
          outputTypes: ["image"],
          enabled: true,
        },
        {
          slug: "video-generation",
          displayName: "Video Generation",
          icon: "🎥",
          family: "video",
          description: "Generate AI videos.",
          category: "automation",
          nodeType: "tool_execution",
          executionBinding: { strategy: "sequential-with-persistence" },
          executionTokens: { input_template: { prompt: "", seconds: "4", videoModel: "sora-2" }, tool_name: "video_generation" },
          requiredBindings: ["provider-api-key"],
          outputTypes: ["video"],
          enabled: true,
        },
        {
          slug: "slides-generation",
          displayName: "Slides Generation",
          icon: "💻",
          family: "slides",
          description: "Generate presentation slides.",
          category: "automation",
          nodeType: "tool_execution",
          executionBinding: { strategy: "direct" },
          executionTokens: { input_template: { prompt: "", slideCount: 6 }, tool_name: "slides_generation" },
          requiredBindings: ["provider-api-key"],
          outputTypes: ["slides"],
          enabled: true,
        },
        {
          slug: "llm-text-generation",
          displayName: "LLM Text Generation",
          icon: "🤖",
          family: "text",
          description: "Generate text using any AI model provider.",
          category: "automation",
          nodeType: "tool_execution",
          executionBinding: { strategy: "direct" },
          executionTokens: { input_template: { prompt: "", modelId: "" }, tool_name: "llm_text_generation" },
          requiredBindings: ["provider-api-key"],
          outputTypes: ["text"],
          enabled: true,
        },
        {
          slug: "deep-research-perplexity",
          displayName: "Deep Research (Perplexity Sonar)",
          icon: "🔍",
          family: "research",
          description: "Run deep research with Perplexity.",
          category: "automation",
          nodeType: "cms_workflow",
          executionBinding: { strategy: "direct" },
          executionTokens: { input_template: { query: "", model: "sonar" }, tool_name: "deep_research_perplexity" },
          requiredBindings: ["provider-api-key"],
          outputTypes: ["text"],
          enabled: true,
        },
      ];
      return {
        nodes: query?.family ? nodes.filter((node) => node.family === query.family) : nodes,
      };
    },
  }),
}));

vi.mock("../commands/pipeline.js", () => ({
  runPipelineAssembler: vi.fn(),
  executeHostedPipeline: executeHostedPipelineMock,
}));

vi.mock("../utils/banner.js", () => ({
  printPaperclipCliBanner: vi.fn(),
}));

describe("workflow discovery CLI", () => {
  beforeEach(() => {
    selectCalls.length = 0;
    confirmCalls.length = 0;
    textCalls.length = 0;
    selectQueue.length = 0;
    confirmQueue.length = 0;
    textQueue.length = 0;
    spinnerStart.mockReset();
    spinnerStop.mockReset();
    executeHostedPipelineMock.mockClear();
    listHostedWorkflowsMock.mockClear();
    fetchHostedWorkflowMock.mockClear();
    saveHostedWorkflowMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the workflows menu without capabilities", async () => {
    selectQueue.push("__back_to_hub");
    const { runWorkflowPicker } = await import("../commands/workflow.js");

    const result = await runWorkflowPicker({ allowBackToHub: true });

    expect(result).toBe("back");
    const topChoice = selectCalls[0];
    const labels = ((topChoice.options as Array<{ label: string }>).map((option) => option.label));
    expect(labels).toContain("Saved Workflows");
    expect(labels).toContain("Templates");
    expect(labels).toContain("🔗 Dynamic Pipelines");
    expect(labels.some((label) => String(label).includes("Capabilities"))).toBe(false);
  });

  it("loads and executes a saved workflow with both confirmation prompts", async () => {
    selectQueue.push(
      "saved",
      "b725dceb-1993-4af8-a1b2-75af9d348a00",
      "execute",
      "__back",
      "__back_to_hub",
    );
    confirmQueue.push(true, true);

    const { runWorkflowPicker } = await import("../commands/workflow.js");
    const result = await runWorkflowPicker({ allowBackToHub: true });

    expect(result).toBe("back");
    expect(spinnerStart).toHaveBeenCalledWith("Loading saved workflows...");
    expect(spinnerStart).toHaveBeenCalledWith("Loading Image Generation Workflow...");
    expect(spinnerStop).toHaveBeenCalledWith("Loaded 1 saved workflow.");
    expect(spinnerStop).toHaveBeenCalledWith("Loaded Image Generation Workflow.");
    expect(confirmCalls.map((call) => call.message)).toEqual([
      "Execute Image Generation Workflow now?",
      "This will run the hosted workflow and may spend credits. Continue?",
    ]);
    expect(executeHostedPipelineMock).toHaveBeenCalledTimes(1);
    expect(executeHostedPipelineMock.mock.calls[0]?.[0]).toMatchObject({
      executionMode: "hosted",
      metadata: {
        hostedWorkflowId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
        workflowName: "Image Generation Workflow",
      },
    });
  });

  it("assembles and saves multiple workflow templates through the CLI template flow", async () => {
    textQueue.push(
      "Generate a campaign image",
      "brand-kit-1",
      "Generate a product launch video",
      "Write landing page copy",
      "gemini-3.1-pro-preview",
      "Research competitor positioning",
    );
    selectQueue.push(
      "templates",
      "image",
      "image-generation",
      "assemble",
      "save",
      "__back",
      "video",
      "video-generation",
      "assemble",
      "save",
      "__back",
      "text",
      "llm-text-generation",
      "assemble",
      "save",
      "__back",
      "research",
      "deep-research-perplexity",
      "assemble",
      "save",
      "__back",
      "__back_to_workflow_menu",
      "__back_to_hub",
    );

    const { runWorkflowPicker } = await import("../commands/workflow.js");
    const result = await runWorkflowPicker({ allowBackToHub: true });

    expect(result).toBe("back");
    expect(saveHostedWorkflowMock).toHaveBeenCalledTimes(4);
    expect(saveHostedWorkflowMock.mock.calls.map((call) => call[1]?.name ?? call[0]?.name)).toEqual([
      "Image Generation Workflow",
      "Video Generation Workflow",
      "LLM Text Generation Workflow",
      "Deep Research (Perplexity Sonar) Workflow",
    ]);

    const savedConfigs = saveHostedWorkflowMock.mock.calls.map((call) => (call[1] ?? call[0]).config);
    expect(savedConfigs[0]).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          type: "cmsNode",
          data: expect.objectContaining({
            slug: "image-generation",
            inputs: expect.objectContaining({
              prompt: "Generate a campaign image",
              brandKitId: "brand-kit-1",
            }),
          }),
        }),
      ]),
    });
    expect(savedConfigs[1]).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          type: "cmsNode",
          data: expect.objectContaining({
            slug: "video-generation",
            inputs: expect.objectContaining({
              prompt: "Generate a product launch video",
              seconds: "4",
            }),
          }),
        }),
      ]),
    });
    expect(savedConfigs[2]).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          type: "cmsNode",
          data: expect.objectContaining({
            slug: "llm-text-generation",
            inputs: expect.objectContaining({
              prompt: "Write landing page copy",
            }),
          }),
        }),
      ]),
    });
    expect(savedConfigs[3]).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          type: "cmsNode",
          data: expect.objectContaining({
            slug: "deep-research-perplexity",
            inputs: expect.objectContaining({
              query: "Research competitor positioning",
            }),
          }),
        }),
      ]),
    });
  });
});
