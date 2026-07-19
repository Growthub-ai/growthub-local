/**
 * Generation contracts and tool-call governance for the inference gateway.
 * JSON Schema is enforced by llama-server during sampling and validated again
 * here because a length/context stop can still leave incomplete JSON. Tool
 * calls are held until their completed argument JSON passes both the declared
 * OpenAI tool schema and the matching governed OpenAPI operation.
 */

import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const SECRET_KEY_RE = /(?:authorization|cookie|secret|password|passwd|token|api[-_]?key|client[-_]?secret)/i;
const SECRET_VALUE_RE = /(?:bearer\s+[a-z0-9._~+\/-]{12,}|sk-[a-z0-9_-]{12,})/ig;

export function stableStringify(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableStringify(value), "utf8").digest("hex");
}

function schemaObject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.schema && typeof raw.schema === "object" && !Array.isArray(raw.schema)) return raw.schema;
  return raw;
}

export function normalizeSchemaContract(raw, { schemaRef = null } = {}) {
  const schema = schemaObject(raw);
  if (!schema) return null;
  const wrapper = raw?.schema === schema ? raw : {};
  const resolvedSchemaRef = wrapper.schema_ref && typeof wrapper.schema_ref === "object"
    ? wrapper.schema_ref
    : schemaRef && typeof schemaRef === "object" ? schemaRef : null;
  const name = String(wrapper.name || resolvedSchemaRef?.schema_id || schema.title || "response");
  const version = String(wrapper.version || wrapper.schemaVersion || resolvedSchemaRef?.schema_version || schema.$id || "1");
  const strict = wrapper.strict !== false;
  const canonicalSchema = stableStringify(schema);
  const canonical = stableStringify({ name, version, strict, schema, schemaRef: resolvedSchemaRef });
  return {
    name,
    version,
    strict,
    schema,
    schemaRef: resolvedSchemaRef,
    grammarHash: sha256Hex(canonical),
    schemaHash: sha256Hex(canonicalSchema),
    canonical,
  };
}

let ajvInstance = null;
function ajv() {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({
      allErrors: true,
      strictSchema: true,
      strictTypes: false,
      strictTuples: false,
      strictRequired: false,
      validateFormats: true,
      allowUnionTypes: true,
    });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

function conciseErrors(errors) {
  return (Array.isArray(errors) ? errors : []).slice(0, 12).map((error) => ({
    path: String(error?.instancePath || error?.schemaPath || "/"),
    keyword: String(error?.keyword || "invalid"),
    message: String(error?.message || "schema validation failed"),
  }));
}

function schemaComplexity(value, depth = 0) {
  if (depth > 32) return { nodes: 1, maxDepth: depth };
  if (!value || typeof value !== "object") return { nodes: 1, maxDepth: depth };
  let nodes = 1;
  let maxDepth = depth;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const next = schemaComplexity(child, depth + 1);
    nodes += next.nodes;
    maxDepth = Math.max(maxDepth, next.maxDepth);
    if (nodes > 5_000) break;
  }
  return { nodes, maxDepth };
}

function llamaBuiltinUnsupported(schema, path = "#", violations = []) {
  if (!schema || typeof schema !== "object" || violations.length >= 24) return violations;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => llamaBuiltinUnsupported(item, `${path}/${index}`, violations));
    return violations;
  }
  if (schema.$ref) violations.push({ path, keyword: "$ref", message: "llama.cpp built-in schema conversion does not safely support nested/reference schemas" });
  for (const keyword of ["prefixItems", "patternProperties", "uniqueItems", "contains", "minContains", "$anchor", "not", "if", "then", "else", "dependentSchemas"]) {
    if (keyword in schema) violations.push({ path, keyword, message: `${keyword} is not supported by the pinned llama.cpp built-in JSON Schema converter` });
  }
  if ((schema.anyOf || schema.oneOf) && schema.properties) {
    violations.push({ path, keyword: schema.anyOf ? "anyOf" : "oneOf", message: "properties cannot be mixed with anyOf/oneOf in the pinned llama.cpp converter" });
  }
  if (schema.type === "number" && ["minimum", "exclusiveMinimum", "maximum", "exclusiveMaximum"].some((key) => key in schema)) {
    violations.push({ path, keyword: "numeric_bounds", message: "number bounds are unsupported by the pinned llama.cpp converter; use integer bounds or a verified external grammar engine" });
  }
  if (schema.pattern && (!String(schema.pattern).startsWith("^") || !String(schema.pattern).endsWith("$"))) {
    violations.push({ path, keyword: "pattern", message: "llama.cpp patterns must be anchored with ^ and $" });
  }
  if (schema.format && ["uri", "email"].includes(String(schema.format))) {
    violations.push({ path, keyword: "format", message: `${schema.format} is not supported by the pinned llama.cpp converter` });
  }
  for (const [key, child] of Object.entries(schema)) llamaBuiltinUnsupported(child, `${path}/${key}`, violations);
  return violations;
}

