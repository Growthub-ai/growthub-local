/**
 * Server-only llama.cpp process pool.
 *
 * It owns the local llama-server lifecycle behind the custom-model gateway and
 * the small amount of protocol translation specific to llama.cpp b10068.
 *
 * Upstream truth pinned for this adapter:
 * - compatibility baseline: release b10068; observed upstream master:
 *   571d0d540df04f25298d0e159e520d9fc62ed121
 * - common/arg.cpp accepts --model, --alias, repeated --lora / --lora-scaled,
 *   --cache-prompt, and the cache-type-k values below.
 * - tools/server/README.md assigns preloaded LoRAs zero-based ids and accepts
 *   request-local `lora: [{ id, scale }]` overrides.
 * - the RPC backend distributes tensors. b10068 does not document a native
 *   prefill/decode KV-state handoff, so this module only selects one endpoint
 *   for the whole request and fails closed when such a handoff is required.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream as nodeCreateReadStream } from "node:fs";
import { realpath as nodeRealpath, stat as nodeStat } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, relative, sep } from "node:path";

export const LLAMA_CPP_UPSTREAM_BUILD = "b10068";
export const LLAMA_CPP_UPSTREAM_COMMIT = "571d0d540df04f25298d0e159e520d9fc62ed121";
export const LLAMA_CPP_CONTEXT_HEAVY_THRESHOLD = 2048;
export const LLAMA_CPP_LOOPBACK_HOST = "127.0.0.1";
export const LLAMA_CPP_LORA_SCALE_MIN = -16;
export const LLAMA_CPP_LORA_SCALE_MAX = 16;

export const LLAMA_CPP_CACHE_TYPE_K_VALUES = Object.freeze([
  "f32",
  "f16",
  "bf16",
  "q8_0",
  "q4_0",
  "q4_1",
  "iq4_nl",
  "q5_0",
  "q5_1",
]);

const CACHE_TYPE_K_SET = new Set(LLAMA_CPP_CACHE_TYPE_K_VALUES);
const POOL_ROLES = new Set(["prefill_pool", "decode_pool", "unified_pool"]);
const SERVER_CONFIG_FIELDS = Object.freeze({
  threads: Object.freeze({ flag: "--threads", min: 1, max: 4096 }),
  ctxSize: Object.freeze({ flag: "--ctx-size", min: 1, max: 1_048_576 }),
  batchSize: Object.freeze({ flag: "--batch-size", min: 1, max: 1_048_576 }),
  ubatchSize: Object.freeze({ flag: "--ubatch-size", min: 1, max: 1_048_576 }),
  gpuLayers: Object.freeze({ flag: "--n-gpu-layers", min: 0, max: 100_000 }),
});
const SERVER_CONFIG_ALIASES = Object.freeze({
  threads: "threads",
  "ctx-size": "ctxSize",
  ctx_size: "ctxSize",
  ctxSize: "ctxSize",
  "batch-size": "batchSize",
  batch_size: "batchSize",
  batchSize: "batchSize",
  "ubatch-size": "ubatchSize",
  ubatch_size: "ubatchSize",
  ubatchSize: "ubatchSize",
  "gpu-layers": "gpuLayers",
  gpu_layers: "gpuLayers",
  gpuLayers: "gpuLayers",
  "n-gpu-layers": "gpuLayers",
});
const DEFAULT_MAX_INSTANCES = 4;
const DEFAULT_MAX_WARM_PREFIXES = 64;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_HEALTH_POLL_MS = 250;
const DEFAULT_SHUTDOWN_GRACE_MS = 2_000;
const DEFAULT_POOL_GLOBAL = Symbol.for("growthub.llama-cpp-process-pool.v1");

export class LlamaCppAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LlamaCppAdapterError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new LlamaCppAdapterError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, field, { maxLength = 4096 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) fail("INVALID_ARGUMENT", `${field} is required`, { field });
  if (text.length > maxLength || /[\0\r\n]/.test(text)) {
    fail("INVALID_ARGUMENT", `${field} contains unsupported characters or is too long`, { field });
  }
  return text;
}

function optionalString(value, field, options) {
  if (value === undefined || value === null || value === "") return "";
  return requiredString(value, field, options);
}

function normalizeSha256(value, field = "sha256") {
  const normalized = requiredString(value, field, { maxLength: 80 })
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    fail("INVALID_SHA256", `${field} must be a 64-character SHA-256 hex digest`, { field });
  }
  return normalized;
}

function sha256Equal(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("INVALID_PORT", "llama-server port must be an integer between 1 and 65535", { port: value });
  }
  return port;
}

function normalizeScale(value, fallback = 1) {
  const scale = value === undefined || value === null || value === "" ? Number(fallback) : Number(value);
  if (!Number.isFinite(scale)) fail("INVALID_LORA_SCALE", "LoRA scale must be a finite number", { scale: value });
  if (scale < LLAMA_CPP_LORA_SCALE_MIN || scale > LLAMA_CPP_LORA_SCALE_MAX) {
    fail(
      "INVALID_LORA_SCALE",
      `LoRA scale must be between ${LLAMA_CPP_LORA_SCALE_MIN} and ${LLAMA_CPP_LORA_SCALE_MAX}`,
      { scale },
    );
  }
  return scale;
}

function normalizeServerConfig(value = {}) {
  if (value === undefined || value === null) return Object.freeze({});
  if (!isPlainObject(value)) fail("INVALID_SERVER_CONFIG", "serverConfig must be an object");
  const collected = {};
  for (const [inputKey, inputValue] of Object.entries(value)) {
    const key = SERVER_CONFIG_ALIASES[inputKey];
    if (!key) {
      fail("INVALID_SERVER_CONFIG", `Unsupported llama-server setting: ${inputKey}`, {
        field: inputKey,
        allowed: Object.keys(SERVER_CONFIG_FIELDS),
      });
    }
    if (Object.hasOwn(collected, key)) {
      fail("INVALID_SERVER_CONFIG", `Duplicate llama-server setting: ${key}`, { field: key });
    }
    const number = inputValue;
    const bounds = SERVER_CONFIG_FIELDS[key];
    if (typeof number !== "number" || !Number.isInteger(number) || number < bounds.min || number > bounds.max) {
      fail(
        "INVALID_SERVER_CONFIG",
        `${key} must be an integer between ${bounds.min} and ${bounds.max}`,
        { field: key, value: inputValue },
      );
    }
    collected[key] = number;
  }
  if (collected.batchSize && collected.ubatchSize && collected.ubatchSize > collected.batchSize) {
    fail("INVALID_SERVER_CONFIG", "ubatchSize cannot exceed batchSize", {
      batchSize: collected.batchSize,
      ubatchSize: collected.ubatchSize,
    });
  }
  const normalized = {};
  for (const key of Object.keys(SERVER_CONFIG_FIELDS)) {
    if (collected[key] !== undefined) normalized[key] = collected[key];
  }
  return Object.freeze(normalized);
}

function normalizeServerConfigByRole(value = {}) {
  if (value === undefined || value === null) return Object.freeze({});
  if (!isPlainObject(value)) fail("INVALID_SERVER_CONFIG", "serverConfigByRole must be an object");
  const normalized = {};
  for (const [inputRole, config] of Object.entries(value)) {
    const role = normalizePoolRole(inputRole);
    if (Object.hasOwn(normalized, role)) {
      fail("INVALID_SERVER_CONFIG", `Duplicate llama-server role configuration: ${role}`, { poolRole: role });
    }
    normalized[role] = normalizeServerConfig(config);
  }
  return Object.freeze(normalized);
}

function normalizePoolRole(value) {
  const aliases = {
    prefill: "prefill_pool",
    decode: "decode_pool",
    general: "unified_pool",
    unified: "unified_pool",
  };
  const role = aliases[String(value || "").trim()] || String(value || "").trim();
  if (!POOL_ROLES.has(role)) {
    fail("INVALID_POOL_ROLE", "poolRole must be prefill_pool, decode_pool, or unified_pool", { poolRole: value });
  }
  return role;
}

function requestedLoraRef(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return requiredString(value, "loraRef", { maxLength: 256 });
  if (isPlainObject(value)) {
    return requiredString(
      value.lora_id ?? value.loraRef ?? value.lora_ref ?? value.id ?? value.ref,
      "loraRef",
      { maxLength: 256 },
    );
  }
  fail("INVALID_LORA_REF", "loraRef must be a string or a LoRA reference object");
}

function normalizePrefixHash(value) {
  if (value === undefined || value === null || value === "") return "";
  const text = requiredString(value, "prefixHash", { maxLength: 256 });
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) {
    fail("INVALID_PREFIX_HASH", "prefixHash contains unsupported characters");
  }
  return text;
}

function normalizeCacheTypeK(value) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = String(value).trim().toLowerCase();
  if (!CACHE_TYPE_K_SET.has(normalized)) {
    fail("INVALID_CACHE_TYPE_K", `cacheTypeK must be one of: ${LLAMA_CPP_CACHE_TYPE_K_VALUES.join(", ")}`, {
      cacheTypeK: value,
    });
  }
  return normalized;
}

function normalizeServedAlias(value) {
  if (value === undefined || value === null || value === "") return "";
  const alias = requiredString(value, "servedAlias", { maxLength: 128 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._+:/@-]{0,127}$/.test(alias)) {
    fail(
      "INVALID_ALIAS",
      "servedAlias must be a model tag containing only letters, numbers, '.', '_', '+', ':', '/', '@', or '-'",
    );
  }
  return alias;
}

function assertNativeDisaggregationNotRequired(value) {
  if (value === true) {
    fail(
      "NATIVE_PD_HANDOFF_UNAVAILABLE",
      "llama.cpp b10068 does not expose a verified native prefill/decode state handoff; refusing a request that requires one",
      { upstreamBuild: LLAMA_CPP_UPSTREAM_BUILD },
    );
  }
}

function assertLoopbackBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("NON_LOOPBACK_ENDPOINT", "llama-server endpoint must be a valid loopback URL");
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== LLAMA_CPP_LOOPBACK_HOST || parsed.username || parsed.password) {
    fail("NON_LOOPBACK_ENDPOINT", "llama-server traffic is restricted to http://127.0.0.1", {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
    });
  }
  return parsed;
}

function modelPathFrom(spec) {
  return requiredString(spec?.path ?? spec?.modelPath ?? spec?.artifactPath, "model.path");
}

function modelHashFrom(spec) {
  return normalizeSha256(
    spec?.sha256 ?? spec?.modelSha256 ?? spec?.base_model_sha256 ?? spec?.artifact_ref?.sha256,
    "model.sha256",
  );
}

function adapterRefFrom(spec) {
  return requiredString(
    spec?.ref ?? spec?.loraRef ?? spec?.lora_ref ?? spec?.lora_id ?? spec?.adapter_ref?.id,
    "adapter.ref",
    { maxLength: 256 },
  );
}

function adapterPathFrom(spec) {
  return requiredString(spec?.path ?? spec?.adapterPath ?? spec?.artifactPath, "adapter.path");
}

function adapterHashFrom(spec) {
  return normalizeSha256(
    spec?.sha256 ?? spec?.adapterSha256 ?? spec?.adapter_sha256 ?? spec?.adapter_ref?.sha256,
    "adapter.sha256",
  );
}

function normalizeArtifactDeclarations({ model, allowedAdapters = [] } = {}) {
  if (!isPlainObject(model)) fail("INVALID_MODEL", "model must describe a local model artifact");
  if (!Array.isArray(allowedAdapters)) fail("INVALID_ADAPTERS", "allowedAdapters must be an array");
  const normalizedModel = {
    path: modelPathFrom(model),
    sha256: modelHashFrom(model),
  };
  const refs = new Set();
  const normalizedAdapters = allowedAdapters.map((adapter, index) => {
    if (!isPlainObject(adapter)) fail("INVALID_ADAPTER", `allowedAdapters[${index}] must be an object`);
    const normalized = {
      ref: adapterRefFrom(adapter),
      path: adapterPathFrom(adapter),
      sha256: adapterHashFrom(adapter),
      defaultScale: normalizeScale(adapter.defaultScale ?? adapter.scale, 1),
    };
    if (refs.has(normalized.ref)) fail("DUPLICATE_LORA_REF", `Duplicate allowed LoRA reference: ${normalized.ref}`);
    refs.add(normalized.ref);
    return normalized;
  });
  normalizedAdapters.sort((left, right) => left.ref.localeCompare(right.ref));
  normalizedAdapters.forEach((adapter, adapterId) => {
    adapter.adapterId = adapterId;
  });
  return { model: normalizedModel, adapters: normalizedAdapters };
}

function normalizeAllowedArtifactRootDeclarations(value = []) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail("INVALID_ARTIFACT_ROOTS", "allowedArtifactRoots must be an array");
  return value.map((root, index) => requiredString(root, `allowedArtifactRoots[${index}]`));
}

function pathIsWithinRoot(filePath, rootPath) {
  const fromRoot = relative(rootPath, filePath);
  return fromRoot === "" || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`));
}

async function resolveAllowedArtifactRoots(roots, realpathImpl) {
  const declarations = normalizeAllowedArtifactRootDeclarations(roots);
  try {
    return await Promise.all(declarations.map((root) => realpathImpl(root)));
  } catch (error) {
    fail("ARTIFACT_ROOT_UNREADABLE", `Unable to resolve an allowed artifact root: ${error?.message || "unknown error"}`);
  }
}

/** Hash a real local artifact without loading a multi-GB GGUF into memory. */
export async function sha256File(
  filePath,
  {
    realpathImpl = nodeRealpath,
    statImpl = nodeStat,
    createReadStreamImpl = nodeCreateReadStream,
    allowedArtifactRoots = [],
    resolvedArtifactRoots,
  } = {},
) {
  const requestedPath = requiredString(filePath, "filePath");
  let resolvedPath;
  try {
    resolvedPath = await realpathImpl(requestedPath);
  } catch (error) {
    fail("ARTIFACT_UNREADABLE", `Unable to resolve inference artifact: ${error?.message || "unknown error"}`, {
      path: requestedPath,
    });
  }

  let stats;
  try {
    stats = await statImpl(resolvedPath);
  } catch (error) {
    fail("ARTIFACT_UNREADABLE", `Unable to stat inference artifact: ${error?.message || "unknown error"}`, {
      path: resolvedPath,
    });
  }
  if (!stats || typeof stats.isFile !== "function" || !stats.isFile()) {
    fail("ARTIFACT_NOT_REGULAR_FILE", "Inference artifacts must resolve to regular files", { path: resolvedPath });
  }

  const allowedRoots = Array.isArray(resolvedArtifactRoots)
    ? resolvedArtifactRoots
    : await resolveAllowedArtifactRoots(allowedArtifactRoots, realpathImpl);
  if (allowedRoots.length > 0 && !allowedRoots.some((root) => pathIsWithinRoot(resolvedPath, root))) {
    fail("ARTIFACT_OUTSIDE_ALLOWED_ROOTS", "Inference artifact is outside the operator-allowed roots", {
      path: resolvedPath,
      allowedArtifactRoots: allowedRoots,
    });
  }

  const hash = createHash("sha256");
  try {
    const stream = createReadStreamImpl(resolvedPath);
    for await (const chunk of stream) hash.update(chunk);
  } catch (error) {
    fail("ARTIFACT_UNREADABLE", `Unable to hash inference artifact: ${error?.message || "unknown error"}`, {
      path: resolvedPath,
    });
  }
  return { path: resolvedPath, sha256: hash.digest("hex") };
}

