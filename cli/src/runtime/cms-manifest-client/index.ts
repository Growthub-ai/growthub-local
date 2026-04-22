/**
 * CMS Manifest Client
 *
 * Phase B primitive: fetches the canonical `CapabilityManifestEnvelope`
 * from the hosted `/api/cms/capabilities` endpoint.
 *
 * This module is the ONE path the CLI uses to pull canonical capability
 * truth. Everything else (registry, refresh command, cache, diff,
 * projection) consumes this primitive.
 *
 * Responsibilities (per S141 / Phase B contract):
 *   - resolve hosted base URL from existing chain
 *   - GET /api/cms/capabilities with the active session bearer token
 *   - validate `X-Growthub-Api-Contract-Version` against the CLI-supported
 *     contract version
 *   - parse JSON into `CapabilityManifestEnvelope` (from `@growthub/api-contract`)
 *   - surface typed errors for each failure mode
 *
 * Non-goals:
 *   - this module does not cache, diff, or project. Those live in
 *     their sibling runtime modules.
 *   - this module does not define manifest types. Types come from
 *     `@growthub/api-contract/manifests`.
 */

import {
  API_CONTRACT_VERSION,
  type CapabilityManifest,
  type CapabilityManifestEnvelope,
  type ManifestProvenance,
} from "@growthub/api-contract";
import { readConfig } from "../../config/store.js";
import { readSession, isSessionExpired } from "../../auth/session-store.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_PATH = "/api/cms/capabilities";
const CONTRACT_VERSION_HEADER = "x-growthub-api-contract-version";
const DEFAULT_HOSTED_BASE_URL = "https://www.growthub.ai";

/** Maximum contract version this CLI build understands. Bump when support widens. */
export const CLI_SUPPORTED_CONTRACT_VERSION = API_CONTRACT_VERSION;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ManifestClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ManifestClientError";
  }
}

export class ManifestUnauthenticatedError extends ManifestClientError {
  constructor(message = "Hosted manifest requires an authenticated session. Run `growthub auth login`.") {
    super("UNAUTHENTICATED", message);
    this.name = "ManifestUnauthenticatedError";
  }
}

export class ManifestEndpointUnavailableError extends ManifestClientError {
  readonly status?: number;
  constructor(status: number | undefined, message: string) {
    super("ENDPOINT_UNAVAILABLE", message);
    this.status = status;
    this.name = "ManifestEndpointUnavailableError";
  }
}

export class ManifestContractMismatchError extends ManifestClientError {
  readonly serverVersion: string | null;
  readonly expectedVersion: number;
  constructor(serverVersion: string | null, expectedVersion: number) {
    super(
      "CONTRACT_MISMATCH",
      serverVersion === null
        ? `Hosted manifest response is missing the \`${CONTRACT_VERSION_HEADER}\` header; expected ${expectedVersion}.`
        : `Hosted manifest contract version mismatch: expected ${expectedVersion}, server reported ${serverVersion}.`,
    );
    this.serverVersion = serverVersion;
    this.expectedVersion = expectedVersion;
    this.name = "ManifestContractMismatchError";
  }
}