/** Validate schema syntax/size before any GPU call and runtime-specific gaps. */
export function preflightSchemaContract(contract, { engine = "generic" } = {}) {
  if (!contract) return { ok: true, errors: [] };
  if (Buffer.byteLength(contract.canonical, "utf8") > 262_144) {
    return { ok: false, errors: [{ path: "#", keyword: "maxBytes", message: "response schema contract exceeds 256 KiB" }] };
  }
  const complexity = schemaComplexity(contract.schema);
  if (complexity.maxDepth > 32 || complexity.nodes > 5_000) {
    return { ok: false, errors: [{ path: "#", keyword: "complexity", message: "response schema exceeds the depth/node complexity limit" }] };
  }
  try {
    if (!ajv().validateSchema(contract.schema)) {
      return { ok: false, errors: conciseErrors(ajv().errors) };
    }
    ajv().compile(contract.schema);
  } catch (error) {
    return { ok: false, errors: [{ path: "#", keyword: "invalid_schema", message: String(error?.message || "schema compilation failed").slice(0, 256) }] };
  }
  if (engine === "llama.cpp-builtin") {
    const unsupported = llamaBuiltinUnsupported(contract.schema);
    if (unsupported.length) return { ok: false, errors: unsupported };
  }
  return { ok: true, errors: [] };
}

export function validateSchemaValue(schema, value) {
  if (!schema || typeof schema !== "object") return { ok: true, errors: [] };
  try {
    const validate = ajv().compile(schema);
    const ok = validate(value);
    return { ok: Boolean(ok), errors: ok ? [] : conciseErrors(validate.errors) };
  } catch (error) {
    return { ok: false, errors: [{ path: "/", keyword: "invalid_schema", message: String(error?.message || "schema compilation failed").slice(0, 256) }] };
  }
}

export function validateStructuredCompletion(response, contract) {
  if (!contract) return { ok: true, enforced: false, value: null, errors: [] };
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, enforced: true, value: null, errors: [{ path: "/", keyword: "content", message: "assistant content is empty" }] };
  }
  let value;
  try { value = JSON.parse(content); } catch {
    return { ok: false, enforced: true, value: null, errors: [{ path: "/", keyword: "json", message: "assistant content is not complete JSON" }] };
  }
  return { ...validateSchemaValue(contract.schema, value), enforced: true, value };
}

/** llama-server's native sampling-time schema request. */
export function llamaStructuredResponseFields(contract) {
  if (!contract) return {};
  return {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: contract.name,
        strict: contract.strict,
        schema: contract.schema,
      },
    },
  };
}

