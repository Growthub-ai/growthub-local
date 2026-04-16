import { PaperclipApiClient, ApiRequestError } from "../client/http.js";
import type { CliAuthSession } from "./session-store.js";
import { HostedEndpointUnavailableError } from "./hosted-client.js";

/**
 * Hosted integrations extension — thin endpoint additions that re-use the
 * existing CLI ↔ gh-app HTTP transport already established by
 * `hosted-client.ts`. No new transport, no new auth surface. Purely surfaces
 * the integrations that a Growthub-authenticated user has connected inside
 * the hosted app (gh-app) — GitHub is the first consumer, any additional
 * first-party integration will flow through the same adapter.
 *
 * Endpoints (implemented server-side; 404 = not yet deployed in a given
 * hosted environment; the bridge treats absence as "no integrations" and
 * falls through to direct CLI auth.)
 *
 *   GET  /api/cli/profile?view=integrations
 *   GET  /api/cli/profile?view=integration&provider=<id>
 */

const DEFAULT_INTEGRATIONS_PATH = "/api/cli/profile?view=integrations";
const DEFAULT_INTEGRATION_CREDENTIAL_PATH = "/api/cli/profile?view=integration";

export interface HostedIntegrationRecord {
  /** Stable provider id — e.g. "github", "google-drive", "notion". */
  provider: string;
  /** Display label shown in the hosted app. */
  label?: string;
  /** ISO timestamp the user connected this integration. */
  connectedAt?: string;
  /** Scopes / permissions granted, when the provider reports them. */
  scopes?: string[];
  /** Provider-specific handle (e.g. GitHub login). */
  handle?: string;
  /** true = ready to mint credentials; false = expired / reauth needed. */
  ready?: boolean;
}

export interface HostedIntegrationListResponse {
  userId?: string;
  integrations: HostedIntegrationRecord[];
}

export interface HostedIntegrationCredentialResponse {
  provider: string;
  /** Short-lived access token minted by the hosted app on demand. */
  accessToken: string;
  /** ISO expiry — short-lived by design (seconds / minutes). */
  expiresAt?: string;
  /** Scopes effectively granted on this minted token. */
  scopes?: string[];
  /** Handle associated with the token (e.g. GitHub login). */
  handle?: string;
}

function toApiClient(session: CliAuthSession): PaperclipApiClient {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken,
  });
}

export async function fetchHostedIntegrations(
  session: CliAuthSession,
): Promise<HostedIntegrationListResponse | null> {
  const client = toApiClient(session);
  try {
    return await client.get<HostedIntegrationListResponse>(
      DEFAULT_INTEGRATIONS_PATH,
      { ignoreNotFound: true },
    );
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

export async function fetchHostedIntegrationCredential(
  session: CliAuthSession,
  providerId: string,
): Promise<HostedIntegrationCredentialResponse | null> {
  const client = toApiClient(session);
  const path = `${DEFAULT_INTEGRATION_CREDENTIAL_PATH}&provider=${encodeURIComponent(providerId)}`;
  try {
    return await client.get<HostedIntegrationCredentialResponse>(path, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
