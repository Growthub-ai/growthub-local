/**
 * JSON-RPC 2.0 message types and protocol helpers for the host ↔ worker IPC
 * channel.
 *
 * The Paperclip plugin runtime uses JSON-RPC 2.0 over stdio to communicate
 * between the host process and each plugin worker process. This module defines:
 *
 * - Core JSON-RPC 2.0 envelope types (request, response, notification, error)
 * - Standard and plugin-specific error codes
 * - Typed method maps for host→worker and worker→host calls
 * - Helper functions for creating well-formed messages
 *
 * @see PLUGIN_SPEC.md §12.1 — Process Model
 * @see PLUGIN_SPEC.md §13 — Host-Worker Protocol
 * @see https://www.jsonrpc.org/specification
 */
// ---------------------------------------------------------------------------
// JSON-RPC 2.0 — Core Protocol Types
// ---------------------------------------------------------------------------
/** The JSON-RPC protocol version. Always `"2.0"`. */
export const JSONRPC_VERSION = "2.0";
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
/**
 * Standard JSON-RPC 2.0 error codes.
 *
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JSONRPC_ERROR_CODES = {
    /** Invalid JSON was received by the server. */
    PARSE_ERROR: -32700,
    /** The JSON sent is not a valid Request object. */
    INVALID_REQUEST: -32600,
    /** The method does not exist or is not available. */
    METHOD_NOT_FOUND: -32601,
    /** Invalid method parameter(s). */
    INVALID_PARAMS: -32602,
    /** Internal JSON-RPC error. */
    INTERNAL_ERROR: -32603,
};
/**
 * Paperclip plugin-specific error codes.
 *
 * These live in the JSON-RPC "server error" reserved range (-32000 to -32099)
 * as specified by JSON-RPC 2.0 for implementation-defined server errors.
 *
 * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
 */
export const PLUGIN_RPC_ERROR_CODES = {
    /** The worker process is not running or not reachable. */
    WORKER_UNAVAILABLE: -32000,
    /** The plugin does not have the required capability for this operation. */
    CAPABILITY_DENIED: -32001,
    /** The worker reported an unhandled error during method execution. */
    WORKER_ERROR: -32002,
    /** The method call timed out waiting for the worker response. */
    TIMEOUT: -32003,
    /** The worker does not implement the requested optional method. */
    METHOD_NOT_IMPLEMENTED: -32004,
    /** A catch-all for errors that do not fit other categories. */
    UNKNOWN: -32099,
};
/** Required methods the worker MUST implement. */
export const HOST_TO_WORKER_REQUIRED_METHODS = [
    "initialize",
    "health",
    "shutdown",
];
/** Optional methods the worker MAY implement. */
export const HOST_TO_WORKER_OPTIONAL_METHODS = [
    "validateConfig",
    "configChanged",
    "onEvent",
    "runJob",
    "handleWebhook",
    "getData",
    "performAction",
    "executeTool",
];
// ---------------------------------------------------------------------------
// Message Factory Functions
// ---------------------------------------------------------------------------
/** Counter for generating unique request IDs when no explicit ID is provided. */
let _nextId = 1;
/** Wrap around before reaching Number.MAX_SAFE_INTEGER to prevent precision loss. */
const MAX_SAFE_RPC_ID = Number.MAX_SAFE_INTEGER - 1;
/**
 * Create a JSON-RPC 2.0 request message.
 *
 * @param method - The RPC method name
 * @param params - Structured parameters
 * @param id - Optional explicit request ID (auto-generated if omitted)
 */
export function createRequest(method, params, id) {
    if (_nextId >= MAX_SAFE_RPC_ID) {
        _nextId = 1;
    }
    return {
        jsonrpc: JSONRPC_VERSION,
        id: id ?? _nextId++,
        method,
        params,
    };
}
/**
 * Create a JSON-RPC 2.0 success response.
 *
 * @param id - The request ID being responded to
 * @param result - The result value
 */
export function createSuccessResponse(id, result) {
    return {
        jsonrpc: JSONRPC_VERSION,
        id,
        result,
    };
}
/**
 * Create a JSON-RPC 2.0 error response.
 *
 * @param id - The request ID being responded to (null if the request ID could not be determined)
 * @param code - Machine-readable error code
 * @param message - Human-readable error message
 * @param data - Optional structured error data
 */
export function createErrorResponse(id, code, message, data) {
    const response = {
        jsonrpc: JSONRPC_VERSION,
        id,
        error: data !== undefined
            ? { code, message, data }
            : { code, message },
    };
    return response;
}
/**
 * Create a JSON-RPC 2.0 notification (fire-and-forget, no response expected).
 *
 * @param method - The notification method name
 * @param params - Structured parameters
 */
