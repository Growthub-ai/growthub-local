/**
 * @paperclipai/plugin-sdk — stub for open-source development.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface HostServices {
  getCompany(): Promise<Company>;
  getAgents(): Promise<Agent[]>;
  getProjects(): Promise<Project[]>;
  getIssues(projectId: string): Promise<Issue[]>;
  getGoals(projectId: string): Promise<Goal[]>;
}

export interface Company {
  id: string;
  name: string;
  prefix: string;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
}

export interface Project {
  id: string;
  name: string;
  prefix: string;
}

export interface Issue {
  id: string;
  title: string;
  status: string;
  projectId: string;
}

export interface Goal {
  id: string;
  title: string;
  projectId: string;
}

export interface PluginWorkspace {
  rootPath: string;
  name: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  body: string;
  authorId?: string;
  createdAt?: string;
}

export interface PluginEvent {
  type: string;
  payload: unknown;
}

export interface EventFilter {
  types?: string[];
}

export interface ToolRunContext {
  workspaceRoot: string;
  env: Record<string, string>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ExecuteToolParams {
  toolName: string;
  args: Record<string, unknown>;
  context: ToolRunContext;
}

// ── JSON-RPC types ──────────────────────────────────────────────────

export type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: string;
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcRequest {
  jsonrpc: string;
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: string;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type HostToWorkerMethodName = string;
export type HostToWorkerMethods = Record<string, (...args: unknown[]) => unknown>;
export type WorkerToHostMethodName = string;
export type WorkerToHostMethods = Record<string, (...args: unknown[]) => unknown>;

export interface InitializeParams {
  workspaceRoot: string;
  pluginId: string;
  config?: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────────

export const JSONRPC_VERSION = "2.0";

export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export const PLUGIN_RPC_ERROR_CODES = {
  NOT_INITIALIZED: -32000,
  PLUGIN_ERROR: -32001,
} as const;

// ── Functions ───────────────────────────────────────────────────────

export function createRequest(id: JsonRpcId, method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: JSONRPC_VERSION, id, method, params };
}

export function createErrorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, data } };
}

export function parseMessage(raw: string): JsonRpcRequest | JsonRpcResponse | JsonRpcNotification | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.jsonrpc === JSONRPC_VERSION) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeMessage(msg: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): string {
  return JSON.stringify(msg);
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  return typeof msg === "object" && msg !== null && "jsonrpc" in msg && "id" in msg && !("method" in msg);
}

export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  return typeof msg === "object" && msg !== null && "jsonrpc" in msg && "id" in msg && "method" in msg;
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  return typeof msg === "object" && msg !== null && "jsonrpc" in msg && "method" in msg && !("id" in msg);
}

export function isJsonRpcSuccessResponse(msg: unknown): msg is JsonRpcResponse & { result: unknown } {
  return isJsonRpcResponse(msg) && !msg.error;
}

// ── Error classes ───────────────────────────────────────────────────

export class JsonRpcParseError extends Error {
  constructor(message = "JSON-RPC parse error") {
    super(message);
    this.name = "JsonRpcParseError";
  }
}

export class JsonRpcCallError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "JsonRpcCallError";
    this.code = code;
    this.data = data;
  }
}

// ── Host client handlers ────────────────────────────────────────────

export function createHostClientHandlers(): Record<string, (...args: unknown[]) => unknown> {
  return {};
}