function parseSpec(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function decodePointerPart(value) {
  return String(value || "").replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveLocalRef(spec, node, depth = 0, seen = new Set()) {
  if (!node || typeof node !== "object" || depth > 20) return node;
  if (Array.isArray(node)) return node.map((item) => resolveLocalRef(spec, item, depth + 1, seen));
  const ref = typeof node.$ref === "string" ? node.$ref : "";
  if (ref.startsWith("#/") && !seen.has(ref)) {
    let target = spec;
    for (const part of ref.slice(2).split("/").map(decodePointerPart)) target = target?.[part];
    if (target && typeof target === "object") {
      const nextSeen = new Set(seen);
      nextSeen.add(ref);
      return resolveLocalRef(spec, { ...target, ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$ref")) }, depth + 1, nextSeen);
    }
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resolveLocalRef(spec, value, depth + 1, seen)]));
}

export function openApiOperations(rawSpec) {
  const spec = parseSpec(rawSpec);
  if (!spec) return new Map();
  const operations = new Map();
  const duplicateOperationIds = [];
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
      const operation = pathItem?.[method];
      if (!operation || typeof operation !== "object") continue;
      const operationId = String(operation.operationId || `${method}_${path.replace(/[^a-z0-9]+/gi, "_")}`);
      if (operations.has(operationId)) duplicateOperationIds.push(operationId);
      else operations.set(operationId, { operationId, method: method.toUpperCase(), path, operation, pathItem, spec });
    }
  }
  Object.defineProperty(operations, "duplicateOperationIds", {
    enumerable: false,
    value: Object.freeze([...new Set(duplicateOperationIds)]),
  });
  return operations;
}

function operationArgumentSchema(descriptor) {
  const { spec, operation, pathItem } = descriptor;
  const properties = {};
  const required = [];
  for (const rawParam of [...(pathItem?.parameters || []), ...(operation?.parameters || [])]) {
    const parameter = resolveLocalRef(spec, rawParam);
    const name = String(parameter?.name || "");
    if (!name || SECRET_KEY_RE.test(name)) continue;
    properties[name] = resolveLocalRef(spec, parameter.schema || { type: "string" });
    if (parameter.required === true) required.push(name);
  }
  const body = resolveLocalRef(spec, operation?.requestBody);
  const bodySchema = body?.content?.["application/json"]?.schema
    || Object.values(body?.content || {})[0]?.schema
    || null;
  if (bodySchema) {
    const resolvedBody = resolveLocalRef(spec, bodySchema);
    if (resolvedBody?.type === "object" || resolvedBody?.properties) {
      Object.assign(properties, resolvedBody.properties || {});
      for (const name of resolvedBody.required || []) if (!required.includes(name)) required.push(name);
    } else {
      properties.body = resolvedBody;
      if (body?.required === true) required.push("body");
    }
  }
  return { type: "object", properties, required: [...new Set(required)], additionalProperties: false };
}

export function projectOpenApiTools(rawSpec, { allowedOperationIds = [] } = {}) {
  const allowed = new Set((Array.isArray(allowedOperationIds) ? allowedOperationIds : []).map(String));
  return [...openApiOperations(rawSpec).values()]
    .filter((descriptor) => allowed.size === 0 || allowed.has(descriptor.operationId))
    .map((descriptor) => ({
      type: "function",
      function: {
        name: descriptor.operationId,
        description: String(descriptor.operation?.summary || descriptor.operation?.description || `${descriptor.method} ${descriptor.path}`).slice(0, 512),
        parameters: operationArgumentSchema(descriptor),
      },
    }));
}

function toolCallsFromResponse(response) {
  const calls = response?.choices?.[0]?.message?.tool_calls;
  return Array.isArray(calls) ? calls : [];
}