/** Resolve, hash, and verify the base GGUF plus every allowed LoRA. */
export async function verifyLlamaCppArtifacts(
  { model, allowedAdapters = [] } = {},
  {
    realpathImpl = nodeRealpath,
    statImpl = nodeStat,
    createReadStreamImpl = nodeCreateReadStream,
    allowedArtifactRoots = [],
  } = {},
) {
  const declarations = normalizeArtifactDeclarations({ model, allowedAdapters });
  const modelInput = declarations.model;
  const adapterInputs = declarations.adapters;
  const resolvedArtifactRoots = await resolveAllowedArtifactRoots(allowedArtifactRoots, realpathImpl);
  const fileDependencies = {
    realpathImpl,
    statImpl,
    createReadStreamImpl,
    resolvedArtifactRoots,
  };

  const [verifiedModel, ...verifiedAdapters] = await Promise.all([
    sha256File(modelInput.path, fileDependencies),
    ...adapterInputs.map((adapter) => sha256File(adapter.path, fileDependencies)),
  ]);

  if (!sha256Equal(modelInput.sha256, verifiedModel.sha256)) {
    fail("ARTIFACT_HASH_MISMATCH", "Base model SHA-256 does not match the declared hash", {
      artifact: "model",
      expectedSha256: modelInput.sha256,
      actualSha256: verifiedModel.sha256,
    });
  }

  const adapters = verifiedAdapters.map((verified, index) => {
    const input = adapterInputs[index];
    if (!sha256Equal(input.sha256, verified.sha256)) {
      fail("ARTIFACT_HASH_MISMATCH", `LoRA SHA-256 does not match the declared hash for ${input.ref}`, {
        artifact: "lora",
        loraRef: input.ref,
        expectedSha256: input.sha256,
        actualSha256: verified.sha256,
      });
    }
    return Object.freeze({
      ref: input.ref,
      path: verified.path,
      sha256: verified.sha256,
      defaultScale: input.defaultScale,
      adapterId: input.adapterId,
    });
  });

  return Object.freeze({
    model: Object.freeze({ path: verifiedModel.path, sha256: verifiedModel.sha256 }),
    adapters: Object.freeze(adapters),
  });
}

