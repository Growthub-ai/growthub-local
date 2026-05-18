/**
 * Growthub Local Profile — canonical Growthub-native profile primitive.
 *
 * This file gives the rest of the CLI (and downstream agents) a clean,
 * customer-facing entry point for the user's free Growthub profile:
 *
 *   import {
 *     type GrowthubLocalProfile,
 *     type GrowthubMachineProfile,
 *     computeGrowthubMachineProfile,
 *     isGrowthubLocalAuthenticated,
 *   } from "../auth/growthub-local-profile.js";
 *
 * Everything is a thin alias over the existing primitives in
 * `./effective-profile.ts`, `./session-store.ts`, and
 * `../config/schema.ts`. There is no new schema, no new on-disk file, and
 * no behavior change vs. the Paperclip-named imports. The point is to give
 * Memory & Knowledge and the discovery hub a single import surface that
 * matches the AWaC product framing:
 *
 *   - The on-disk `config.json` is the **Growthub Local profile envelope**.
 *   - The merged identity (local + hosted overlay + session) is the
 *     **Growthub machine profile**.
 *   - The hosted Growthub account is the **identity backing** for the
 *     same profile when the user opts into PLG.
 *
 * Migration intent: incrementally swap `PaperclipConfig` /
 * `computeEffectiveProfile` imports for these aliases. Each call-site swap
 * is a separate small PR — this file lands first and unblocks them all.
 */

import type { PaperclipConfig } from "../config/schema.js";
import {
  computeEffectiveProfile,
  type EffectiveProfile,
  type ComputeEffectiveProfileOptions,
  type LocalWorkspaceView,
  type HostedOverlayView,
  type SessionView,
} from "./effective-profile.js";
import { isSessionExpired, readSession, type CliAuthSession } from "./session-store.js";

// ---------------------------------------------------------------------------
// Canonical Growthub-native types
// ---------------------------------------------------------------------------

/**
 * Growthub Local profile envelope — the on-disk config that describes a
 * single Growthub CLI install on this machine.
 *
 * Currently aliased to `PaperclipConfig` (the Zod-validated envelope) so we
 * preserve the existing schema, file layout, and validation behavior. The
 * type alias is the seam where future Growthub-specific schema can land
 * without breaking call sites.
 */
export type GrowthubLocalProfile = PaperclipConfig;

/**
 * Growthub machine profile — the merged view of local profile + hosted
 * Growthub overlay + active session. Same shape as `EffectiveProfile`.
 */
export type GrowthubMachineProfile = EffectiveProfile;

/** Per-layer projections — re-exported for consumers that need them. */
export type GrowthubLocalProfileView = LocalWorkspaceView;
export type GrowthubHostedProfileView = HostedOverlayView;
export type GrowthubSessionView = SessionView;
export type GrowthubMachineProfileOptions = ComputeEffectiveProfileOptions;

// ---------------------------------------------------------------------------
// Canonical compute / status helpers
// ---------------------------------------------------------------------------

/**
 * Compute the merged Growthub machine profile.
 *
 * Identical behavior to `computeEffectiveProfile`. The wrapper exists so
 * agent code, Memory & Knowledge, and the discovery hub can depend on a
 * Growthub-named function — no Paperclip identifiers in the import lines.
 */
export function computeGrowthubMachineProfile(
  opts: GrowthubMachineProfileOptions = {},
): GrowthubMachineProfile {
  return computeEffectiveProfile(opts);
}

/**
 * Is this CLI install currently signed in to a hosted Growthub account?
 *
 * Wraps `readSession()` + `isSessionExpired()` so a single check answers
 * "can we sync Memory & Knowledge?" / "can we hit hosted endpoints?".
 */
export function isGrowthubLocalAuthenticated(): boolean {
  const session = readSession();
  if (!session) return false;
  return !isSessionExpired(session);
}

/**
 * Return the hosted Growthub identity attached to this profile, if any.
 *
 * Useful for memory project namespacing (e.g. tagging observations with the
 * hosted userId so the same project synced from multiple machines collapses
 * cleanly on the hosted side).
 */
export function readGrowthubHostedIdentity(): {
  authenticated: boolean;
  userId?: string;
  email?: string;
  hostedBaseUrl?: string;
} {
  const session = readSession();
  if (!session) return { authenticated: false };
  if (isSessionExpired(session)) return { authenticated: false };
  return {
    authenticated: true,
    userId: session.userId,
    email: session.email,
    hostedBaseUrl: session.hostedBaseUrl,
  };
}

/**
 * Re-export the raw session type for callers that need to act on the
 * access token directly. Memory & Knowledge sync routes through
 * `cli/src/runtime/memory/profile-binding.ts`, which uses the live hosted
 * knowledge surfaces behind the Growthub Local tool contract:
 *
 *   - POST /api/knowledge/upload
 *   - GET  /api/knowledge-base/list
 *
 * The legacy `/api/cli/profile?action=sync-memory` path is not the
 * persistence API. See `cli/src/runtime/memory/sync.ts` for context.
 */
export type { CliAuthSession };
