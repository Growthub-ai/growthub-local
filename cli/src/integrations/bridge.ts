/**
 * Growthub Integrations Bridge
 *
 * Self-contained adapter that layers on top of the existing CLI ↔ gh-app HTTP
 * transport (`cli/src/auth/hosted-client.ts`). No new transport, no new auth
 * primitive: any user already authenticated to Growthub through the
 * production-stabilised hosted bridge is automatically eligible to render
 * their first-party integrations through this adapter.
 *
 * Consumers:
 *   - `cli/src/integrations/github-resolver.ts` — fork-sync remote push
 *   - `cli/src/commands/integrations.ts`        — CLI surface
 *   - `cli/src/commands/github.ts`              — whoami / status composition
 *
 * Design constraints (surgical):
 *   - No persistence of bridge-minted credentials on disk — ever. In-memory
 *     cache only, TTL clamped to the credential's own expiry.
 *   - Falls through to null on any failure (never blocks direct CLI auth).
 *   - Re-uses CliAuthSession + PaperclipApiClient — zero duplicate wiring.
 */

import { readSession, isSessionExpired, type CliAuthSession } from "../auth/session-store.js";
import {
  fetchHostedIntegrations,
  fetchHostedIntegrationCredential,
} from "../auth/hosted-integrations.js";
import { HostedEndpointUnavailableError } from "../auth/hosted-client.js";
import type {
  IntegrationBridgeStatus,
  IntegrationIdentity,
  ResolvedIntegrationCredential,
} from "./types.js";

// ---------------------------------------------------------------------------
// In-memory credential cache (never persisted)
// ---------------------------------------------------------------------------

interface CacheEntry {
  credential: ResolvedIntegrationCredential;
  expiresAtMs: number;
}

const credentialCache = new Map<string, CacheEntry>();
/** Safety clamp: even if the hosted app returns no expiry, drop the token after this window. */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheTtlFromExpiresAt(expiresAt?: string): number {
  if (!expiresAt) return Date.now() + DEFAULT_CACHE_TTL_MS;
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return Date.now() + DEFAULT_CACHE_TTL_MS;
  return Math.min(ms, Date.now() + DEFAULT_CACHE_TTL_MS);
}

/** Invalidate the in-memory cache (called on logout / logout-all). */
export function clearIntegrationBridgeCache(): void {
  credentialCache.clear();
}

// ---------------------------------------------------------------------------
// Session gating
// ---------------------------------------------------------------------------

function readActiveGrowthubSession(): CliAuthSession | null {
  const session = readSession();
  if (!session) return null;
  if (isSessionExpired(session)) return null;
  return session;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Describe the current bridge state for whoami / status commands.
 * Always succeeds; never throws.
 */
export async function describeIntegrationBridge(): Promise<IntegrationBridgeStatus> {
  const session = readActiveGrowthubSession();
  if (!session) {
    return {
      growthubConnected: false,
      bridgeAvailable: false,
      integrations: [],
      notice: "Not logged into Growthub — run `growthub login` to enable the bridge.",
    };
  }

  try {
    const res = await fetchHostedIntegrations(session);
    const integrations: IntegrationIdentity[] = (res?.integrations ?? []).map((r) => ({
      provider: r.provider,
      handle: r.handle,
      connectedAt: r.connectedAt,
      scopes: r.scopes,
      ready: r.ready ?? true,
    }));
    return {
      growthubConnected: true,
      growthubLogin: session.email,
      bridgeAvailable: true,
      integrations,
    };
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      return {
        growthubConnected: true,
        growthubLogin: session.email,
        bridgeAvailable: false,
        integrations: [],
        notice: "Hosted integrations endpoint not available in this Growthub deployment yet.",
      };
    }
    return {
      growthubConnected: true,
      growthubLogin: session.email,
      bridgeAvailable: false,
      integrations: [],
      notice: `Bridge probe failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * List all integrations the user has connected inside their Growthub account.
 * Returns [] when the bridge is unavailable; never throws.
 */
export async function listConnectedIntegrations(): Promise<IntegrationIdentity[]> {
  const status = await describeIntegrationBridge();
  return status.integrations;
}

/**
 * Resolve a short-lived credential for a specific integration provider via
 * the hosted bridge. Returns null when the bridge is unavailable, the user
 * isn't logged into Growthub, or the provider is not connected.
 *
 * Minted credentials are cached in-memory only (never written to disk) and
 * honoured until their declared expiry, clamped to DEFAULT_CACHE_TTL_MS.
 */
export async function resolveIntegrationCredential(
  providerId: string,
): Promise<ResolvedIntegrationCredential | null> {
  const cached = credentialCache.get(providerId);
  if (cached && cached.expiresAtMs > Date.now()) return cached.credential;
  credentialCache.delete(providerId);

  const session = readActiveGrowthubSession();
  if (!session) return null;

  try {
    const res = await fetchHostedIntegrationCredential(session, providerId);
    if (!res?.accessToken) return null;
    const credential: ResolvedIntegrationCredential = {
      provider: res.provider ?? providerId,
      accessToken: res.accessToken,
      expiresAt: res.expiresAt,
      scopes: res.scopes,
      handle: res.handle,
      source: "growthub-bridge",
    };
    credentialCache.set(providerId, {
      credential,
      expiresAtMs: cacheTtlFromExpiresAt(res.expiresAt),
    });
    return credential;
  } catch {
    return null;
  }
}