export function buildCompositeLlamaAlias({ modelSha256, adapters = [], poolRole, aliasPrefix = "growthub" } = {}) {
  const modelHash = normalizeSha256(modelSha256, "modelSha256");
  // Keep the served model identity stable across workload-oriented phase
  // pools. The process key still includes the role because its runtime tuning
  // may differ, but clients see one base+adapter-set identity.
  if (poolRole !== undefined && poolRole !== null && poolRole !== "") normalizePoolRole(poolRole);
  const prefix = requiredString(aliasPrefix, "aliasPrefix", { maxLength: 32 })
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!prefix) fail("INVALID_ALIAS", "aliasPrefix must contain at least one safe character");
  const adapterIdentity = adapters
    .map((adapter) => [
      requiredString(adapter.ref, "adapter.ref", { maxLength: 256 }),
      normalizeSha256(adapter.sha256, "adapter.sha256"),
      normalizeScale(adapter.defaultScale ?? adapter.scale, 1),
    ])
    .sort()
    .map((identity) => JSON.stringify(identity))
    .join("|");
  const adapterHash = adapterIdentity
    ? createHash("sha256").update(adapterIdentity, "utf8").digest("hex").slice(0, 16)
    : "base";
  return `${prefix}-${modelHash.slice(0, 16)}-${adapterHash}`;
}