function parseArguments(raw) {
  if (raw && typeof raw === "object") return { ok: true, value: raw };
  try {
    const value = JSON.parse(String(raw || "{}"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, value: null, error: "tool arguments must decode to an object" };
  } catch {
    return { ok: false, value: null, error: "tool arguments are not complete JSON" };
  }
}

export function validateToolCalls(response, { tools = [], openapi = null, allowedOperationIds = [] } = {}) {
  const calls = toolCallsFromResponse(response);
  if (calls.length === 0) return { ok: true, calls: [], violations: [], toolContractHash: "" };
  const declared = new Map();
  const duplicateToolNames = new Set();
  for (const tool of Array.isArray(tools) ? tools : []) {
    const name = String(tool?.function?.name || "");
    if (declared.has(name)) duplicateToolNames.add(name);
    else declared.set(name, tool);
  }
  const operations = openApiOperations(openapi);
  const allowed = new Set((Array.isArray(allowedOperationIds) ? allowedOperationIds : []).map(String));
  const normalized = [];
  const violations = [];
  const seenCallIds = new Set();
  for (const call of calls) {
    const toolCallId = String(call?.id || "");
    const name = String(call?.function?.name || "");
    const parsed = parseArguments(call?.function?.arguments);
    const tool = declared.get(name);
    const operation = operations.get(name);
    if (!toolCallId) violations.push({ toolCallId, operationId: name, code: "tool_call_id_missing", message: "tool call id is required" });
    if (toolCallId && seenCallIds.has(toolCallId)) violations.push({ toolCallId, operationId: name, code: "tool_call_id_duplicate", message: `duplicate tool call id: ${toolCallId}` });
    if (toolCallId) seenCallIds.add(toolCallId);
    if (!tool) violations.push({ toolCallId, operationId: name, code: "tool_not_declared", message: `tool ${name || "(unnamed)"} is not declared` });
    if (duplicateToolNames.has(name)) violations.push({ toolCallId, operationId: name, code: "tool_definition_duplicate", message: `tool ${name} is declared more than once` });
    if (!openapi) violations.push({ toolCallId, operationId: name, code: "openapi_contract_required", message: "tool calls require a governed OpenAPI contract" });
    if (allowed.size > 0 && !allowed.has(name)) violations.push({ toolCallId, operationId: name, code: "operation_not_allowed", message: `operation ${name} is not allowlisted` });
    if (openapi && !operation) violations.push({ toolCallId, operationId: name, code: "openapi_operation_missing", message: `operationId ${name} is absent from the governed OpenAPI contract` });
    if (operations.duplicateOperationIds?.includes(name)) violations.push({ toolCallId, operationId: name, code: "openapi_operation_duplicate", message: `operationId ${name} appears more than once in the governed OpenAPI contract` });
    if (!parsed.ok) violations.push({ toolCallId, operationId: name, code: "arguments_invalid_json", message: parsed.error });
    if (parsed.ok && tool?.function?.parameters) {
      const validation = validateSchemaValue(tool.function.parameters, parsed.value);
      if (!validation.ok) violations.push({ toolCallId, operationId: name, code: "tool_schema_rejected", message: "arguments violate the declared tool schema", errors: validation.errors });
    }
    if (parsed.ok && operation) {
      const validation = validateSchemaValue(operationArgumentSchema(operation), parsed.value);
      if (!validation.ok) violations.push({ toolCallId, operationId: name, code: "openapi_schema_rejected", message: "arguments violate the governed OpenAPI operation", errors: validation.errors });
    }
    normalized.push({
      toolCallId,
      operationId: name,
      operationMethod: operation?.method || "",
      operationPath: operation?.path || "",
      arguments: parsed.value,
      argumentsHash: parsed.ok ? sha256Hex(parsed.value) : "",
      valid: parsed.ok,
    });
  }
  return {
    ok: violations.length === 0,
    calls: normalized.map((entry) => ({ ...entry, valid: entry.valid && !violations.some((item) => item.toolCallId === entry.toolCallId) })),
    violations,
    toolContractHash: sha256Hex({ tools, openapi: parseSpec(openapi), allowedOperationIds: [...allowed].sort() }),
  };
}

export function redactToolValue(value, depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactToolValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key,
      SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactToolValue(item, depth + 1),
    ]));
  }
  if (typeof value === "string") return value.slice(0, 4096).replace(SECRET_VALUE_RE, "[REDACTED]");
  return value;
}

function boundedToolEvidence(value) {
  const redacted = redactToolValue(value);
  const serialized = stableStringify(redacted);
  if (serialized.length <= 4096) return redacted;
  return { truncated: true, preview: serialized.slice(0, 4096), originalBytes: Buffer.byteLength(serialized, "utf8") };
}

