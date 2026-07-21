/**
 * Server-only outbound policy for governed provider compute.
 *
 * Every provider request is DNS-resolved before connection and pinned to the
 * validated address. Private, loopback, link-local, multicast, documentation,
 * and reserved addresses fail closed unless the original hostname is present
 * in the operator-owned allowlist. Redirects are manual and revalidated.
 * Artifact verification hashes streams under an explicit byte ceiling and
 * restricts local reads to a canonical operator-owned artifact root.
 */

import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV = "GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST";
export const COMPUTE_ARTIFACT_ROOT_ENV = "GROWTHUB_COMPUTE_ARTIFACT_ROOT";
export const COMPUTE_ARTIFACT_MAX_BYTES_ENV = "GROWTHUB_COMPUTE_ARTIFACT_MAX_BYTES";
export const COMPUTE_JSON_MAX_BYTES_ENV = "GROWTHUB_COMPUTE_JSON_MAX_BYTES";

export const DEFAULT_COMPUTE_JSON_MAX_BYTES = 1024 * 1024;
export const DEFAULT_COMPUTE_ARTIFACT_MAX_BYTES = 128 * 1024 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "modal-key",
  "modal-secret",
]);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function computeOutboundPolicyFromEnv(env = process.env) {
  return {
    privateHostAllowlist: parseOperatorHostAllowlist(env?.[COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV]),
    artifactRoot: String(env?.[COMPUTE_ARTIFACT_ROOT_ENV] || path.resolve(process.cwd(), "artifacts")).trim(),
    artifactMaxBytes: positiveInteger(env?.[COMPUTE_ARTIFACT_MAX_BYTES_ENV], DEFAULT_COMPUTE_ARTIFACT_MAX_BYTES),
    jsonMaxBytes: positiveInteger(env?.[COMPUTE_JSON_MAX_BYTES_ENV], DEFAULT_COMPUTE_JSON_MAX_BYTES),
  };
}

export function parseOperatorHostAllowlist(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map((entry) => {
    const raw = String(entry || "").trim().toLowerCase();
    if (!raw) return "";
    try {
      return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
    } catch {
      return raw;
    }
  }).filter(Boolean);
}

export function allowlistMatches(hostname, allowlist = []) {
  const host = String(hostname || "").toLowerCase();
  return parseOperatorHostAllowlist(allowlist).some((entry) => {
    if (entry.startsWith("*.")) return host.endsWith(entry.slice(1)) && host !== entry.slice(2);
    return host === entry;
  });
}

function ipv4Parts(address) {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

export function isPrivateOrReservedAddress(address) {
  const value = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(value);
  if (family === 4) {
    const [a, b, c] = ipv4Parts(value);
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    if (value === "::" || value === "::1") return true;
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value) || /^2001:db8(?::|$)/.test(value)) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateOrReservedAddress(mapped[1]) : false;
  }
  return true;
}

function normalizeAddressRecord(record) {
  if (!record) return null;
  if (typeof record === "string") return { address: record, family: isIP(record) };
  const address = String(record.address || "");
  const family = Number(record.family) || isIP(address);
  return address && (family === 4 || family === 6) ? { address, family } : null;
}

async function resolveAll(hostname, resolveHostname) {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  const result = await resolveHostname(hostname, { all: true, verbatim: true });
  const list = Array.isArray(result) ? result : [result];
  return list.map(normalizeAddressRecord).filter(Boolean);
}

export async function assertComputeUrlAllowed(input, {
  privateHostAllowlist = [],
  resolveHostname = dnsLookup,
} = {}) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(String(input || ""));
  } catch {
    throw new TypeError("compute outbound URL must be an absolute HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("compute outbound URL must use HTTP or HTTPS");
  if (url.username || url.password) throw new TypeError("compute outbound URL must not embed credentials");
  const hostname = url.hostname.toLowerCase();
  if (!hostname) throw new TypeError("compute outbound URL hostname is required");
  const privateAllowed = allowlistMatches(hostname, privateHostAllowlist);
  const addresses = await resolveAll(hostname, resolveHostname);
  if (addresses.length === 0) throw new Error(`compute outbound hostname ${hostname} did not resolve`);
  if (!privateAllowed && addresses.some(({ address }) => isPrivateOrReservedAddress(address))) {
    throw new Error(`compute outbound hostname ${hostname} resolves to a private, loopback, link-local, multicast, documentation, or reserved address`);
  }
  return { url, addresses, selected: addresses[0], privateAllowed };
}

function normalizedHeaders(headers = {}) {
  const output = {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    for (const [key, value] of headers.entries()) output[key] = value;
    return output;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) output[String(key)] = String(value);
    return output;
  }
  for (const [key, value] of Object.entries(headers || {})) {
    if (value !== undefined) output[key] = String(value);
  }
  return output;
}

function stripSensitiveHeaders(headers) {
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_REDIRECT_HEADERS.has(key.toLowerCase())) output[key] = value;
  }
  return output;
}

