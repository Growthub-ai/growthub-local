/**
 * GitHub-specific resolver over the integrations bridge.
 *
 * Preference order when resolving a GitHub access token for fork-sync remote
 * operations:
 *
 *   1. Direct CLI auth — `readGithubToken()` (device-flow or PAT stored under
 *      GROWTHUB_GITHUB_HOME). Users who ran `growthub github login` locally.
 *   2. Growthub-hosted integrations bridge — the user is authenticated into
 *      Growthub AND has connected GitHub as a first-party integration inside
 *      the gh-app.
 *
 * Callers never need to know which source produced the token — they receive
 * the string plus a source marker for logging / whoami.
 *
 * This module does NOT persist bridge-minted tokens. They live only in the
 * in-memory bridge cache.
 */

import { readGithubToken, isGithubTokenExpired } from "../github/token-store.js";
import { resolveIntegrationCredential } from "./bridge.js";

export type GithubTokenSource = "direct" | "growthub-bridge";

export interface ResolvedGithubToken {
  accessToken: string;
  source: GithubTokenSource;
  /** Provider login when known (direct: token.login; bridge: credential.handle). */
  handle?: string;
  /** Scopes when known. */
  scopes?: string[];
  /** ISO expiry when known (bridge tokens only; direct PATs/device-flow may be infinite). */
  expiresAt?: string;
}

export async function resolveGithubAccessToken(): Promise<ResolvedGithubToken | null> {
  const direct = readGithubToken();
  if (direct && !isGithubTokenExpired(direct)) {
    return {
      accessToken: direct.accessToken,
      source: "direct",
      handle: direct.login,
      scopes: direct.scopes,
      expiresAt: direct.expiresAt,
    };
  }

  const bridge = await resolveIntegrationCredential("github");
  if (bridge?.accessToken) {
    return {
      accessToken: bridge.accessToken,
      source: "growthub-bridge",
      handle: bridge.handle,
      scopes: bridge.scopes,
      expiresAt: bridge.expiresAt,
    };
  }

  return null;
}