function boundedEndpointRef(value) {
  const raw = String(value || "").trim().slice(0, 1024);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw.replace(/[?#].*$/, "").replace(SECRET_VALUE_RE, "[REDACTED]");
  }
}

/**
 * Validate and redact caller-returned external execution evidence before a
 * continuation is allowed back to the model. The caller/executor remains the
 * authority for the actual network action; the gateway proves correlation to
 * the already validated OpenAPI operation and never invents an execution.
 */
export function auditToolResults(validatedCalls, toolResults, { openapi = null } = {}) {
  const calls = new Map((Array.isArray(validatedCalls) ? validatedCalls : []).map((call) => [String(call.toolCallId || ""), call]));
  const operations = openApiOperations(openapi);
  const results = Array.isArray(toolResults) ? toolResults : [];
  const audit = [];
  const violations = [];
  const seenResults = new Set();
  for (const result of results) {
    const toolCallId = String(result?.tool_call_id || result?.toolCallId || "");
    if (seenResults.has(toolCallId)) {
      violations.push({ toolCallId, code: "tool_result_duplicate", message: "each validated tool call must have exactly one result" });
      continue;
    }
    if (toolCallId) seenResults.add(toolCallId);
    const call = calls.get(toolCallId);
    if (!call) {
      violations.push({ toolCallId, code: "tool_result_unmatched", message: "tool result does not match a validated call" });
      continue;
    }
    const reportedOperationId = String(result?.operation_id || result?.operationId || "");
    if (reportedOperationId && reportedOperationId !== call.operationId) {
      violations.push({ toolCallId, code: "tool_result_operation_mismatch", message: "tool result operation_id does not match the validated tool call" });
      continue;
    }
    const operation = operations.get(call.operationId) || (
      call.operationMethod && call.operationPath
        ? { method: call.operationMethod, path: call.operationPath }
        : null
    );
    if (!operation) {
      violations.push({ toolCallId, code: "tool_result_openapi_missing", message: "tool result cannot be correlated to a governed OpenAPI operation" });
      continue;
    }
    const requestEvidence = result?.request || result?.external_request || {};
    const reportedMethod = String(requestEvidence?.method || "").toUpperCase();
    if (reportedMethod && reportedMethod !== operation.method) {
      violations.push({ toolCallId, code: "tool_result_method_mismatch", message: "reported external request method does not match the governed OpenAPI operation" });
      continue;
    }
    const reportedArgumentsHash = String(requestEvidence?.arguments_sha256 || requestEvidence?.argumentsSha256 || "").toLowerCase();
    if (reportedArgumentsHash && reportedArgumentsHash !== call.argumentsHash) {
      violations.push({ toolCallId, code: "tool_result_arguments_mismatch", message: "reported external request is not bound to the validated tool arguments" });
      continue;
    }
    const response = result?.response ?? result?.content ?? result?.body ?? null;
    const status = Number(result?.status ?? result?.httpStatus);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      violations.push({ toolCallId, code: "tool_result_status_required", message: "tool result must include an HTTP status between 100 and 599" });
      continue;
    }
    const requestBody = call.arguments;
    const requestHeaders = requestEvidence?.headers && typeof requestEvidence.headers === "object"
      ? requestEvidence.headers
      : null;
    // Wire values are caller evidence. A caller cannot upgrade its own result
    // to server-governed authority by supplying a receipt-shaped object.
    audit.push({
      toolCallId,
      operationId: call.operationId,
      argumentsHash: call.argumentsHash,
      externalMethod: operation.method,
      externalEndpointRef: boundedEndpointRef(`${operation.method} ${operation.path}`),
      externalRequestHash: sha256Hex(requestBody),
      externalRequest: boundedToolEvidence(requestBody),
      externalRequestHeadersHash: requestHeaders ? sha256Hex(requestHeaders) : "",
      sentAt: String(requestEvidence?.sent_at || requestEvidence?.sentAt || result?.sent_at || result?.sentAt || ""),
      externalStatus: status,
      externalResultHash: sha256Hex(response),
      externalResult: boundedToolEvidence(response),
      externalResponseHeadersHash: result?.headers && typeof result.headers === "object" ? sha256Hex(result.headers) : "",
      receivedAt: String(result?.received_at || result?.receivedAt || ""),
      durationMs: Math.max(0, Number(result?.duration_ms ?? result?.durationMs) || 0),
      source: "caller-returned",
      executorReceiptRef: null,
    });
  }
  for (const [toolCallId] of calls) {
    if (!seenResults.has(toolCallId)) {
      violations.push({ toolCallId, code: "tool_result_missing", message: "each validated tool call requires exactly one correlated result before continuation" });
    }
  }
  return { ok: violations.length === 0, audit, violations };
}
