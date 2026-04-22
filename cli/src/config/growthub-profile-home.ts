import os from "node:os";
import path from "node:path";
import { expandHomePrefix } from "./home.js";

/**
 * Growthub Profile Home Resolver
 *
 * Higher-level root for operator-wide Growthub state that is not tied to
 * a single paperclip instance. The CMS capability manifest cache,
 * cross-fork identity, and any future profile-scoped state lives here.
 *
 * Layout:
 *   GROWTHUB_PROFILE_HOME/
 *     manifests/<host>.capabilities.json   # CMS capability registry cache
 *     sessions/<id>.jsonl                  # fallback session transcripts
 *
 * Default when the env var is unset: `~/.growthub/profile`.
 */
export function resolveGrowthubProfileHomeDir(): string {
  const env = process.env.GROWTHUB_PROFILE_HOME?.trim();
  if (env) return path.resolve(expandHomePrefix(env));
  return path.resolve(os.homedir(), ".growthub", "profile");
}

export function resolveGrowthubProfileManifestsDir(): string {
  return path.resolve(resolveGrowthubProfileHomeDir(), "manifests");
}

export function resolveGrowthubProfileSessionsDir(): string {
  return path.resolve(resolveGrowthubProfileHomeDir(), "sessions");
}
