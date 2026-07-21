/**
 * Server-owned outbound network and artifact verification policy for governed
 * compute providers. This module is Node-only by design: DNS pinning, TLS
 * verification, bounded streaming, realpath checks, and file-type checks must
 * happen on the server rather than inside provider adapters or browser code.
 */

import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPUTE_NETWORK_ALLOWLIST_ENV = "GROWTHUB_COMPUTE_NETWORK_ALLOWLIST";
export const COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV = "GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST";
export const COMPUTE_ARTIFACT_ROOTS_ENV = "GROWTHUB_COMPUTE_ARTIFACT_ROOTS";
export const COMPUTE_ARTIFACT_MAX_BYTES_ENV = "GROWTHUB_COMPUTE_ARTIFACT_MAX_BYTES";

const DEFAULT_JSON_MAX_BYTES = 1024 * 1024;
const DEFAULT_ARTIFACT_MAX_BYTES = 20 * 1024 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const BUILTIN_PUBLIC_HOSTS = Object.freeze([
  "rest.runpod.io",
  "api.runpod.io",
  "api.runpod.ai",
]);
const FORBIDDEN_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.google",
  "metadata.aws.internal",
  "instance-data.ec2.internal",
]);

function str(value) {
  return String(value ?? "").trim();
}

function normalizeHost(value) {
  return str(value).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function parseComputeHostAllowList(value) {
  return str(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return normalizeHost(new URL(entry.includes("://") ? entry : `https://${entry}`).hostname);
      } catch {
        return normalizeHost(entry);
      }
    })
    .filter(Boolean);
}

function hostMatches(hostname, rules) {
  const host = normalizeHost(hostname);
  return rules.some((rule) => {
    const normalized = normalizeHost(rule);
    if (!normalized) return false;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1);
      return host.endsWith(suffix) && host !== normalized.slice(2);
    }
    return host === normalized;
  });
}

export function privateOrReservedAddress(address) {
  const value = normalizeHost(address);
  const family = isIP(value);
  if (family === 4) {
    const parts = value.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b, c] = parts;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    if (value === "::" || value === "::1") return true;
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value)) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateOrReservedAddress(mapped[1]) : false;
  }
  return true;
}

function boundedPositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

