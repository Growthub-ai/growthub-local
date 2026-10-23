#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const DEFAULT_BASE_URL = "https://www.growthub.ai";
const TEXT_LIMIT = 1024 * 1024;
const safeJson = value => JSON.stringify(value, null, 2).replaceAll(process.env.GROWTHUB_API_TOKEN || "__no_token__", "[redacted]").replace(/ghapi_[A-Za-z0-9_-]+/g, "ghapi_[redacted]");

function fail(message, details) {
  const payload = { success: false, error: message };
  if (details !== undefined) payload.details = details;
  process.stderr.write(`${safeJson(payload)}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command) fail("Missing command. Run with --help for usage.");
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) fail(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (key === "force") {
      options.force = true;
      continue;
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) fail(`Missing value for --${key}`);
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function usage() {
  return `Usage:
  growthub_api.mjs session
  growthub_api.mjs brand-kits
  growthub_api.mjs brand-create  # JSON body on stdin
  growthub_api.mjs brand-assets --brand-kit-id <id>
  growthub_api.mjs brand-versions --brand-kit-id <id>
  growthub_api.mjs brand-graph
  growthub_api.mjs brand-requests --brand-kit-id <id>
  growthub_api.mjs brand-propose --brand-kit-id <id>  # JSON body on stdin
  growthub_api.mjs brand-analytics --brand-kit-id <id>
  growthub_api.mjs brand-logs --brand-kit-id <id>
  growthub_api.mjs gallery [--page 1] [--limit 10]
  growthub_api.mjs knowledge
  growthub_api.mjs content --storage-path <path> [--bucket node_documents] [--out <path>] [--force]
  growthub_api.mjs brand-export --brand-kit-id <id> --out <path> [--force]

Environment:
  GROWTHUB_API_TOKEN       Required ghapi_ token.
  GROWTHUB_API_BASE_URL    Optional authorized Growthub base URL.
`;
}

function requireOption(options, key) {
  const value = String(options[key] ?? "").trim();
  if (!value) fail(`Missing required --${key}`);
  return value;
}

function requireBrandKitId(options) {
  return requireOption(options, "brand-kit-id");
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer`);
  return parsed;
}

function getBaseUrl() {
  const raw = String(process.env.GROWTHUB_API_BASE_URL ?? DEFAULT_BASE_URL).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("GROWTHUB_API_BASE_URL must be a valid URL");
  }
  if (url.username || url.password) fail("Base URL must not contain credentials");
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    fail("Base URL must use HTTPS, except explicit localhost HTTP");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function getToken() {
  const token = String(process.env.GROWTHUB_API_TOKEN ?? "").trim();
  if (!token) fail("GROWTHUB_API_TOKEN is required");
  if (!token.startsWith("ghapi_")) fail("GROWTHUB_API_TOKEN must be a Growthub ghapi_ token");
  return token;
}

function buildUrl(baseUrl, pathname, query = {}) {
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function decodeResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

async function requestJson({ baseUrl, token, method = "GET", pathname, query, body }) {
  const url = buildUrl(baseUrl, pathname, query);
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(55_000),
  });
  const responseBody = await decodeResponse(response);
  const receipt = {
    success: response.ok,
    request: {
      method,
      path: `${url.pathname}${url.search}`,
    },
    response: {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: responseBody,
    },
  };
  process.stdout.write(`${safeJson(receipt)}\n`);
  if (!response.ok) process.exit(1);
}

async function assertWritableOutput(path, force) {
  if (force) return;
  try {
    await access(path, fsConstants.F_OK);
    fail(`Refusing to overwrite existing output: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function requestBinary({ baseUrl, token, pathname, query, out, force }) {
  const url = buildUrl(baseUrl, pathname, query);
  const response = await fetch(url, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${token}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(55_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const receipt = {
    success: response.ok,
    request: {
      method: "GET",
      path: `${url.pathname}${url.search}`,
    },
    response: {
      status: response.status,
      contentType,
      contentDisposition: response.headers.get("content-disposition"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      magicHex: bytes.subarray(0, 16).toString("hex"),
    },
  };
  if (response.ok && out) {
    await assertWritableOutput(out, force);
    await writeFile(out, bytes);
    receipt.output = { path: out };
  }
  if (
    response.ok
    && !out
    && bytes.length <= TEXT_LIMIT
    && (contentType.startsWith("text/") || contentType.includes("json"))
  ) {
    receipt.response.text = bytes.toString("utf8");
  }
  process.stdout.write(`${safeJson(receipt)}\n`);
  if (!response.ok) process.exit(1);
}

async function readJsonStdin(label = "JSON body") {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) fail(`${label} is required on stdin`);
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${label} must be valid JSON`);
  }
}