/** Build argv only. No command string or shell interpolation is ever used. */
export function buildLlamaServerArgv({
  modelPath,
  alias,
  port,
  host = LLAMA_CPP_LOOPBACK_HOST,
  allowedAdapters = [],
  cacheTypeK = "",
  serverConfig = {},
} = {}) {
  const safeModelPath = requiredString(modelPath, "modelPath");
  const safeAlias = normalizeServedAlias(alias);
  if (!safeAlias) fail("INVALID_ALIAS", "alias is required");
  const safePort = normalizePort(port);
  if (host !== LLAMA_CPP_LOOPBACK_HOST) {
    fail("NON_LOOPBACK_ENDPOINT", "llama-server must bind to 127.0.0.1", { host });
  }
  if (!Array.isArray(allowedAdapters)) fail("INVALID_ADAPTERS", "allowedAdapters must be an array");

  const argv = [
    "--model",
    safeModelPath,
    "--alias",
    safeAlias,
    "--host",
    LLAMA_CPP_LOOPBACK_HOST,
    "--port",
    String(safePort),
    "--cache-prompt",
  ];
  const normalizedCacheTypeK = normalizeCacheTypeK(cacheTypeK);
  if (normalizedCacheTypeK) argv.push("--cache-type-k", normalizedCacheTypeK);

  const normalizedServerConfig = normalizeServerConfig(serverConfig);
  for (const key of Object.keys(SERVER_CONFIG_FIELDS)) {
    if (normalizedServerConfig[key] !== undefined) {
      argv.push(SERVER_CONFIG_FIELDS[key].flag, String(normalizedServerConfig[key]));
    }
  }

  for (const [index, adapter] of allowedAdapters.entries()) {
    if (!isPlainObject(adapter)) fail("INVALID_ADAPTER", `allowedAdapters[${index}] must be an object`);
    const adapterPath = requiredString(adapter.path ?? adapter.adapterPath, `allowedAdapters[${index}].path`);
    const scale = normalizeScale(adapter.defaultScale ?? adapter.scale, 1);
    if (scale === 1) {
      argv.push("--lora", adapterPath);
    } else {
      // b10068 parses --lora-scaled by splitting on ':'. Reject an ambiguous
      // path rather than emitting argv that upstream would misparse.
      if (adapterPath.includes(":")) {
        fail("AMBIGUOUS_LORA_PATH", "A scaled LoRA path cannot contain ':' with llama.cpp b10068", {
          adapterPath,
        });
      }
      argv.push("--lora-scaled", `${adapterPath}:${scale}`);
    }
  }
  if (allowedAdapters.length > 0) argv.push("--lora-init-without-apply");
  return argv;
}

export function mapLoraRefToRequest(loraRef, allowedAdapters = [], scale) {
  const ref = requestedLoraRef(loraRef);
  if (!ref) {
    if (scale !== undefined && scale !== null && scale !== "") {
      fail("LORA_SCALE_WITHOUT_ADAPTER", "A LoRA scale cannot be supplied without a LoRA reference");
    }
    return [];
  }
  const adapterIndex = allowedAdapters.findIndex((candidate) => candidate.ref === ref);
  const adapter = allowedAdapters[adapterIndex];
  if (!adapter) {
    fail("LORA_NOT_ALLOWED", `Requested LoRA is not preloaded on this instance: ${ref}`, { loraRef: ref });
  }
  const adapterId = Number.isInteger(adapter.adapterId) ? adapter.adapterId : adapterIndex;
  return [{ id: adapterId, scale: normalizeScale(scale, adapter.defaultScale) }];
}

/** Strip gateway-only fields and force the verified process alias and LoRA id. */
export function buildLlamaCppRequestBody({
  body,
  modelAlias,
  allowedAdapters = [],
  loraRef,
  loraScale,
} = {}) {
  if (!isPlainObject(body)) fail("INVALID_REQUEST_BODY", "llama.cpp request body must be an object");
  const safeAlias = requiredString(modelAlias, "modelAlias", { maxLength: 128 });
  const fromBody = body.lora_ref ?? body.adapter_ref;
  const explicitRef = requestedLoraRef(loraRef);
  const bodyRef = requestedLoraRef(fromBody);
  if (explicitRef && bodyRef && explicitRef !== bodyRef) {
    fail("CONFLICTING_LORA_REF", "Request contains conflicting LoRA references");
  }
  const selectedRef = explicitRef || bodyRef;
  const selectedScale = loraScale ?? body.lora_scale;
  const {
    lora: _untrustedLora,
    lora_ref: _loraRef,
    adapter_ref: _adapterRef,
    lora_scale: _loraScale,
    nativeDisaggregationRequired: _nativeDisaggregationRequired,
    ...upstreamBody
  } = body;
  return {
    ...upstreamBody,
    model: safeAlias,
    lora: mapLoraRefToRequest(selectedRef, allowedAdapters, selectedScale),
  };
}

export function hashPromptPrefix({ systemPrompt = "", contextPrefix = "" } = {}) {
  const system = String(systemPrompt ?? "");
  const context = String(contextPrefix ?? "");
  const hash = createHash("sha256");
  hash.update(String(Buffer.byteLength(system, "utf8")), "utf8");
  hash.update(":", "utf8");
  hash.update(system, "utf8");
  hash.update("|", "utf8");
  hash.update(String(Buffer.byteLength(context, "utf8")), "utf8");
  hash.update(":", "utf8");
  hash.update(context, "utf8");
  return hash.digest("hex");
}

/**
 * Pure routing hint. It selects one pool for the whole request; it never
 * claims that prefill state will be handed to a separate decode process.
 */
export function selectPhasePool({
  contextTokens = 0,
  stream = false,
  thresholdTokens = LLAMA_CPP_CONTEXT_HEAVY_THRESHOLD,
  nativeDisaggregationRequired = false,
} = {}) {
  assertNativeDisaggregationNotRequired(nativeDisaggregationRequired);
  const tokenCount = Number(contextTokens);
  const threshold = Number(thresholdTokens);
  if (!Number.isFinite(tokenCount) || tokenCount < 0) {
    fail("INVALID_CONTEXT_TOKENS", "contextTokens must be a non-negative finite number");
  }
  if (!Number.isInteger(threshold) || threshold < 1) {
    fail("INVALID_PHASE_THRESHOLD", "thresholdTokens must be a positive integer");
  }
  if (tokenCount > threshold) return "prefill_pool";
  if (stream === true) return "decode_pool";
  return "unified_pool";
}

