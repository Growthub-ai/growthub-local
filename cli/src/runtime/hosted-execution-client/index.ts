/**
 * Hosted Execution Client
 *
 * Wraps the hosted app's canonical execution surfaces so the CLI / local
 * runtime can call them safely with the authenticated bridge session.
 *
 * This module reuses:
 *   - auth/session-store (CliAuthSession) for the bearer token
 *   - client/http (PaperclipApiClient) for typed HTTP transport
 *   - auth/hosted-client patterns for error handling (404/501 fallback)
 *
 * Hosted targets (grounded by what already exists):
 *   GET  /api/cli/session          — session validation
 *   GET  /api/cli/profile          — hosted profile + capabilities
 *   POST /api/execute-workflow     — workflow execution
 *   POST /api/sandbox/provider-report — provider assembly
 */

import { PaperclipApiClient, ApiRequestError } from "../../client/http.js";
import { readSession, isSessionExpired, type CliAuthSession } from "../../auth/session-store.js";
import { readHostedOverlay } from "../../auth/overlay-store.js";
import { randomUUID } from "node:crypto";
import type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedExecutionArtifactRef,
  HostedNodeResult,
  HostedProviderAssemblyInput,
  HostedProviderAssemblyResult,
  HostedProfile,
  HostedCapabilityRecord,
} from "./types.js";

export type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedProviderAssemblyInput,
  HostedProviderAssemblyResult,
  HostedProfile,
  HostedCapabilityRecord,
  HostedExecuteNodePayload,
  HostedNodeResult,
  HostedExecutionArtifactRef,
  HostedProviderRecord,
} from "./types.js";

// ---------------------------------------------------------------------------
// Hosted endpoint paths
// ---------------------------------------------------------------------------

const EXECUTE_PATH = "/api/execute-workflow";
const THREAD_BIND_PATH = "/api/projects/threads/bind";
const PROVIDER_REPORT_PATH = "/api/sandbox/provider-report";
const PROFILE_PATH = "/api/cli/profile";
const CAPABILITIES_PATH = "/api/cli/capabilities";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HostedExecutionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NoActiveSessionError extends Error {
  constructor() {
    super(
      "No active hosted session. Run `growthub auth login` to authenticate.",
    );
  }
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

function requireSession(): CliAuthSession {
  const session = readSession();
  if (!session) throw new NoActiveSessionError();
  if (isSessionExpired(session)) {
    throw new HostedExecutionError(
      401,
      "Hosted session expired. Run `growthub auth login` to re-authenticate.",
    );
  }
  return session;
}

function clientFromSession(session: CliAuthSession): PaperclipApiClient {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken,
    userId: session.userId,
  });
}

// ---------------------------------------------------------------------------
// Guard helper — treats 404/501 as "endpoint not deployed yet"
// ---------------------------------------------------------------------------

function isUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.status === 404 || err.status === 501)
  );
}

// ---------------------------------------------------------------------------
// Hosted Execution Client
// ---------------------------------------------------------------------------

export interface HostedExecutionClient {
  executeWorkflow(
    input: HostedExecuteWorkflowInput,
    opts?: { onEvent?: (event: ExecuteWorkflowEvent) => void | Promise<void> },
  ): Promise<HostedExecuteWorkflowResult>;
  runProviderAssembly(input: HostedProviderAssemblyInput): Promise<HostedProviderAssemblyResult>;
  getHostedProfile(): Promise<HostedProfile>;
  getHostedCapabilities(): Promise<HostedCapabilityRecord[]>;
}

type ExecuteWorkflowEvent = {
  type?: string;
  nodeId?: string;
  output?: Record<string, unknown>;
  error?: string;
  executionId?: string;
  executionLog?: Array<Record<string, unknown>>;
};

type HostedExecuteWorkflowRequest = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  userId: string;
  workflowId: string;
  threadId: string;
  userPrompt?: string;
};

export function isPlaceholderString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("enter ") ||
    normalized.startsWith("select ") ||
    normalized === "placeholder"
  );
}

function sanitizeBindingValue(value: unknown): unknown {
  if (typeof value === "string") {
    return isPlaceholderString(value) ? "" : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBindingValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeBindingValue(entry)]),
    );
  }
  return value;
}

function sanitizeBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bindings).map(([key, value]) => [key, sanitizeBindingValue(value)]),
  );
}

async function buildExecutionGraph(
  input: HostedExecuteWorkflowInput,
  session: CliAuthSession,
): Promise<HostedExecuteWorkflowRequest> {
  const workflowId = input.workflowId?.trim() || input.threadId?.trim() || input.pipelineId;
  const threadId = await resolveExecutionThreadId(input, session, workflowId);
  const userId = session.userId?.trim();

  if (!userId) {
    throw new HostedExecutionError(401, "Hosted session is missing the authenticated user id.");
  }

  const cmsNodes = input.nodes.map((node, index) => ({
    id: node.nodeId,
    type: "cmsNode",
    position: { x: (index + 1) * 300, y: 0 },
    data: {
      slug: node.slug,
      inputs: sanitizeBindings(node.bindings),
    },
  }));

  const nodes: Array<Record<string, unknown>> = [
    { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: {} },
    ...cmsNodes,
    {
      id: "end-1",
      type: "end",
      position: { x: (cmsNodes.length + 1) * 300, y: 0 },
      data: {},
    },
  ];
  const edges: Array<Record<string, unknown>> = [];

  for (const node of input.nodes) {
    const upstreamNodeIds = node.upstreamNodeIds ?? [];
    if (upstreamNodeIds.length === 0) {
      edges.push({
        id: `e-start-1-${node.nodeId}`,
        source: "start-1",
        target: node.nodeId,
      });
      continue;
    }

    for (const upstreamNodeId of upstreamNodeIds) {
      edges.push({
        id: `e-${upstreamNodeId}-${node.nodeId}`,
        source: upstreamNodeId,
        target: node.nodeId,
      });
    }
  }

  const upstreamSources = new Set(
    input.nodes.flatMap((node) => node.upstreamNodeIds ?? []),
  );

  for (const node of input.nodes) {
    if (!upstreamSources.has(node.nodeId)) {
      edges.push({
        id: `e-${node.nodeId}-end-1`,
        source: node.nodeId,
        target: "end-1",
      });
    }
  }

  const userPrompt = inferUserPrompt(input);

  return {
    nodes,
    edges,
    userId,
    workflowId,
    threadId,
    ...(userPrompt ? { userPrompt } : {}),
  };
}

async function resolveExecutionThreadId(
  input: HostedExecuteWorkflowInput,
  session: CliAuthSession,
  workflowId: string,
): Promise<string> {
  const candidate = input.threadId?.trim();
  if (candidate) {
    if (!isUuid(candidate)) {
      throw new HostedExecutionError(
        400,
        `Invalid thread id "${candidate}". Hosted workflow execution requires a real UUID thread id.`,
      );
    }
    return candidate;
  }

  if (isUuid(workflowId)) {
    return workflowId;
  }

  return await createHostedThread(session);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function createHostedThread(session: CliAuthSession): Promise<string> {
  const userId = session.userId?.trim();
  if (!userId) {
    throw new HostedExecutionError(401, "Hosted session is missing the authenticated user id.");
  }

  const threadId = randomUUID();
  const response = await fetch(new URL(THREAD_BIND_PATH, `${session.hostedBaseUrl.replace(/\/+$/, "")}/`).toString(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "x-user-id": userId,
    },
    body: JSON.stringify({ threadId }),
  });

  if (!response.ok) {
    throw await toHostedExecutionError(response);
  }

  return threadId;
}

function inferUserPrompt(input: HostedExecuteWorkflowInput): string | undefined {
  if (typeof input.userPrompt === "string" && input.userPrompt.trim().length > 0) {
    return input.userPrompt.trim();
  }

  const promptKeys = ["prompt", "userPrompt", "query", "instruction", "instructions"];
  for (const node of input.nodes) {
    for (const key of promptKeys) {
      const promptValue = node.bindings[key];
      if (
        typeof promptValue === "string" &&
        promptValue.trim().length > 0 &&
        !isPlaceholderString(promptValue)
      ) {
        return promptValue.trim();
      }
    }
  }
  return undefined;
}

function safeParseJson(line: string): ExecuteWorkflowEvent | null {
  try {
    return JSON.parse(line) as ExecuteWorkflowEvent;
  } catch {
    return null;
  }
}

