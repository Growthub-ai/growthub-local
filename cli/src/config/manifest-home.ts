import os from "node:os";
import path from "node:path";
import { expandHomePrefix } from "./home.js";

/**
 * Manifest Home Resolver
 *
 * Machine-scoped cache for capability manifest envelopes. Mirrors the
 * layout convention used by `kit-forks-home.ts` so the CLI home is a
 * single, predictable tree the operator and agents can reason over.
 *
 * Layout:
 *   GROWTHUB_MANIFEST_HOME/
 *     index.json                              # known hosts + last fetch
 *     hosts/<host-slug>/envelope.json         # latest CapabilityManifestEnvelope
 *     hosts/<host-slug>/envelope.prev.json    # previous envelope (for drift)
 *
 * Default when the env var is unset: `~/.growthub/manifests`.
 */
export function resolveManifestHomeDir(): string {
  const envHome = process.env.GROWTHUB_MANIFEST_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".growthub", "manifests");
}

export function resolveManifestIndexPath(): string {
  return path.resolve(resolveManifestHomeDir(), "index.json");
}

export function resolveHostsDir(): string {
  return path.resolve(resolveManifestHomeDir(), "hosts");
}

const HOST_SLUG_FALLBACK = "unknown-host";

/** Stable, filesystem-safe slug for a hosted base URL or logical host id. */
export function hostSlug(host: string): string {
  const trimmed = (host ?? "").trim();
  if (!trimmed) return HOST_SLUG_FALLBACK;
  const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
  const slug = withoutScheme
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || HOST_SLUG_FALLBACK;
}

export function resolveHostDir(host: string): string {
  return path.resolve(resolveHostsDir(), hostSlug(host));
}

export function resolveEnvelopePath(host: string): string {
  return path.resolve(resolveHostDir(host), "envelope.json");
}

export function resolvePrevEnvelopePath(host: string): string {
  return path.resolve(resolveHostDir(host), "envelope.prev.json");
}