function buildInstanceKey({ model, adapters, poolRole, cacheTypeK, alias, serverConfig }) {
  const payload = JSON.stringify({
    upstreamBuild: LLAMA_CPP_UPSTREAM_BUILD,
    upstreamCommit: LLAMA_CPP_UPSTREAM_COMMIT,
    alias,
    cachePrompt: true,
    modelSha256: model.sha256,
    modelPath: model.path,
    adapters: adapters.map((adapter) => ({
      ref: adapter.ref,
      sha256: adapter.sha256,
      path: adapter.path,
      scale: adapter.defaultScale,
    })),
    poolRole,
    cacheTypeK: cacheTypeK || "f16-default",
    serverConfig: normalizeServerConfig(serverConfig),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function adapterForRef(adapters, ref) {
  if (!ref) return null;
  const adapter = adapters.find((candidate) => candidate.ref === ref);
  if (!adapter) fail("LORA_NOT_ALLOWED", `Requested LoRA is not preloaded on this instance: ${ref}`, { loraRef: ref });
  return adapter;
}

function loraSelection(instance, { loraRef = "", adapterRef = "", loraScale } = {}) {
  const ref = requestedLoraRef(loraRef || adapterRef);
  const adapter = adapterForRef(instance.adapters, ref);
  if (!adapter) {
    if (loraScale !== undefined && loraScale !== null && loraScale !== "") {
      fail("LORA_SCALE_WITHOUT_ADAPTER", "A LoRA scale cannot be supplied without a LoRA reference");
    }
    return Object.freeze({ ref: "", scale: null, adapter: null });
  }
  return Object.freeze({
    ref: adapter.ref,
    scale: normalizeScale(loraScale, adapter.defaultScale),
    adapter,
  });
}

function warmPrefixKey(instance, { prefixHash = "", loraRef = "", adapterRef = "", loraScale } = {}) {
  const prefix = normalizePrefixHash(prefixHash);
  if (!prefix) return "";
  const selection = loraSelection(instance, { loraRef, adapterRef, loraScale });
  return createHash("sha256")
    .update(JSON.stringify({ prefix, loraRef: selection.ref || "base", loraScale: selection.scale }), "utf8")
    .digest("hex");
}

function loraSelectionIdentity(selection) {
  return JSON.stringify({ loraRef: selection.ref || "base", loraScale: selection.scale });
}

function warmPrefixTimestamp(instance, selection) {
  const key = warmPrefixKey(instance, selection);
  return key ? Number(instance.warmPrefixes.get(key) || 0) : 0;
}

function compareWarmCandidates(left, right, selection) {
  const leftWarm = warmPrefixTimestamp(left, selection);
  const rightWarm = warmPrefixTimestamp(right, selection);
  if (leftWarm !== rightWarm) return rightWarm - leftWarm;
  if (left.activeRequests !== right.activeRequests) return left.activeRequests - right.activeRequests;
  return right.lastUsedAt - left.lastUsedAt;
}

async function allocateLoopbackPort({ host = LLAMA_CPP_LOOPBACK_HOST } = {}) {
  if (host !== LLAMA_CPP_LOOPBACK_HOST) fail("NON_LOOPBACK_ENDPOINT", "Port allocation is loopback-only");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: LLAMA_CPP_LOOPBACK_HOST, port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class LlamaCppProcessPool {
  constructor({
    binary = "llama-server",
    maxInstances = DEFAULT_MAX_INSTANCES,
    maxWarmPrefixes = DEFAULT_MAX_WARM_PREFIXES,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    healthPollMs = DEFAULT_HEALTH_POLL_MS,
    shutdownGraceMs = DEFAULT_SHUTDOWN_GRACE_MS,
    spawnImpl = nodeSpawn,
    fetchImpl = globalThis.fetch,
    realpathImpl = nodeRealpath,
    statImpl = nodeStat,
    createReadStreamImpl = nodeCreateReadStream,
    allowedArtifactRoots = [],
    serverConfigByRole = {},
    allocatePortImpl = allocateLoopbackPort,
    nowImpl = Date.now,
    sleepImpl = defaultSleep,
  } = {}) {
    this.binary = requiredString(binary, "binary");
    this.maxInstances = Number(maxInstances);
    this.maxWarmPrefixes = Number(maxWarmPrefixes);
    this.startupTimeoutMs = Number(startupTimeoutMs);
    this.healthPollMs = Number(healthPollMs);
    this.shutdownGraceMs = Number(shutdownGraceMs);
    if (!Number.isInteger(this.maxInstances) || this.maxInstances < 1) {
      fail("INVALID_POOL_SIZE", "maxInstances must be a positive integer");
    }
    if (!Number.isInteger(this.maxWarmPrefixes) || this.maxWarmPrefixes < 1) {
      fail("INVALID_PREFIX_CAPACITY", "maxWarmPrefixes must be a positive integer");
    }
    if (![this.startupTimeoutMs, this.healthPollMs, this.shutdownGraceMs].every((value) => Number.isFinite(value) && value >= 0)) {
      fail("INVALID_TIMEOUT", "Pool timeout values must be non-negative finite numbers");
    }
    if (typeof spawnImpl !== "function" || typeof fetchImpl !== "function") {
      fail("INVALID_DEPENDENCY", "spawnImpl and fetchImpl must be functions");
    }
    if (typeof realpathImpl !== "function" || typeof statImpl !== "function" || typeof createReadStreamImpl !== "function") {
      fail("INVALID_DEPENDENCY", "Filesystem operations must be injectable functions");
    }
    if (typeof allocatePortImpl !== "function") fail("INVALID_DEPENDENCY", "allocatePortImpl must be a function");

    this.spawnImpl = spawnImpl;
    this.fetchImpl = fetchImpl;
    this.realpathImpl = realpathImpl;
    this.statImpl = statImpl;
    this.createReadStreamImpl = createReadStreamImpl;
    this.allowedArtifactRoots = Object.freeze(normalizeAllowedArtifactRootDeclarations(allowedArtifactRoots));
    this.serverConfigByRole = normalizeServerConfigByRole(serverConfigByRole);
    this.allocatePortImpl = allocatePortImpl;
    this.nowImpl = nowImpl;
    this.sleepImpl = sleepImpl;
    this.instances = new Map();
    this.instanceIdByKey = new Map();
    this.pendingByKey = new Map();
    this.startLock = Promise.resolve();
    this.sequence = 0;
  }

  get size() {
    return this.instances.size;
  }

  async ensure({
    model,
    allowedAdapters = [],
    loraRef,
    adapterRef,
    loraScale,
    poolRole,
    contextTokens = 0,
    stream = false,
    prefixHash = "",
    cacheTypeK = "",
    aliasPrefix = "growthub",
    servedAlias = "",
    serverConfig,
    nativeDisaggregationRequired = false,
  } = {}) {
    assertNativeDisaggregationNotRequired(nativeDisaggregationRequired);
    const role = poolRole
      ? normalizePoolRole(poolRole)
      : selectPhasePool({ contextTokens, stream, nativeDisaggregationRequired });
    const normalizedPrefix = normalizePrefixHash(prefixHash);
    const selectedRef = requestedLoraRef(loraRef ?? adapterRef);
    const normalizedCacheTypeK = normalizeCacheTypeK(cacheTypeK);
    const normalizedServerConfig = normalizeServerConfig(
      serverConfig === undefined ? this.serverConfigByRole[role] : serverConfig,
    );
    // Existing processes are addressed by the hashes they already verified at
    // startup. This avoids rereading a multi-GB GGUF on every request while
    // still hashing every artifact before a new process is allowed to spawn.
    const declared = normalizeArtifactDeclarations({ model, allowedAdapters });
    const selectedAdapter = adapterForRef(declared.adapters, selectedRef);
    if (selectedAdapter) normalizeScale(loraScale, selectedAdapter.defaultScale);
    else if (loraScale !== undefined && loraScale !== null && loraScale !== "") {
      fail("LORA_SCALE_WITHOUT_ADAPTER", "A LoRA scale cannot be supplied without a LoRA reference");
    }
    const alias = normalizeServedAlias(servedAlias) || buildCompositeLlamaAlias({
      modelSha256: declared.model.sha256,
      adapters: declared.adapters,
      poolRole: role,
      aliasPrefix,
    });
    const key = buildInstanceKey({
      model: declared.model,
      adapters: declared.adapters,
      poolRole: role,
      cacheTypeK: normalizedCacheTypeK,
      alias,
      serverConfig: normalizedServerConfig,
    });

    const existingId = this.instanceIdByKey.get(key);
    const existing = existingId ? this.instances.get(existingId) : null;
    if (existing?.status === "ready") {
      existing.lastUsedAt = this.nowImpl();
      return this.#describe(existing, {
        loraRef: selectedRef,
        loraScale,
        prefixHash: normalizedPrefix,
        coldStart: false,
      });
    }

    const pending = this.pendingByKey.get(key);
    if (pending) {
      const instance = await pending;
      return this.#describe(instance, {
        loraRef: selectedRef,
        loraScale,
        prefixHash: normalizedPrefix,
        coldStart: false,
      });
    }

    const start = (async () => {
      const verified = await verifyLlamaCppArtifacts(
        { model, allowedAdapters },
        {
          realpathImpl: this.realpathImpl,
          statImpl: this.statImpl,
          createReadStreamImpl: this.createReadStreamImpl,
          allowedArtifactRoots: this.allowedArtifactRoots,
        },
      );
      return this.#startInstance({
        key,
        model: verified.model,
        adapters: verified.adapters,
        poolRole: role,
        cacheTypeK: normalizedCacheTypeK,
        alias,
        serverConfig: normalizedServerConfig,
      });
    })();
    this.pendingByKey.set(key, start);
    try {
      const instance = await start;
      return this.#describe(instance, {
        loraRef: selectedRef,
        loraScale,
        prefixHash: normalizedPrefix,
        coldStart: true,
      });
    } finally {
      if (this.pendingByKey.get(key) === start) this.pendingByKey.delete(key);
    }
  }

  select({
    configurationKey,
    model,
    modelSha256,
    allowedAdapters,
    loraRef,
    adapterRef,
    loraScale,
    poolRole,
    contextTokens = 0,
    stream = false,
    prefixHash = "",
    cacheTypeK = "",
    aliasPrefix = "growthub",
    servedAlias = "",
    serverConfig,
    nativeDisaggregationRequired = false,
  } = {}) {
    assertNativeDisaggregationNotRequired(nativeDisaggregationRequired);
    const role = poolRole
      ? normalizePoolRole(poolRole)
      : selectPhasePool({ contextTokens, stream, nativeDisaggregationRequired });
    const selectedRef = requestedLoraRef(loraRef ?? adapterRef);
    const normalizedPrefix = normalizePrefixHash(prefixHash);
    let exactKey = optionalString(configurationKey, "configurationKey", { maxLength: 64 });
    if (exactKey && !/^[a-f0-9]{64}$/.test(exactKey)) {
      fail("INVALID_CONFIGURATION_KEY", "configurationKey must be a 64-character lowercase hex digest");
    }
    if (!exactKey && isPlainObject(model) && Array.isArray(allowedAdapters)) {
      const declared = normalizeArtifactDeclarations({ model, allowedAdapters });
      const alias = normalizeServedAlias(servedAlias) || buildCompositeLlamaAlias({
        modelSha256: declared.model.sha256,
        adapters: declared.adapters,
        poolRole: role,
        aliasPrefix,
      });
      exactKey = buildInstanceKey({
        model: declared.model,
        adapters: declared.adapters,
        poolRole: role,
        cacheTypeK: normalizeCacheTypeK(cacheTypeK),
        alias,
        serverConfig: normalizeServerConfig(
          serverConfig === undefined ? this.serverConfigByRole[role] : serverConfig,
        ),
      });
    }
    // A model hash alone is deliberately insufficient: it could select a
    // process with a stale adapter allowlist, alias, cache type, or argv tune.
    // Callers without an exact identity fall through to ensure(), which
    // computes the complete key and still reuses the matching process.
    if (!exactKey) {
      if (modelSha256 !== undefined) normalizeSha256(modelSha256, "modelSha256");
      return null;
    }
    const candidates = [...this.instances.values()].filter(
      (instance) =>
        instance.status === "ready" &&
        instance.key === exactKey &&
        instance.poolRole === role &&
        (!selectedRef || instance.adapters.some((adapter) => adapter.ref === selectedRef)),
    );
    if (candidates.length === 0) return null;
    const warmSelection = { prefixHash: normalizedPrefix, loraRef: selectedRef, loraScale };
    candidates.sort((left, right) => compareWarmCandidates(left, right, warmSelection));
    const selected = candidates[0];
    selected.lastUsedAt = this.nowImpl();
    return this.#describe(selected, {
      loraRef: selectedRef,
      loraScale,
      prefixHash: normalizedPrefix,
      coldStart: false,
    });
  }

  markPrefixWarm(instanceId, prefixHash, { loraRef, adapterRef, loraScale } = {}) {
    const instance = this.#requireReadyInstance(instanceId);
    const normalized = normalizePrefixHash(prefixHash);
    if (!normalized) fail("INVALID_PREFIX_HASH", "prefixHash is required to mark an instance warm");
    const selection = loraSelection(instance, { loraRef: loraRef ?? adapterRef, loraScale });
    const selectionIdentity = loraSelectionIdentity(selection);
    if (instance.currentLoraSelection !== selectionIdentity) {
      // b10068 invalidates its prompt cache when LoRA state changes. Mirror
      // that fact locally so an old scoped affinity can never be reported as
      // warm after another adapter or scale was applied.
      instance.warmPrefixes.clear();
      instance.currentLoraSelection = selectionIdentity;
      instance.cacheEpoch += 1;
    }
    const warmKey = warmPrefixKey(instance, {
      prefixHash: normalized,
      loraRef: selection.ref,
      loraScale: selection.scale,
    });
    instance.warmPrefixes.delete(warmKey);
    instance.warmPrefixes.set(warmKey, this.nowImpl());
    while (instance.warmPrefixes.size > this.maxWarmPrefixes) {
      instance.warmPrefixes.delete(instance.warmPrefixes.keys().next().value);
    }
    instance.lastUsedAt = this.nowImpl();
    return this.#describe(instance, {
      loraRef: loraRef ?? adapterRef,
      loraScale,
      prefixHash: normalized,
      coldStart: false,
    });
  }

  buildRequestBody(instanceId, { body, loraRef, adapterRef, loraScale } = {}) {
    const instance = this.#requireReadyInstance(instanceId);
    return buildLlamaCppRequestBody({
      body,
      modelAlias: instance.alias,
      allowedAdapters: instance.adapters,
      loraRef: loraRef ?? adapterRef,
      loraScale,
    });
  }

  /**
   * Dispatch a local request and return an explicit lease. Streaming callers
   * must call release only after consuming the response body, preventing an
   * in-flight instance from being selected for LRU eviction.
   */
  async dispatch(instanceId, {
    body,
    loraRef,
    adapterRef,
    loraScale,
    prefixHash = "",
    headers = {},
    signal,
    nativeDisaggregationRequired = false,
  } = {}) {
    assertNativeDisaggregationNotRequired(nativeDisaggregationRequired);
    const instance = this.#requireReadyInstance(instanceId);
    const normalizedPrefix = normalizePrefixHash(prefixHash);
    const requestBody = this.buildRequestBody(instanceId, { body, loraRef, adapterRef, loraScale });
    const explicitRef = requestedLoraRef(loraRef ?? adapterRef);
    const bodyRef = requestedLoraRef(body?.lora_ref ?? body?.adapter_ref);
    const selectedRef = explicitRef || bodyRef;
    const selectedScale = loraScale ?? body?.lora_scale;
    // Resolve and validate the exact adapter/scale selection once. Cache
    // warmth is recorded only when the lease holder later opts in via
    // release({ warm: true }).
    const selection = loraSelection(instance, { loraRef: selectedRef, loraScale: selectedScale });
    const selectionIdentity = loraSelectionIdentity(selection);
    if (instance.currentLoraSelection !== selectionIdentity) {
      instance.warmPrefixes.clear();
      instance.currentLoraSelection = selectionIdentity;
      instance.cacheEpoch += 1;
    }
    const dispatchCacheEpoch = instance.cacheEpoch;
    const url = new URL("/v1/chat/completions", `${instance.baseUrl}/`).toString();
    assertLoopbackBaseUrl(url);
    instance.activeRequests += 1;
    instance.lastUsedAt = this.nowImpl();
    let released = false;
    const release = ({ warm = false } = {}) => {
      if (released) return;
      released = true;
      instance.activeRequests = Math.max(0, instance.activeRequests - 1);
      instance.lastUsedAt = this.nowImpl();
      if (
        warm
        && normalizedPrefix
        && this.instances.has(instance.instanceId)
        && instance.cacheEpoch === dispatchCacheEpoch
        && instance.currentLoraSelection === selectionIdentity
      ) {
        this.markPrefixWarm(instance.instanceId, normalizedPrefix, {
          loraRef: selectedRef,
          loraScale: selectedScale,
        });
      }
    };
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(requestBody),
        redirect: "error",
        signal,
      });
      return {
        response,
        requestBody,
        instance: this.#describe(instance, {
          loraRef: selectedRef,
          loraScale: selectedScale,
          prefixHash: normalizedPrefix,
          coldStart: false,
        }),
        release,
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  list() {
    return [...this.instances.values()].map((instance) => this.#describe(instance, { coldStart: false }));
  }

  async stop(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    instance.status = "stopping";
    try {
      instance.child.kill("SIGTERM");
    } catch {
      this.#removeInstance(instance, { kind: "kill-error" });
      return true;
    }
    const exited = await Promise.race([
      instance.terminalPromise.then(() => true),
      this.sleepImpl(this.shutdownGraceMs).then(() => false),
    ]);
    if (!exited && this.instances.get(instanceId) === instance) {
      try {
        instance.child.kill("SIGKILL");
      } catch {
        // The process may already be gone. Cleanup below is authoritative.
      }
      this.#removeInstance(instance, { kind: "forced-cleanup" });
    }
    return true;
  }

  async close() {
    const ids = [...this.instances.keys()];
    await Promise.all(ids.map((instanceId) => this.stop(instanceId)));
  }

  async #startInstance({ key, model, adapters, poolRole, cacheTypeK, alias, serverConfig }) {
    const releaseStartLock = await this.#acquireStartLock();
    let instance = null;
    try {
      // Serialize only the capacity decision and process registration. Health
      // checks happen outside this lock, so different models may load in
      // parallel without ever exceeding the configured bound.
      await this.#ensureCapacity();
      const port = normalizePort(await this.allocatePortImpl({ host: LLAMA_CPP_LOOPBACK_HOST }));
      const argv = buildLlamaServerArgv({
        modelPath: model.path,
        alias,
        port,
        allowedAdapters: adapters,
        cacheTypeK,
        serverConfig,
      });
      let child;
      try {
        child = this.spawnImpl(this.binary, argv, {
          shell: false,
          detached: false,
          windowsHide: true,
          stdio: "ignore",
        });
      } catch (error) {
        fail("LLAMA_SERVER_SPAWN_FAILED", `Unable to spawn llama-server: ${error?.message || "unknown error"}`);
      }
      if (!child || !Number.isInteger(child.pid) || child.pid <= 0 || typeof child.once !== "function") {
        try {
          child?.kill?.("SIGTERM");
        } catch {
          // Nothing else owns an invalid child handle.
        }
        fail("LLAMA_SERVER_SPAWN_FAILED", "spawnImpl returned an invalid llama-server process handle");
      }

      const now = this.nowImpl();
      instance = {
        key,
        instanceId: `llama-${key.slice(0, 20)}-${++this.sequence}`,
        pid: child.pid,
        child,
        port,
        baseUrl: `http://${LLAMA_CPP_LOOPBACK_HOST}:${port}`,
        alias,
        argv,
        model,
        adapters,
        poolRole,
        cacheTypeK,
        serverConfig,
        status: "starting",
        activeRequests: 0,
        warmPrefixes: new Map(),
        currentLoraSelection: loraSelectionIdentity({ ref: "", scale: null }),
        cacheEpoch: 0,
        createdAt: now,
        lastUsedAt: now,
        exit: null,
        terminalPromise: null,
      };

      instance.terminalPromise = new Promise((resolve) => {
        let terminal = false;
        const finish = (exit) => {
          if (terminal) return;
          terminal = true;
          instance.exit = exit;
          instance.status = "exited";
          this.#removeInstance(instance, exit);
          resolve(exit);
        };
        child.once("error", (error) => finish({ kind: "error", message: error?.message || "spawn error" }));
        child.once("exit", (code, signal) => finish({ kind: "exit", code, signal }));
      });

      this.instances.set(instance.instanceId, instance);
      this.instanceIdByKey.set(key, instance.instanceId);
    } finally {
      releaseStartLock();
    }

    try {
      const healthResult = await Promise.race([
        this.#waitForHealth(instance).then(() => ({ ready: true })),
        instance.terminalPromise.then((exit) => ({ ready: false, exit })),
      ]);
      if (!healthResult.ready) {
        fail("LLAMA_SERVER_EXITED", "llama-server exited before becoming ready", healthResult.exit);
      }
      instance.status = "ready";
      instance.lastUsedAt = this.nowImpl();
      return instance;
    } catch (error) {
      if (this.instances.get(instance?.instanceId) === instance) {
        this.#removeInstance(instance, { kind: "startup-failed" });
        try {
          instance.child.kill("SIGTERM");
        } catch {
          // The failed process is already absent from the bounded pool.
        }
      }
      throw error;
    }
  }

  async #acquireStartLock() {
    const previous = this.startLock;
    let release;
    this.startLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  async #waitForHealth(instance) {
    const healthUrl = new URL("/health", `${instance.baseUrl}/`).toString();
    assertLoopbackBaseUrl(healthUrl);
    const maxAttempts = Math.max(1, Math.ceil(this.startupTimeoutMs / Math.max(1, this.healthPollMs)) + 1);
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (instance.status === "exited") {
        fail("LLAMA_SERVER_EXITED", "llama-server exited during its health check", instance.exit);
      }
      try {
        const response = await this.fetchImpl(healthUrl, { method: "GET", redirect: "error" });
        if (response?.ok) return;
        if (response?.status !== 503) {
          fail("LLAMA_SERVER_HEALTH_FAILED", `llama-server health check returned HTTP ${response?.status ?? "unknown"}`);
        }
        lastError = new Error("llama-server is still loading");
      } catch (error) {
        if (error instanceof LlamaCppAdapterError) throw error;
        lastError = error;
      }
      if (attempt + 1 < maxAttempts) await this.sleepImpl(this.healthPollMs);
    }
    this.#removeInstance(instance, { kind: "startup-timeout" });
    try {
      instance.child.kill("SIGTERM");
    } catch {
      // The instance has already been removed from the pool.
    }
    fail("LLAMA_SERVER_STARTUP_TIMEOUT", `llama-server did not become ready: ${lastError?.message || "timeout"}`);
  }

  async #ensureCapacity() {
    if (this.instances.size < this.maxInstances) return;
    const evictable = [...this.instances.values()]
      .filter((instance) => instance.status === "ready" && instance.activeRequests === 0)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    if (evictable.length === 0) {
      fail("LLAMA_POOL_CAPACITY", "All bounded llama-server instances are starting or busy", {
        maxInstances: this.maxInstances,
      });
    }
    await this.stop(evictable[0].instanceId);
  }

  #describe(instance, { loraRef = "", loraScale, prefixHash = "", coldStart = false } = {}) {
    const selection = loraSelection(instance, { loraRef, loraScale });
    const adapter = selection.adapter;
    const normalizedPrefix = normalizePrefixHash(prefixHash);
    const warmKey = warmPrefixKey(instance, {
      prefixHash: normalizedPrefix,
      loraRef: selection.ref,
      loraScale: selection.scale,
    });
    return Object.freeze({
      instanceId: instance.instanceId,
      configurationKey: instance.key,
      baseUrl: instance.baseUrl,
      alias: instance.alias,
      pid: instance.pid,
      modelSha256: instance.model.sha256,
      adapterSha256: adapter?.sha256 ?? null,
      adapterId: adapter?.adapterId ?? null,
      loraRef: adapter?.ref ?? null,
      loraScale: selection.scale,
      coldStart: Boolean(coldStart),
      poolRole: instance.poolRole,
      warmPrefix: Boolean(warmKey && instance.warmPrefixes.has(warmKey)),
      activeRequests: instance.activeRequests,
      protocolBaseline: LLAMA_CPP_UPSTREAM_BUILD,
      upstreamCommit: LLAMA_CPP_UPSTREAM_COMMIT,
      nativeStateHandoff: false,
    });
  }

  #requireInstance(instanceId) {
    const id = requiredString(instanceId, "instanceId", { maxLength: 256 });
    const instance = this.instances.get(id);
    if (!instance) fail("LLAMA_INSTANCE_NOT_FOUND", `Unknown llama-server instance: ${id}`);
    return instance;
  }

  #requireReadyInstance(instanceId) {
    const instance = this.#requireInstance(instanceId);
    if (instance.status !== "ready") {
      fail("LLAMA_INSTANCE_NOT_READY", `llama-server instance is ${instance.status}`, { instanceId: instance.instanceId });
    }
    return instance;
  }

  #removeInstance(instance, exit) {
    if (this.instances.get(instance.instanceId) === instance) this.instances.delete(instance.instanceId);
    if (this.instanceIdByKey.get(instance.key) === instance.instanceId) this.instanceIdByKey.delete(instance.key);
    if (exit && !instance.exit) instance.exit = exit;
  }
}

/** Process-global singleton for the eventual gateway integration. */
export function getLlamaCppProcessPool(options) {
  if (!globalThis[DEFAULT_POOL_GLOBAL]) {
    Object.defineProperty(globalThis, DEFAULT_POOL_GLOBAL, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new LlamaCppProcessPool(options),
    });
  }
  return globalThis[DEFAULT_POOL_GLOBAL];
}
