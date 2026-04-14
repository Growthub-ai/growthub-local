/**
 * Hosted Execution Client
 *
 * Wraps the hosted app's canonical execution surfaces so the CLI / local
 * runtime can call them safely with the authenticated bridge session.
 *
 * This module reuses:
 *   - auth/session-store (CliAuthSession) for the bearer token
 *   - client/http (PaperclipApiClient) for typed HTTP transport
 *   - auth/hosted-client patterns for error handling (404/501 fallback)
 *
 * Hosted targets (grounded by what already exists):
 *   GET  /api/cli/session          — session validation
 *   GET  /api/cli/profile          — hosted profile + capabilities
 *   POST /api/sandbox/execute      — workflow execution
 *   POST /api/sandbox/provider-report — provider assembly
 */

import { PaperclipApiClient, ApiRequestError } from "../../client/http.js";
import { readSession, isSessionExpired, type CliAuthSession } from "../../auth/session-store.js";
import { readHostedOverlay } from "../../auth/overlay-store.js";
import type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedProviderAssemblyInput,
  HostedProviderAssemblyResult,
  HostedProfile,
  HostedCapabilityRecord,
} from "./types.js";

export type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedProviderAssemblyInput,
  HostedProviderAssemblyResult,
  HostedProfile,
  HostedCapabilityRecord,
  HostedExecuteNodePayload,
  HostedNodeResult,
  HostedExecutionArtifactRef,
  HostedProviderRecord,
} from "./types.js";

// ---------------------------------------------------------------------------
// Hosted endpoint paths
// ---------------------------------------------------------------------------

const EXECUTE_PATH = "/api/sandbox/execute";
const PROVIDER_REPORT_PATH = "/api/sandbox/provider-report";
const PROFILE_PATH = "/api/cli/profile";
const CAPABILITIES_PATH = "/api/cli/capabilities";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HostedExecutionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NoActiveSessionError extends Error {
  constructor() {
    super(
      "No active hosted session. Run `growthub auth login` to authenticate.",
    );
  }
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

function requireSession(): CliAuthSession {
  const session = readSession();
  if (!session) throw new NoActiveSessionError();
  if (isSessionExpired(session)) {
    throw new HostedExecutionError(
      401,
      "Hosted session expired. Run `growthub auth login` to re-authenticate.",
    );
  }
  return session;
}

function clientFromSession(session: CliAuthSession): PaperclipApiClient {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken,
  });
}

// ---------------------------------------------------------------------------
// Guard helper — treats 404/501 as "endpoint not deployed yet"
// ---------------------------------------------------------------------------

function isUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.status === 404 || err.status === 501)
  );
}

// ---------------------------------------------------------------------------
// Hosted Execution Client
// ---------------------------------------------------------------------------

export interface HostedExecutionClient {
  executeWorkflow(input: HostedExecuteWorkflowInput): Promise<HostedExecuteWorkflowResult>;
  runProviderAssembly(input: HostedProviderAssemblyInput): Promise<HostedProviderAssemblyResult>;
  getHostedProfile(): Promise<HostedProfile>;
  getHostedCapabilities(): Promise<HostedCapabilityRecord[]>;
}

export function createHostedExecutionClient(): HostedExecutionClient {
  return {
    async executeWorkflow(input) {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.post<HostedExecuteWorkflowResult>(EXECUTE_PATH, input);
        if (!result) {
          throw new HostedExecutionError(502, "Empty response from hosted execution endpoint.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Hosted execution endpoint is not available. Ensure the hosted app supports /api/sandbox/execute.",
          );
        }
        throw err;
      }
    },

    async runProviderAssembly(input) {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.post<HostedProviderAssemblyResult>(PROVIDER_REPORT_PATH, input);
        if (!result) {
          throw new HostedExecutionError(502, "Empty response from provider assembly endpoint.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Provider assembly endpoint is not available. Ensure the hosted app supports /api/sandbox/provider-report.",
          );
        }
        throw err;
      }
    },

    async getHostedProfile() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get<HostedProfile>(PROFILE_PATH);
        if (!result) {
          // Fall back to locally cached overlay
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults,
            };
          }
          throw new HostedExecutionError(502, "No hosted profile available and no local overlay cached.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults,
            };
          }
          throw new HostedExecutionError(
            (err as ApiRequestError).status,
            "Hosted profile endpoint not available and no local overlay cached.",
          );
        }
        throw err;
      }
    },

    async getHostedCapabilities() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get<HostedCapabilityRecord[]>(CAPABILITIES_PATH);
        return result ?? [];
      } catch (err) {
        if (isUnavailable(err)) {
          // Endpoint not deployed — return empty so callers degrade gracefully
          return [];
        }
        throw err;
      }
    },
  };
}