export function createNotification(method, params) {
    return {
        jsonrpc: JSONRPC_VERSION,
        method,
        params,
    };
}
// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------
/**
 * Check whether a value is a well-formed JSON-RPC 2.0 request.
 *
 * A request has `jsonrpc: "2.0"`, a string `method`, and an `id`.
 */
export function isJsonRpcRequest(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const obj = value;
    return (obj.jsonrpc === JSONRPC_VERSION &&
        typeof obj.method === "string" &&
        "id" in obj &&
        obj.id !== undefined &&
        obj.id !== null);
}
/**
 * Check whether a value is a well-formed JSON-RPC 2.0 notification.
 *
 * A notification has `jsonrpc: "2.0"`, a string `method`, but no `id`.
 */
export function isJsonRpcNotification(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const obj = value;
    return (obj.jsonrpc === JSONRPC_VERSION &&
        typeof obj.method === "string" &&
        !("id" in obj));
}
/**
 * Check whether a value is a well-formed JSON-RPC 2.0 response (success or error).
 */
export function isJsonRpcResponse(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const obj = value;
    return (obj.jsonrpc === JSONRPC_VERSION &&
        "id" in obj &&
        ("result" in obj || "error" in obj));
}
/**
 * Check whether a JSON-RPC response is a success response.
 */
export function isJsonRpcSuccessResponse(response) {
    return "result" in response && !("error" in response && response.error !== undefined);
}
/**
 * Check whether a JSON-RPC response is an error response.
 */
export function isJsonRpcErrorResponse(response) {
    return "error" in response && response.error !== undefined;
}
// ---------------------------------------------------------------------------
// Serialization Helpers
// ---------------------------------------------------------------------------
/**
 * Line delimiter for JSON-RPC messages over stdio.
 *
 * Each message is a single line of JSON terminated by a newline character.
 * This follows the newline-delimited JSON (NDJSON) convention.
 */
export const MESSAGE_DELIMITER = "\n";
/**
 * Serialize a JSON-RPC message to a newline-delimited string for transmission
 * over stdio.
 *
 * @param message - Any JSON-RPC message (request, response, or notification)
 * @returns The JSON string terminated with a newline
 */
export function serializeMessage(message) {
    return JSON.stringify(message) + MESSAGE_DELIMITER;
}
/**
 * Parse a JSON string into a JSON-RPC message.
 *
 * Returns the parsed message or throws a `JsonRpcParseError` if the input
 * is not valid JSON or does not conform to the JSON-RPC 2.0 structure.
 *
 * @param line - A single line of JSON text (with or without trailing newline)
 * @returns The parsed JSON-RPC message
 * @throws {JsonRpcParseError} If parsing fails
 */
export function parseMessage(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        throw new JsonRpcParseError("Empty message");
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        throw new JsonRpcParseError(`Invalid JSON: ${trimmed.slice(0, 200)}`);
    }
    if (typeof parsed !== "object" || parsed === null) {
        throw new JsonRpcParseError("Message must be a JSON object");
    }
    const obj = parsed;
    if (obj.jsonrpc !== JSONRPC_VERSION) {
        throw new JsonRpcParseError(`Invalid or missing jsonrpc version (expected "${JSONRPC_VERSION}", got ${JSON.stringify(obj.jsonrpc)})`);
    }
    // It's a valid JSON-RPC 2.0 envelope — return as-is and let the caller
    // use the type guards for more specific classification.
    return parsed;
}
// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------
/**
 * Error thrown when a JSON-RPC message cannot be parsed.
 */
export class JsonRpcParseError extends Error {
    name = "JsonRpcParseError";
    constructor(message) {
        super(message);
    }
}
/**
 * Error thrown when a JSON-RPC call fails with a structured error response.
 *
 * Captures the full `JsonRpcError` so callers can inspect the code and data.
 */
export class JsonRpcCallError extends Error {
    name = "JsonRpcCallError";
    /** The JSON-RPC error code. */
    code;
    /** Optional structured error data from the response. */
    data;
    constructor(error) {
        super(error.message);
        this.code = error.code;
        this.data = error.data;
    }
}
// ---------------------------------------------------------------------------
// Reset helper (testing only)
// ---------------------------------------------------------------------------
/**
 * Reset the internal request ID counter. **For testing only.**
 *
 * @internal
 */
export function _resetIdCounter() {
    _nextId = 1;
}
//# sourceMappingURL=protocol.js.map