/**
 * CMS Capability Registry — On-Disk TTL Cache
 *
 * Persists a hosted manifest envelope so that:
 *   - `growthub discover` is instant offline / in CI
 *   - Agents can inspect the last-known-good registry without a hosted round-trip
 *   - Drift detection compares `registryHash` before vs after a refresh
 *
 * Cache lives under the paperclip home dir, keyed per hosted origin so that
 * multi-tenant operators running against several hosted targets never collide.
 *
 * Layout:
 *   ~/.paperclip/manifests/<hostedHost>.capabilities.json
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type { CapabilityManifestEnvelope } from "@growthub/api-contract/manifest";

const DEFAULT_TTL_SECONDS = 5 * 60;

function sanitizeHost(hostedBaseUrl: string): string {
  try {
    const url = new URL(hostedBaseUrl);
    return `${url.hostname}${url.port ? `_${url.port}` : ""}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  } catch {
    return hostedBaseUrl.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }
}

export function resolveManifestCacheDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "manifests");
}

export function resolveManifestCachePath(hostedBaseUrl: string): string {
  return path.resolve(
    resolveManifestCacheDir(),
    `${sanitizeHost(hostedBaseUrl)}.capabilities.json`,
  );
}

export interface CachedEnvelopeRead {
  envelope: CapabilityManifestEnvelope;
  path: string;
  ageSeconds: number;
  isFresh: boolean;
  ttlSeconds: number;
}

export function readCachedManifest(
  hostedBaseUrl: string,
  opts?: { ttlSeconds?: number },
): CachedEnvelopeRead | null {
  const cachePath = resolveManifestCachePath(hostedBaseUrl);
  if (!fs.existsSync(cachePath)) return null;

  let parsed: CapabilityManifestEnvelope;
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    parsed = JSON.parse(raw) as CapabilityManifestEnvelope;
  } catch {
    return null;
  }

  if (parsed.version !== 1 || !parsed.meta || !Array.isArray(parsed.nodes)) {
    return null;
  }

  const fetchedAt = Date.parse(parsed.meta.fetchedAt);
  if (Number.isNaN(fetchedAt)) return null;

  const ttlSeconds = opts?.ttlSeconds ?? parsed.meta.suggestedTtlSeconds ?? DEFAULT_TTL_SECONDS;
  const ageSeconds = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
  return {
    envelope: parsed,
    path: cachePath,
    ageSeconds,
    isFresh: ageSeconds <= ttlSeconds,
    ttlSeconds,
  };
}

export function writeCachedManifest(
  hostedBaseUrl: string,
  envelope: CapabilityManifestEnvelope,
): string {
  const cachePath = resolveManifestCachePath(hostedBaseUrl);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(envelope, null, 2), "utf8");
  return cachePath;
}

export function clearCachedManifest(hostedBaseUrl: string): boolean {
  const cachePath = resolveManifestCachePath(hostedBaseUrl);
  if (!fs.existsSync(cachePath)) return false;
  fs.unlinkSync(cachePath);
  return true;
}

/** Default TTL used when the hosted manifest has no `suggestedTtlSeconds`. */
export const CAPABILITY_CACHE_DEFAULT_TTL_SECONDS = DEFAULT_TTL_SECONDS;
