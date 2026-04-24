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
const DEFAULT_WORKFLOWS_PATH = "/api/cli/profile?view=workflows";
const DEFAULT_WORKFLOW_DETAIL_PATH = "/api/cli/profile?view=workflow";
const DEFAULT_WORKFLOW_SAVE_PATH = "/api/cli/profile?action=save-workflow";
const DEFAULT_WORKFLOW_ARCHIVE_PATH = "/api/cli/profile?action=archive-workflow";
const DEFAULT_WORKFLOW_DELETE_PATH = "/api/cli/profile?action=delete-workflow";
const DEFAULT_CREDITS_PATH = "/api/cli/profile?view=credits";
const DEFAULT_COMPOSITION_DEPLOY_PATH = "/api/cli/profile?action=deploy-composition";

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

export interface HostedWorkflowRecord {
  workflowId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  latestVersion?: {
    versionId: string;
    version: number;
    createdAt: string;
    nodeCount: number;
  } | null;
}

export interface HostedWorkflowListResponse {
  userId: string;
  workflows: HostedWorkflowRecord[];
}

export interface HostedWorkflowDetailResponse {
  workflowId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    versionId: string;
    version: number;
    createdAt: string;
    config: Record<string, unknown>;
  };
}

export interface HostedWorkflowSavePayload {
  workflowId?: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface HostedWorkflowSaveResponse {
  workflowId: string;
  versionId: string;
  version: number;
  created: boolean;
}

export interface HostedCompositionDeployPayload {
  name?: string;
  manifest: Record<string, unknown>;
}

export interface HostedCompositionDeployResponse {
  ok: boolean;
  compositionId?: string;
  version?: number;
  url?: string;
}

export interface HostedWorkflowLifecyclePayload {
  workflowId: string;
}

export interface HostedWorkflowLifecycleResponse {
  workflowId: string;
  ok: boolean;
}

export interface HostedCreditsResponse {
  userId: string;
  totalAvailable: number;
  baseCredits: number;
  purchasedCredits: number;
  creditsUsedThisPeriod: number;
  creditsPerMonth: number;
  planTier: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
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

export async function listHostedWorkflows(
  session: CliAuthSession,
): Promise<HostedWorkflowListResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<HostedWorkflowListResponse>(DEFAULT_WORKFLOWS_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function fetchHostedWorkflow(
  session: CliAuthSession,
  workflowId: string,
): Promise<HostedWorkflowDetailResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<HostedWorkflowDetailResponse>(
      `${DEFAULT_WORKFLOW_DETAIL_PATH}&workflowId=${encodeURIComponent(workflowId)}`,
      { ignoreNotFound: true },
    );
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function saveHostedWorkflow(
  session: CliAuthSession,
  payload: HostedWorkflowSavePayload,
): Promise<HostedWorkflowSaveResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.post<HostedWorkflowSaveResponse>(DEFAULT_WORKFLOW_SAVE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function deployHostedComposition(
  session: CliAuthSession,
  payload: HostedCompositionDeployPayload,
): Promise<HostedCompositionDeployResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.post<HostedCompositionDeployResponse>(
      DEFAULT_COMPOSITION_DEPLOY_PATH,
      payload,
      { ignoreNotFound: true },
    );
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function archiveHostedWorkflow(
  session: CliAuthSession,
  payload: HostedWorkflowLifecyclePayload,
): Promise<HostedWorkflowLifecycleResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.post<HostedWorkflowLifecycleResponse>(DEFAULT_WORKFLOW_ARCHIVE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function deleteHostedWorkflow(
  session: CliAuthSession,
  payload: HostedWorkflowLifecyclePayload,
): Promise<HostedWorkflowLifecycleResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.post<HostedWorkflowLifecycleResponse>(DEFAULT_WORKFLOW_DELETE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function fetchHostedCredits(
  session: CliAuthSession,
): Promise<HostedCreditsResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<HostedCreditsResponse>(DEFAULT_CREDITS_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