function requestBody(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("compute outbound request body must be a string or byte array");
}

function combinedSignal(signal, timeoutMs) {
  const controller = new AbortController();
  let timer = null;
  const abort = () => controller.abort(signal?.reason || new Error("compute outbound request aborted"));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  timer = setTimeout(() => controller.abort(new Error("compute outbound request timed out")), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    },
  };
}

async function requestOnce(url, init, policy) {
  const target = await assertComputeUrlAllowed(url, policy);
  const body = requestBody(init.body);
  if (body && body.byteLength > MAX_REQUEST_BYTES) throw new Error(`compute outbound request body exceeds ${MAX_REQUEST_BYTES} bytes`);
  const headers = normalizedHeaders(init.headers);
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) headers["content-length"] = String(body.byteLength);
  const timeout = combinedSignal(init.signal, positiveInteger(init.timeoutMs, DEFAULT_TIMEOUT_MS));
  const transport = target.url.protocol === "https:" ? https : http;
  try {
    return await new Promise((resolve, reject) => {
      const req = transport.request(target.url, {
        method: String(init.method || "GET").toUpperCase(),
        headers,
        signal: timeout.signal,
        servername: target.url.protocol === "https:" && !isIP(target.url.hostname) ? target.url.hostname : undefined,
        lookup(_hostname, options, callback) {
          if (options?.all) callback(null, [{ address: target.selected.address, family: target.selected.family }]);
          else callback(null, target.selected.address, target.selected.family);
        },
      }, (response) => resolve({ response, target }));
      req.once("error", reject);
      if (body) req.end(body);
      else req.end();
    });
  } finally {
    timeout.cleanup();
  }
}

async function requestWithRedirects(input, init = {}, {
  privateHostAllowlist = [],
  resolveHostname = dnsLookup,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  allowCrossOriginRedirects = false,
} = {}) {
  let current = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
  let method = String(init.method || "GET").toUpperCase();
  let body = init.body;
  let headers = normalizedHeaders(init.headers);
  for (let redirect = 0; ; redirect += 1) {
    const { response, target } = await requestOnce(current, { ...init, method, body, headers }, { privateHostAllowlist, resolveHostname });
    if (!REDIRECT_STATUSES.has(response.statusCode) || !response.headers.location) return { response, finalUrl: target.url };
    response.resume();
    if (redirect >= maxRedirects) throw new Error(`compute outbound redirect limit ${maxRedirects} exceeded`);
    if (!["GET", "HEAD"].includes(method)) throw new Error("compute outbound redirects are refused for mutating requests");
    const next = new URL(response.headers.location, current);
    if (next.origin !== current.origin) {
      if (!allowCrossOriginRedirects) throw new Error("compute outbound cross-origin redirect refused");
      headers = stripSensitiveHeaders(headers);
    }
    if (response.statusCode === 303) {
      method = "GET";
      body = null;
    }
    current = next;
  }
}

