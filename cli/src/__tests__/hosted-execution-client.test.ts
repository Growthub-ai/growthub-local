import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/session-store.js", () => ({
  readSession: () => ({
    hostedBaseUrl: "http://localhost:3000",
    accessToken: "tok",
    userId: "9dd7fa1b-1491-46da-962f-f2fe7342d013",
    expiresAt: "2099-01-01T00:00:00.000Z",
  }),
  isSessionExpired: () => false,
}));

vi.mock("../auth/overlay-store.js", () => ({
  readHostedOverlay: () => null,
}));

vi.mock("../client/http.js", () => ({
  PaperclipApiClient: class PaperclipApiClient {
    async get() {
      return {};
    }
    async post() {
      return {};
    }
  },
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message = "error") {
      super(message);
      this.status = status;
    }
  },
}));

describe("hosted execution client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sanitizes placeholder bindings and infers a real user prompt for hosted execution", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({
              type: "complete",
              executionId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
              executionLog: [
                { nodeId: "start-1", type: "start", output: "Workflow started" },
                {
                  nodeId: "node_img_1",
                  type: "cmsNode",
                  output: {
                    thread_id: "b725dceb-1993-4af8-a1b2-75af9d348a00",
                    images: [{ url: "/api/secure-image?path=file.png" }],
                    ui_message_parts: [{ type: "text", text: "MCP tool execution complete." }],
                  },
                },
                { nodeId: "end-1", type: "end", output: { finalOutput: { ok: true } } },
              ],
            })}\n`,
          ),
        );
        controller.close();
      },
    });

    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });

    const { createHostedExecutionClient } = await import("../runtime/hosted-execution-client/index.js");
    const client = createHostedExecutionClient();

    await client.executeWorkflow({
      pipelineId: "pipe_d37338d337f40b76",
      workflowId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
      threadId: "b725dceb-1993-4af8-a1b2-75af9d348a00",
      executionMode: "hosted",
      metadata: {},
      nodes: [
        {
          nodeId: "node_img_1",
          slug: "image-generation",
          bindings: {
            prompt: "Create a polished software product hero image.",
            brandKitId: "Enter brandKitId",
            referenceImages: [{ url: "file:///Users/antonio/Desktop/ref.png", type: "reference" }],
          },
        },
      ],
    });

    expect(requestBody?.userPrompt).toBe("Create a polished software product hero image.");
    const cmsNode = (requestBody?.nodes as Array<Record<string, unknown>>)[1];
    expect((cmsNode.data as Record<string, unknown>).inputs).toMatchObject({
      prompt: "Create a polished software product hero image.",
      brandKitId: "",
      referenceImages: [{ url: "file:///Users/antonio/Desktop/ref.png", type: "reference" }],
    });
  });
});