async function executeWorkflowStream(
  request: HostedExecuteWorkflowRequest,
  session: CliAuthSession,
  opts?: { onEvent?: (event: ExecuteWorkflowEvent) => void | Promise<void> },
): Promise<HostedExecuteWorkflowResult> {
  const response = await fetch(new URL(EXECUTE_PATH, `${session.hostedBaseUrl.replace(/\/+$/, "")}/`).toString(), {
    method: "POST",
    headers: {
      accept: "text/plain",
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "x-user-id": request.userId,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await toHostedExecutionError(response);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new HostedExecutionError(502, "Hosted workflow endpoint returned no stream body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let executionId = request.workflowId;
  let executionLog: Array<Record<string, unknown>> | null = null;
  const nodeResults = new Map<string, HostedNodeResult>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const event = safeParseJson(line);
        if (event) {
          await opts?.onEvent?.(event);
          applyWorkflowEvent(event, nodeResults, request);
          if (typeof event.executionId === "string" && event.executionId.trim()) {
            executionId = event.executionId;
          }
          if (event.type === "complete" && Array.isArray(event.executionLog)) {
            executionLog = event.executionLog;
          }
          if (event.type === "error") {
            throw new HostedExecutionError(500, event.error || "Workflow execution failed.");
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const event = safeParseJson(trailing);
    if (event) {
      await opts?.onEvent?.(event);
      applyWorkflowEvent(event, nodeResults, request);
      if (typeof event.executionId === "string" && event.executionId.trim()) {
        executionId = event.executionId;
      }
      if (event.type === "complete" && Array.isArray(event.executionLog)) {
        executionLog = event.executionLog;
      }
      if (event.type === "error") {
        throw new HostedExecutionError(500, event.error || "Workflow execution failed.");
      }
    }
  }

  if (!executionLog) {
    throw new HostedExecutionError(502, "Workflow stream ended without a completion event.");
  }

  const artifacts = collectArtifacts(executionLog);
  const summary = summarizeExecution(executionLog);
  const status = executionLog.some((entry) => typeof entry.error === "string" && entry.error.length > 0)
    ? "failed"
    : "succeeded";

  return {
    executionId,
    threadId: request.threadId,
    status,
    nodeResults: Object.fromEntries(nodeResults.entries()),
    artifacts,
    executionLog,
    summary,
  };
}

function applyWorkflowEvent(
  event: ExecuteWorkflowEvent,
  nodeResults: Map<string, HostedNodeResult>,
  request: HostedExecuteWorkflowRequest,
): void {
  if (!event.nodeId) return;

  const current = nodeResults.get(event.nodeId);
  const next: HostedNodeResult = current ?? {
    nodeId: event.nodeId,
    slug: resolveNodeSlug(request, event.nodeId),
    status: "pending",
  };

  if (event.type === "node_start") {
    next.status = "running";
  } else if (event.type === "node_complete") {
    next.status = "succeeded";
    next.output = event.output;
  } else if (event.type === "node_error") {
    next.status = "failed";
    next.error = event.error;
  }

  nodeResults.set(event.nodeId, next);
}

function collectArtifacts(
  executionLog: Array<Record<string, unknown>>,
): HostedExecutionArtifactRef[] {
  const artifacts: HostedExecutionArtifactRef[] = [];

  for (const entry of executionLog) {
    if (entry.type !== "cmsNode" || typeof entry.nodeId !== "string") continue;
    const output = entry.output;
    if (typeof output !== "object" || output === null) continue;
    const record = output as Record<string, unknown>;

    const images = Array.isArray(record.images) ? record.images : [];
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const imageRecord = image as Record<string, unknown>;
      const storagePath = typeof imageRecord.storage_path === "string" ? imageRecord.storage_path : undefined;
      artifacts.push({
        artifactId: storagePath ?? `${entry.nodeId}-image-${artifacts.length + 1}`,
        artifactType: "image",
        nodeId: entry.nodeId,
        url: typeof imageRecord.url === "string" ? imageRecord.url : undefined,
        storagePath,
        metadata: imageRecord,
      });
    }

    const slides = Array.isArray(record.slides) ? record.slides : [];
    for (const slide of slides) {
      if (!slide || typeof slide !== "object") continue;
      const slideRecord = slide as Record<string, unknown>;
      const storagePath = typeof slideRecord.storage_path === "string" ? slideRecord.storage_path : undefined;
      artifacts.push({
        artifactId: storagePath ?? `${entry.nodeId}-slide-${artifacts.length + 1}`,
        artifactType: "slides",
        nodeId: entry.nodeId,
        url: typeof slideRecord.url === "string" ? slideRecord.url : undefined,
        storagePath,
        metadata: slideRecord,
      });
    }
  }

  return artifacts;
}

function resolveNodeSlug(
  request: HostedExecuteWorkflowRequest,
  nodeId: string,
): string {
  const match = request.nodes.find((node) => node.id === nodeId);
  if (!match || typeof match.data !== "object" || match.data === null) {
    return nodeId;
  }
  const slug = (match.data as Record<string, unknown>).slug;
  return typeof slug === "string" && slug.trim().length > 0 ? slug : nodeId;
}

function summarizeExecution(
  executionLog: Array<Record<string, unknown>>,
): HostedExecuteWorkflowResult["summary"] {
  let outputText: string | undefined;
  let imageCount = 0;
  let slideCount = 0;
  let videoCount = 0;
  let workflowRunId: string | undefined;

  for (const entry of executionLog) {
    if (!workflowRunId && typeof entry.workflowRunId === "string") {
      workflowRunId = entry.workflowRunId;
    }
    const output = entry.output;
    if (typeof output !== "object" || output === null) continue;
    const record = output as Record<string, unknown>;

    if (!outputText && typeof record.text === "string" && record.text.trim().length > 0) {
      outputText = record.text.trim();
    }
    if (Array.isArray(record.images)) imageCount += record.images.length;
    if (Array.isArray(record.slides)) slideCount += record.slides.length;
    if (Array.isArray(record.videos)) videoCount += record.videos.length;
  }

  return {
    ...(outputText ? { outputText } : {}),
    ...(imageCount > 0 ? { imageCount } : {}),
    ...(slideCount > 0 ? { slideCount } : {}),
    ...(videoCount > 0 ? { videoCount } : {}),
    ...(workflowRunId ? { workflowRunId } : {}),
    keyboardShortcutHint: "Open the full run in Growthub if you want the expanded UI view.",
  };
}

async function toHostedExecutionError(response: Response): Promise<HostedExecutionError> {
  let message = `Request failed with status ${response.status}`;

  try {
    const text = await response.text();
    if (text.trim()) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        message = parsed.error;
      } else if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      } else {
        message = text;
      }
    }
  } catch {
    // Use default message on parse failure.
  }

  return new HostedExecutionError(response.status, message);
}

export function createHostedExecutionClient(): HostedExecutionClient {
  return {
    async executeWorkflow(input, opts) {
      const session = requireSession();
      try {
        const request = await buildExecutionGraph(input, session);
        return await executeWorkflowStream(request, session, opts);
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Hosted execution endpoint is not available. Ensure the hosted app supports /api/execute-workflow.",
          );
        }
        throw err;
      }
    },

    async runProviderAssembly(input) {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.post<HostedProviderAssemblyResult>(PROVIDER_REPORT_PATH, input);
        if (!result) {
          throw new HostedExecutionError(502, "Empty response from provider assembly endpoint.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Provider assembly endpoint is not available. Ensure the hosted app supports /api/sandbox/provider-report.",
          );
        }
        throw err;
      }
    },

    async getHostedProfile() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get<HostedProfile>(PROFILE_PATH);
        if (!result) {
          // Fall back to locally cached overlay
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults,
            };
          }
          throw new HostedExecutionError(502, "No hosted profile available and no local overlay cached.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults,
            };
          }
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Hosted profile endpoint not available and no local overlay cached.",
          );
        }
        throw err;
      }
    },

    async getHostedCapabilities() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get<HostedCapabilityRecord[]>(CAPABILITIES_PATH);
        return result ?? [];
      } catch (err) {
        if (isUnavailable(err)) {
          // Endpoint not deployed — return empty so callers degrade gracefully
          return [];
        }
        throw err;
      }
    },
  };
}
