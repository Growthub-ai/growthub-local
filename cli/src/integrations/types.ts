/**
 * Canonical types for the Growthub-hosted integrations bridge.
 *
 * The bridge is a thin adapter over the existing CLI ↔ gh-app transport
 * (`cli/src/auth/hosted-client.ts`). Any first-party integration the user has
 * connected inside their Growthub account is surfaced through this adapter
 * under a uniform shape — GitHub is the first consumer, additional providers
 * flow through the same path without changes to the fork-sync engine.
 */

export interface IntegrationIdentity {
  provider: string;
  handle?: string;
  connectedAt?: string;
  scopes?: string[];
  ready: boolean;
}

export interface IntegrationBridgeStatus {
  /** Is the user authenticated to Growthub (prerequisite for the bridge). */
  growthubConnected: boolean;
  /** Growthub email / login surfaced for whoami. */
  growthubLogin?: string;
  /**
   * true = hosted integrations endpoint is reachable; false = either the CLI
   * isn't logged into Growthub, or the hosted deployment hasn't shipped the
   * endpoint yet (404/501 — handled gracefully).
   */
  bridgeAvailable: boolean;
  /** Integrations the user has connected inside their Growthub account. */
  integrations: IntegrationIdentity[];
  /** Informational message suitable for whoami / status output. */
  notice?: string;
}

export interface ResolvedIntegrationCredential {
  provider: string;
  /** Short-lived access token minted on demand by the hosted bridge. */
  accessToken: string;
  /** ISO expiry when known. */
  expiresAt?: string;
  /** Scopes granted on this minted token. */
  scopes?: string[];
  /** Provider handle (e.g. GitHub login). */
  handle?: string;
  /** Source marker for whoami / trace output. */
  source: "growthub-bridge";
}