export async function authorizeComputeUrl(rawUrl, {
  env = process.env,
  resolveHostname = dnsLookup,
  builtinHosts = BUILTIN_PUBLIC_HOSTS,
} = {}) {
  let url;
  try {
    url = new URL(str(rawUrl));
  } catch {
    throw new Error("compute outbound URL is not a valid absolute URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("compute outbound URL must use HTTP(S)");
  if (url.username || url.password) throw new Error("compute outbound URL must not contain credentials");
  const hostname = normalizeHost(url.hostname);
  if (!hostname || FORBIDDEN_METADATA_HOSTS.has(hostname)) throw new Error(`compute outbound hostname "${hostname || "(missing)"}" is forbidden`);

  const operatorAllowList = parseComputeHostAllowList(env?.[COMPUTE_NETWORK_ALLOWLIST_ENV]);
  const publicRules = [...builtinHosts, ...operatorAllowList];
  if (!hostMatches(hostname, publicRules)) {
    throw new Error(`compute outbound hostname "${hostname}" is not in the operator allowlist`);
  }

  let addresses;
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await resolveHostname(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error(`compute outbound hostname "${hostname}" did not resolve`);
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error(`compute outbound hostname "${hostname}" did not resolve`);

  const privateRules = parseComputeHostAllowList(env?.[COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV]);
  const privateApproved = hostMatches(hostname, privateRules);
  const normalizedAddresses = addresses.map((entry) => ({
    address: normalizeHost(entry?.address),
    family: Number(entry?.family) || isIP(entry?.address),
  }));
  if (normalizedAddresses.some((entry) => privateOrReservedAddress(entry.address)) && !privateApproved) {
    throw new Error(`compute outbound hostname "${hostname}" resolves to a private, loopback, link-local, or reserved address`);
  }

  return { url, hostname, address: normalizedAddresses[0].address, family: normalizedAddresses[0].family || isIP(normalizedAddresses[0].address) };
}

function pinnedRequest({ authorization, init = {}, timeoutMs, maxBytes, onChunk }) {
  const { url, hostname, address, family } = authorization;
  const transport = url.protocol === "https:" ? https : http;
  const method = str(init.method || "GET").toUpperCase();
  const headers = { ...(init.headers || {}) };
  const body = init.body == null ? null : Buffer.isBuffer(init.body) ? init.body : Buffer.from(String(init.body));
  if (body && headers["content-length"] === undefined && headers["Content-Length"] === undefined) headers["content-length"] = String(body.byteLength);

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      method,
      path: `${url.pathname}${url.search}`,
      headers,
      servername: url.protocol === "https:" ? hostname : undefined,
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, (response) => {
      const status = Number(response.statusCode) || 0;
      if (status >= 300 && status < 400) {
        response.resume();
        reject(new Error(`compute outbound redirects are refused (HTTP ${status})`));
        return;
      }
      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy();
        reject(new Error(`compute outbound response exceeds ${maxBytes} bytes`));
        return;
      }
      let received = 0;
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          response.destroy(new Error(`compute outbound response exceeds ${maxBytes} bytes`));
          return;
        }
        onChunk(chunk);
      });
      response.on("end", () => resolve({ status, headers: response.headers, received }));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`compute outbound request timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export function createGovernedComputeFetchJson({
  env = process.env,
  resolveHostname = dnsLookup,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_JSON_MAX_BYTES,
} = {}) {
  const responseLimit = boundedPositiveInteger(maxResponseBytes, DEFAULT_JSON_MAX_BYTES, 16 * 1024 * 1024);
  const timeout = boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 120_000);
  return async function governedComputeFetchJson(rawUrl, init = {}) {
    const authorization = await authorizeComputeUrl(rawUrl, { env, resolveHostname });
    const chunks = [];
    const response = await pinnedRequest({ authorization, init: { ...init, redirect: "manual" }, timeoutMs: timeout, maxBytes: responseLimit, onChunk: (chunk) => chunks.push(Buffer.from(chunk)) });
    const text = Buffer.concat(chunks).toString("utf8");
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (response.status < 200 || response.status >= 300) {
      const detail = str(parsed?.message || parsed?.error || text.slice(0, 200));
      const error = new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      error.status = response.status;
      throw error;
    }
    return parsed;
  };
}

function withinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function artifactRoots(env) {
  const configured = str(env?.[COMPUTE_ARTIFACT_ROOTS_ENV]);
  const roots = configured ? configured.split(",").map((entry) => entry.trim()).filter(Boolean) : [path.resolve(process.cwd(), "artifacts")];
  return roots.map((root) => path.resolve(root));
}

async function hashLocalArtifact(filePath, maxBytes) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink()) throw new Error("artifact locator may not be a symbolic link");
  if (!stat.isFile()) throw new Error("artifact locator must identify a regular file");
  if (stat.size > maxBytes) throw new Error(`artifact exceeds ${maxBytes} bytes`);
  const hash = createHash("sha256");
  let sizeBytes = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        stream.destroy(new Error(`artifact exceeds ${maxBytes} bytes`));
        return;
      }
      hash.update(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return { verifiedSha256: hash.digest("hex"), sizeBytes, verificationKind: "governed-local-file-stream" };
}

async function hashHttpArtifact(locator, { env, resolveHostname, maxBytes, timeoutMs }) {
  const authorization = await authorizeComputeUrl(locator, { env, resolveHostname });
  const hash = createHash("sha256");
  const response = await pinnedRequest({ authorization, init: { method: "GET", redirect: "manual" }, timeoutMs, maxBytes, onChunk: (chunk) => hash.update(chunk) });
  if (response.status < 200 || response.status >= 300) throw new Error(`artifact readback HTTP ${response.status}`);
  return { verifiedSha256: hash.digest("hex"), sizeBytes: response.received, verificationKind: "governed-http-stream" };
}

export async function verifyGovernedComputeArtifact({
  artifact,
  workSpec,
  env = process.env,
  resolveHostname = dnsLookup,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const locator = str(artifact?.locator);
  const claimedSha = str(artifact?.sha256).toLowerCase();
  if (!locator) throw new Error("artifact locator missing");
  if (!/^[a-f0-9]{64}$/.test(claimedSha)) throw new Error("artifact SHA-256 claim must be a 64-character lowercase hex digest");
  const expectedKinds = Array.isArray(workSpec?.output?.expectedKinds) ? workSpec.output.expectedKinds.map(String).filter(Boolean) : [];
  if (expectedKinds.length && !expectedKinds.includes(str(artifact?.kind))) throw new Error(`artifact kind "${str(artifact?.kind)}" is not allowed by the work spec`);

  const maxBytes = boundedPositiveInteger(env?.[COMPUTE_ARTIFACT_MAX_BYTES_ENV], DEFAULT_ARTIFACT_MAX_BYTES);
  let verification;
  if (/^https?:\/\//i.test(locator)) {
    verification = await hashHttpArtifact(locator, { env, resolveHostname, maxBytes, timeoutMs: boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 120_000) });
  } else {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(locator) && !locator.toLowerCase().startsWith("file://")) {
      throw new Error("artifact locator scheme is unsupported until the governed remote data plane is configured");
    }
    const lexicalPath = locator.toLowerCase().startsWith("file://") ? fileURLToPath(locator) : locator;
    const candidate = path.resolve(lexicalPath);
    const expectedPath = str(workSpec?.output?.artifactPath);
    if (!expectedPath) throw new Error("work spec output artifactPath is required for local artifact verification");
    const expected = path.resolve(expectedPath);
    const roots = artifactRoots(env);
    const owningRoot = roots.find((root) => withinRoot(root, candidate) && withinRoot(root, expected));
    if (!owningRoot) throw new Error("artifact path is outside the operator-governed artifact roots");
    if (!(candidate === expected || withinRoot(expected, candidate))) throw new Error("artifact path is not the work spec output path or one of its children");
    const [realRoot, realCandidate] = await Promise.all([fs.realpath(owningRoot), fs.realpath(candidate)]);
    if (!withinRoot(realRoot, realCandidate)) throw new Error("artifact realpath escapes the operator-governed artifact root");
    verification = await hashLocalArtifact(realCandidate, maxBytes);
  }

  if (verification.verifiedSha256 !== claimedSha) throw new Error("materialized artifact SHA-256 does not match provider claim");
  if (Number(artifact?.sizeBytes) > 0 && Number(artifact.sizeBytes) !== verification.sizeBytes) throw new Error("materialized artifact size does not match provider claim");
  return verification;
}