export class ManifestMalformedError extends ManifestClientError {
  constructor(message: string) {
    super("MALFORMED", message);
    this.name = "ManifestMalformedError";
  }
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export interface ResolvedBaseUrl {
  baseUrl: string;
  source:
    | "explicit"
    | "session"
    | "env"
    | "config.growthubBaseUrl"
    | "config.growthubPortalBaseUrl"
    | "default";
}

export interface BaseUrlResolutionOptions {
  /** Explicit `--baseUrl` flag value. */
  explicit?: string;
  /** Optional config path override. */
  configPath?: string;
  /**
   * Optional already-known session hostedBaseUrl. If omitted, the session is
   * read from the on-disk session store.
   */
  sessionHostedBaseUrl?: string | null;
}

/**
 * Resolve the hosted base URL for the CMS manifest endpoint.
 *
 * Order (locked for Phase B):
 *   1. explicit `--baseUrl`
 *   2. active CLI session `hostedBaseUrl`
 *   3. `GROWTHUB_BASE_URL`
 *   4. config `auth.growthubBaseUrl`
 *   5. config `auth.growthubPortalBaseUrl`
 *   6. default `https://www.growthub.ai`
 */
export function resolveManifestBaseUrl(opts: BaseUrlResolutionOptions = {}): ResolvedBaseUrl {
  const explicit = opts.explicit?.trim();
  if (explicit) return { baseUrl: trimSlashes(explicit), source: "explicit" };

  const sessionBase = (opts.sessionHostedBaseUrl ?? readSession()?.hostedBaseUrl)?.trim();
  if (sessionBase) return { baseUrl: trimSlashes(sessionBase), source: "session" };

  const envBase = process.env.GROWTHUB_BASE_URL?.trim();
  if (envBase) return { baseUrl: trimSlashes(envBase), source: "env" };

  try {
    const config = readConfig(opts.configPath);
    // The runtime schema (authConfigSchema in @paperclipai/shared) defines
    // `growthubBaseUrl` / `growthubPortalBaseUrl`, but the inferred type
    // narrows through `.default(...)` and hides them — same workaround the
    // rest of the CLI uses (see auth-login.ts). Widen locally.
    const authNode = config?.auth as {
      growthubBaseUrl?: string;
      growthubPortalBaseUrl?: string;
    } | undefined;
    const configuredBase = authNode?.growthubBaseUrl?.trim();
    if (configuredBase) return { baseUrl: trimSlashes(configuredBase), source: "config.growthubBaseUrl" };
    const portalBase = authNode?.growthubPortalBaseUrl?.trim();
    if (portalBase) return { baseUrl: trimSlashes(portalBase), source: "config.growthubPortalBaseUrl" };
  } catch {
    // fall through to default
  }

  return { baseUrl: DEFAULT_HOSTED_BASE_URL, source: "default" };
}

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ManifestMalformedError(`Expected object at \`${path}\`.`);
  }
  return value;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ManifestMalformedError(`Expected array at \`${path}\`.`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManifestMalformedError(`Expected non-empty string at \`${path}\`.`);
  }
  return value;
}

function normalizeProvenance(value: unknown, path: string): ManifestProvenance {
  const record = assertRecord(value, path);
  const originType = assertString(record.originType, `${path}.originType`);
  const allowed: ReadonlyArray<string> = ["hosted", "local-extension", "derived-from-workflow"];
  if (!allowed.includes(originType)) {
    throw new ManifestMalformedError(
      `Unknown provenance originType at \`${path}.originType\`: ${originType}`,
    );
  }
  return {
    originType: originType as ManifestProvenance["originType"],
    sourceHost: typeof record.sourceHost === "string" ? record.sourceHost : undefined,
    sourceWorkflowId: typeof record.sourceWorkflowId === "string" ? record.sourceWorkflowId : undefined,
    sourceManifestId: typeof record.sourceManifestId === "string" ? record.sourceManifestId : undefined,
    localExtensionPath: typeof record.localExtensionPath === "string" ? record.localExtensionPath : undefined,
    recordedAt: typeof record.recordedAt === "string" ? record.recordedAt : undefined,
    note: typeof record.note === "string" ? record.note : undefined,
  };
}

function normalizeManifestEntry(value: unknown, idx: number): CapabilityManifest {
  const record = assertRecord(value, `capabilities[${idx}]`);
  const slug = assertString(record.slug, `capabilities[${idx}].slug`);
  const family = assertString(record.family, `capabilities[${idx}].family`);
  const displayName = assertString(record.displayName, `capabilities[${idx}].displayName`);
  const executionKind = assertString(record.executionKind, `capabilities[${idx}].executionKind`);
  const requiredBindings = assertArray(record.requiredBindings, `capabilities[${idx}].requiredBindings`)
    .map((entry, i) => assertString(entry, `capabilities[${idx}].requiredBindings[${i}]`));
  const outputTypes = assertArray(record.outputTypes, `capabilities[${idx}].outputTypes`)
    .map((entry, i) => assertString(entry, `capabilities[${idx}].outputTypes[${i}]`));
  const node = assertRecord(record.node, `capabilities[${idx}].node`);
  const provenance = normalizeProvenance(record.provenance, `capabilities[${idx}].provenance`);

  // Trust the contract package to encode CapabilityManifest. Unknown fields
  // (inputSchema, outputSchema, providerHints, executionHints) are forwarded
  // as-is. We only guard the required keys strongly.
  return {
    slug,
    family: family as CapabilityManifest["family"],
    displayName,
    executionKind: executionKind as CapabilityManifest["executionKind"],
    requiredBindings,
    outputTypes,
    node: node as unknown as CapabilityManifest["node"],
    inputSchema: record.inputSchema as CapabilityManifest["inputSchema"],
    outputSchema: record.outputSchema as CapabilityManifest["outputSchema"],
    providerHints: record.providerHints as CapabilityManifest["providerHints"],
    executionHints: record.executionHints as CapabilityManifest["executionHints"],
    provenance,
  };
}

