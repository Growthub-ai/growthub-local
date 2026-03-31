export type PluginEvent = any;
export type EventFilter = any;
export type ToolRunContext = any;
export type ToolResult = any;
export type ExecuteToolParams = any;
export type HostServices = any;
export type Company = any;
export type Agent = any;
export type Project = any;
export type Issue = any;
export type Goal = any;
export type PluginWorkspace = any;
export type IssueComment = any;
export type JsonRpcId = any;
export type JsonRpcResponse = any;
export type JsonRpcRequest = any;
export type JsonRpcNotification = any;
export type HostToWorkerMethodName = any;
export type HostToWorkerMethods = any;
export type WorkerToHostMethodName = any;
export type WorkerToHostMethods = any;
export type InitializeParams = any;

export const JSONRPC_VERSION = "2.0";
export const JSONRPC_ERROR_CODES = { PARSE_ERROR: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL_ERROR: -32603 };
export const PLUGIN_RPC_ERROR_CODES = { ...{ PARSE_ERROR: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL_ERROR: -32603 }, TOOL_NOT_FOUND: -32001, TOOL_EXECUTION_FAILED: -32002 };

export function createRequest(..._args: any[]): any { return {}; }
export function createErrorResponse(..._args: any[]): any { return {}; }
export function parseMessage(..._args: any[]): any { return {}; }
export function serializeMessage(..._args: any[]): string { return ""; }
export function isJsonRpcResponse(..._args: any[]): boolean { return false; }
export function isJsonRpcRequest(..._args: any[]): boolean { return false; }
export function isJsonRpcNotification(..._args: any[]): boolean { return false; }
export function isJsonRpcSuccessResponse(..._args: any[]): boolean { return false; }
export function createHostClientHandlers(..._args: any[]): any { return {}; }

export class JsonRpcParseError extends Error {
  constructor(message?: string) { super(message); this.name = "JsonRpcParseError"; }
}

export class JsonRpcCallError extends Error {
  code: number;
  data?: any;
  constructor(message?: string, code?: number, data?: any) {
    super(message);
    this.name = "JsonRpcCallError";
    this.code = code ?? -32603;
    this.data = data;
  }
}