function validateBrandCreation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail("Brand Kit creation body must be an object");
  }
  const allowed = new Set(["brand_name", "colors", "fonts", "messaging"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) fail(`Unsupported Brand Kit creation field: ${key}`);
  }
  if (typeof body.brand_name !== "string") fail("Brand Kit creation field brand_name is required");
  const brandName = body.brand_name.trim();
  if (!brandName || brandName.length > 100) {
    fail("Brand Kit creation field brand_name must contain 1 to 100 characters");
  }
  for (const key of ["colors", "fonts"]) {
    if (
      body[key] !== undefined
      && (body[key] === null || typeof body[key] !== "object" || Array.isArray(body[key]))
    ) {
      fail(`Brand Kit creation field ${key} must be an object`);
    }
  }
  if (body.messaging !== undefined && typeof body.messaging !== "string") {
    fail("Brand Kit creation field messaging must be a string");
  }
}

function validateProposal(body) {
  const required = ["baseVersionId", "kind", "title", "requestedBump", "idempotencyKey", "patch"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      fail(`Proposal field ${key} is required`);
    }
  }
  const kinds = new Set(["memory_patch", "context_patch", "file_upload", "asset_retirement"]);
  const bumps = new Set(["patch", "minor", "major"]);
  if (!kinds.has(body.kind)) fail(`Unsupported proposal kind: ${body.kind}`);
  if (!bumps.has(body.requestedBump)) fail(`Unsupported requestedBump: ${body.requestedBump}`);
  if (typeof body.patch !== "object" || Array.isArray(body.patch)) fail("Proposal patch must be an object");
  const forbidden = ["approve", "approved", "publish", "status", "reviewedBy", "appliedVersionId"];
  for (const key of forbidden) {
    if (key in body) fail(`Proposal body must not contain review or publish field: ${key}`);
  }
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === "--help" || command === "help") {
  process.stdout.write(usage());
  process.exit(0);
}

const baseUrl = getBaseUrl();
const token = getToken();

switch (command) {
  case "session":
    await requestJson({ baseUrl, token, pathname: "/api/cli/session" });
    break;
  case "brand-kits":
    await requestJson({ baseUrl, token, pathname: "/api/brand-settings" });
    break;
  case "brand-create": {
    const body = await readJsonStdin("Brand Kit creation JSON body");
    validateBrandCreation(body);
    await requestJson({
      baseUrl,
      token,
      method: "POST",
      pathname: "/api/brand-settings",
      body,
    });
    break;
  }
  case "brand-assets":
    await requestJson({
      baseUrl,
      token,
      pathname: "/api/brand-settings/assets",
      query: { brandKitId: requireBrandKitId(options) },
    });
    break;
  case "brand-versions":
    await requestJson({
      baseUrl,
      token,
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/versions`,
    });
    break;
  case "brand-graph":
    await requestJson({ baseUrl, token, pathname: "/api/v1/brand-kits/graph" });
    break;
  case "brand-requests":
    await requestJson({
      baseUrl,
      token,
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/change-requests`,
    });
    break;
  case "brand-propose": {
    const body = await readJsonStdin("Proposal JSON body");
    validateProposal(body);
    await requestJson({
      baseUrl,
      token,
      method: "POST",
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/change-requests`,
      body,
    });
    break;
  }
  case "brand-analytics":
    await requestJson({
      baseUrl,
      token,
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/analytics`,
    });
    break;
  case "brand-logs":
    await requestJson({
      baseUrl,
      token,
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/logs`,
    });
    break;
  case "gallery":
    await requestJson({
      baseUrl,
      token,
      pathname: "/api/gallery/assets",
      query: {
        page: parsePositiveInteger(options.page, 1, "page"),
        limit: parsePositiveInteger(options.limit, 10, "limit"),
      },
    });
    break;
  case "knowledge":
    await requestJson({ baseUrl, token, pathname: "/api/knowledge-base/list" });
    break;
  case "content":
    await requestBinary({
      baseUrl,
      token,
      pathname: "/api/secure-image",
      query: {
        bucket: options.bucket ?? "node_documents",
        path: requireOption(options, "storage-path"),
      },
      out: options.out,
      force: options.force === true,
    });
    break;
  case "brand-export":
    await requestBinary({
      baseUrl,
      token,
      pathname: `/api/v1/brand-kits/${encodeURIComponent(requireBrandKitId(options))}/export`,
      out: requireOption(options, "out"),
      force: options.force === true,
    });
    break;
  default:
    fail(`Unknown command: ${command}`, usage());
}