function normalizeEnvelope(raw: unknown): CapabilityManifestEnvelope {
  const record = assertRecord(raw, "envelope");

  if (record.version !== 1) {
    throw new ManifestMalformedError(
      `Unsupported envelope version: ${String(record.version)} (expected 1).`,
    );
  }
  const host = assertString(record.host, "host");
  const fetchedAt = assertString(record.fetchedAt, "fetchedAt");
  const source = assertString(record.source, "source");
  const allowedSources: ReadonlyArray<string> = ["hosted", "local-extension", "derived"];
  if (!allowedSources.includes(source)) {
    throw new ManifestMalformedError(`Unknown envelope source: ${source}`);
  }

  const capabilities = assertArray(record.capabilities, "capabilities")
    .map((entry, idx) => normalizeManifestEntry(entry, idx));

  const provenance = record.provenance !== undefined
    ? normalizeProvenance(record.provenance, "provenance")
    : undefined;

  return {
    version: 1,
    host,
    fetchedAt,
    source: source as CapabilityManifestEnvelope["source"],
    capabilities,
    provenance,
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface FetchManifestOptions extends BaseUrlResolutionOptions {
  /** Optional fetch timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * If true, do not attach the active session bearer token. Used for smoke
   * tests against public manifest surfaces; NOT the normal path.
   */
  anonymous?: boolean;
}

export interface FetchManifestResult {
  envelope: CapabilityManifestEnvelope;
  /** Resolved base URL used to compose the request. */
  resolvedBaseUrl: ResolvedBaseUrl;
  /** Contract version as reported by the server header, if present. */
  serverContractVersion: string | null;
}

function parseContractVersionHeader(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetch and validate the canonical manifest envelope from the hosted
 * `/api/cms/capabilities` endpoint.
 *
 * Throws:
 *   - {@link ManifestUnauthenticatedError} — no session / session expired
 *     and server required auth (401/403).
 *   - {@link ManifestEndpointUnavailableError} — 404/501 or transport error.
 *   - {@link ManifestContractMismatchError} — version header mismatch.
 *   - {@link ManifestMalformedError} — unparseable / structurally invalid body.
 */
export async function fetchCapabilityManifest(
  opts: FetchManifestOptions = {},
): Promise<FetchManifestResult> {
  const resolvedBaseUrl = resolveManifestBaseUrl(opts);
  const url = new URL(MANIFEST_PATH, `${resolvedBaseUrl.baseUrl}/`).toString();

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (!opts.anonymous) {
    const session = readSession();
    if (session && isSessionExpired(session)) {
      throw new ManifestUnauthenticatedError(
        "Hosted session expired. Run `growthub auth login` to re-authenticate.",
      );
    }
    if (session) {
      headers.authorization = `Bearer ${session.accessToken}`;
      if (session.userId) headers["x-user-id"] = session.userId;
    }
  }

  const controller = opts.timeoutMs && opts.timeoutMs > 0 ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller?.signal,
    });
  } catch (err) {
    throw new ManifestEndpointUnavailableError(
      undefined,
      `Hosted manifest endpoint unreachable (${url}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ManifestUnauthenticatedError(
      `Hosted manifest endpoint returned ${response.status}. Run \`growthub auth login\` to authenticate.`,
    );
  }

  if (response.status === 404 || response.status === 501) {
    throw new ManifestEndpointUnavailableError(
      response.status,
      `Hosted manifest endpoint not available (status ${response.status}). The hosted app may not yet expose /api/cms/capabilities.`,
    );
  }

  if (!response.ok) {
    throw new ManifestEndpointUnavailableError(
      response.status,
      `Hosted manifest endpoint failed (status ${response.status}).`,
    );
  }

  const rawHeader = response.headers.get(CONTRACT_VERSION_HEADER);
  const serverVersion = parseContractVersionHeader(rawHeader);

  if (rawHeader === null) {
    throw new ManifestContractMismatchError(null, CLI_SUPPORTED_CONTRACT_VERSION);
  }
  if (serverVersion !== CLI_SUPPORTED_CONTRACT_VERSION) {
    throw new ManifestContractMismatchError(rawHeader, CLI_SUPPORTED_CONTRACT_VERSION);
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (err) {
    throw new ManifestMalformedError(
      `Failed to read manifest response body: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (err) {
    throw new ManifestMalformedError(
      `Failed to parse manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const envelope = normalizeEnvelope(parsed);

  return {
    envelope,
    resolvedBaseUrl,
    serverContractVersion: rawHeader,
  };
}