async function readBounded(stream, maxBytes) {
  const declared = Number(stream.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`compute outbound response declares ${declared} bytes (limit ${maxBytes})`);
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBytes) {
      stream.destroy();
      throw new Error(`compute outbound response exceeds ${maxBytes} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export async function fetchComputeJson(input, init = {}, options = {}) {
  const envPolicy = computeOutboundPolicyFromEnv(options.env || process.env);
  const { response } = await requestWithRedirects(input, init, {
    privateHostAllowlist: options.privateHostAllowlist || envPolicy.privateHostAllowlist,
    resolveHostname: options.resolveHostname || dnsLookup,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    allowCrossOriginRedirects: false,
  });
  const bytes = await readBounded(response, positiveInteger(options.maxBytes, envPolicy.jsonMaxBytes));
  const text = bytes.toString("utf8");
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("compute provider returned invalid JSON");
    }
  }
  if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
    const detail = String(parsed?.message || parsed?.error || text).slice(0, 200);
    const error = new Error(`compute provider HTTP ${response.statusCode}${detail ? `: ${detail}` : ""}`);
    error.status = response.statusCode;
    throw error;
  }
  return parsed;
}

function pathContains(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function locatorPath(locator) {
  if (/^file:/i.test(locator)) {
    const url = new URL(locator);
    if (url.username || url.password || (url.hostname && url.hostname !== "localhost")) throw new TypeError("local artifact file URL is invalid");
    return fileURLToPath(url);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(locator)) throw new TypeError("artifact locator scheme is unsupported");
  if (locator.split(/[\\/]+/).includes("..")) throw new TypeError("artifact locator must not contain parent traversal");
  return locator;
}

function validateArtifactBinding(artifact, workSpec) {
  if (!artifact || typeof artifact !== "object") throw new TypeError("artifact evidence is required");
  if (!workSpec || typeof workSpec !== "object" || !String(workSpec.workSpecHash || "")) throw new TypeError("server-owned work spec is required for artifact verification");
  const claimedHash = String(artifact.sha256 || "").toLowerCase();
  if (!SHA256_HEX.test(claimedHash)) throw new TypeError("artifact sha256 must be a 64-character hex digest");
  if (artifact.workSpecHash && String(artifact.workSpecHash) !== String(workSpec.workSpecHash)) throw new Error("artifact work-spec lineage mismatch");
  const expectedKinds = Array.isArray(workSpec.output?.expectedKinds) ? workSpec.output.expectedKinds.map(String).filter(Boolean) : [];
  const kind = String(artifact.kind || "");
  if (expectedKinds.length > 0 && !expectedKinds.includes(kind)) throw new Error(`artifact kind "${kind}" is not allowed by the server-owned work spec`);
  return claimedHash;
}

async function hashStream(stream, maxBytes) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBytes) {
      stream.destroy?.();
      throw new Error(`artifact exceeds ${maxBytes} bytes`);
    }
    hash.update(bytes);
  }
  return { sha256: hash.digest("hex"), sizeBytes: size };
}

async function verifyHttpArtifact(locator, maxBytes, options) {
  const { response, finalUrl } = await requestWithRedirects(locator, { method: "GET" }, {
    privateHostAllowlist: options.privateHostAllowlist,
    resolveHostname: options.resolveHostname,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    allowCrossOriginRedirects: true,
  });
  if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
    response.resume();
    throw new Error(`artifact readback HTTP ${response.statusCode}`);
  }
  const encoding = String(response.headers["content-encoding"] || "identity").toLowerCase();
  if (encoding && encoding !== "identity") {
    response.resume();
    throw new Error(`artifact readback content-encoding "${encoding}" is unsupported; hash identity must cover the returned bytes`);
  }
  const declared = Number(response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.resume();
    throw new Error(`artifact declares ${declared} bytes (limit ${maxBytes})`);
  }
  const result = await hashStream(response, maxBytes);
  return { ...result, verificationKind: "streamed-http-sha256", finalLocator: finalUrl.toString() };
}

async function verifyLocalArtifact(locator, maxBytes, artifactRoot, workSpec) {
  const rawPath = locatorPath(locator);
  const configuredRoot = String(artifactRoot || "").trim();
  if (!configuredRoot) throw new Error(`${COMPUTE_ARTIFACT_ROOT_ENV} is required for local artifact verification`);
  const root = await realpath(path.resolve(configuredRoot));
  const requested = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(process.cwd(), rawPath);
  const target = await realpath(requested);
  if (!pathContains(root, target)) throw new Error("artifact path escapes the governed artifact root");
  const metadata = await lstat(requested);
  if (metadata.isSymbolicLink()) throw new Error("artifact path must not be a symbolic link");
  if (!metadata.isFile()) throw new Error("artifact path must identify a regular file");
  if (metadata.size > maxBytes) throw new Error(`artifact is ${metadata.size} bytes (limit ${maxBytes})`);

  const expectedPath = String(workSpec.output?.artifactPath || "").trim();
  if (expectedPath) {
    const expected = path.isAbsolute(expectedPath) ? path.resolve(expectedPath) : path.resolve(process.cwd(), expectedPath);
    if (!pathContains(expected, target) && target !== expected) throw new Error("artifact path is outside the server-owned work-spec output path");
  }
  const result = await hashStream(createReadStream(target), maxBytes);
  return { ...result, verificationKind: "streamed-file-sha256", finalLocator: target };
}

export async function verifyComputeArtifactMaterialization(artifact, workSpec, options = {}) {
  const claimedHash = validateArtifactBinding(artifact, workSpec);
  const locator = String(artifact.locator || artifact.path || "").trim();
  if (!locator) throw new TypeError("artifact locator missing");
  const envPolicy = computeOutboundPolicyFromEnv(options.env || process.env);
  const maxBytes = positiveInteger(options.maxBytes, envPolicy.artifactMaxBytes);
  const policy = {
    privateHostAllowlist: options.privateHostAllowlist || envPolicy.privateHostAllowlist,
    resolveHostname: options.resolveHostname || dnsLookup,
    maxRedirects: options.maxRedirects,
  };
  const verified = /^https?:\/\//i.test(locator)
    ? await verifyHttpArtifact(locator, maxBytes, policy)
    : await verifyLocalArtifact(locator, maxBytes, options.artifactRoot || envPolicy.artifactRoot, workSpec);
  if (verified.sha256 !== claimedHash) throw new Error("materialized artifact SHA-256 does not match provider claim");
  const claimedSize = Math.max(0, Math.floor(Number(artifact.sizeBytes) || 0));
  if (claimedSize > 0 && claimedSize !== verified.sizeBytes) throw new Error(`materialized artifact size ${verified.sizeBytes} does not match provider claim ${claimedSize}`);
  return {
    verifiedSha256: verified.sha256,
    verificationKind: verified.verificationKind,
    sizeBytes: verified.sizeBytes,
    finalLocator: verified.finalLocator,
  };
}
