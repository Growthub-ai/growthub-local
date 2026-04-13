import { PaperclipApiClient, ApiRequestError } from "../client/http.js";
import type { CliAuthSession } from "./session-store.js";
import type { ExecutionPreferences, HostedProfileOverlay } from "./overlay-store.js";

/**
 * Thin hosted client used by the CLI profile bridge.
 *
 * The CLI never speaks raw Supabase/BetterAuth — it only calls a small set of
 * CLI-scoped endpoints on the hosted Growthub app (gh-app). Endpoints are
 * treated as best-effort: when they respond 404, the profile bridge falls
 * back to the locally cached overlay so the user still sees a useful state.
 */

const DEFAULT_PULL_PATH = "/api/cli/profile";
const DEFAULT_PUSH_PATH = "/api/cli/profile";
const DEFAULT_SESSION_PATH = "/api/cli/session";

export interface PullProfileResponse {
  userId?: string;
  email?: string;
  displayName?: string;
  orgId?: string;
  orgName?: string;
  entitlements?: string[];
  gatedKitSlugs?: string[];
  executionDefaults?: Partial<ExecutionPreferences>;
  extra?: Record<string, unknown>;
}

export interface PushProfilePayload {
  linkedInstanceId?: string;
  surfaceProfile?: "dx" | "gtm" | null;
  machineLabel?: string | null;
  workspaceLabel?: string | null;
  localKitManifests?: Array<{ slug: string; version: string }>;
}

export interface HostedSessionResponse {
  userId?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  expiresAt?: string;
}

function toApiClient(session: CliAuthSession): PaperclipApiClient {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken,
  });
}

export class HostedEndpointUnavailableError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchHostedSession(session: CliAuthSession): Promise<HostedSessionResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<HostedSessionResponse>(DEFAULT_SESSION_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function fetchHostedProfile(
  session: CliAuthSession,
): Promise<PullProfileResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<PullProfileResponse>(DEFAULT_PULL_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function pushHostedProfile(
  session: CliAuthSession,
  payload: PushProfilePayload,
): Promise<HostedProfileOverlay | null> {
  const client = toApiClient(session);
  try {
    return await client.post<HostedProfileOverlay>(DEFAULT_PUSH_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
