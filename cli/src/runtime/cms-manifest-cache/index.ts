/**
 * CMS Manifest Cache
 *
 * Phase B primitive: persists the canonical `CapabilityManifestEnvelope`
 * on disk so the CLI has:
 *   - offline continuity when the hosted manifest endpoint is unreachable
 *   - a deterministic prior snapshot to diff against on refresh
 *   - a stable fallback when contract-version mismatch blocks canonical use
 *
 * Cache path (Phase B locked):
 *   `${resolvePaperclipHomeDir()}/manifests/capabilities.json`
 *
 * The cache envelope is the same `CapabilityManifestEnvelope` shape the
 * hosted endpoint returns. No additional wrapping.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CapabilityManifestEnvelope } from "@growthub/api-contract";
import { resolvePaperclipHomeDir } from "../../config/home.js";

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function resolveManifestCacheDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "manifests");
}

export function resolveManifestCachePath(): string {
  return path.resolve(resolveManifestCacheDir(), "capabilities.json");
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidEnvelopeShape(value: unknown): value is CapabilityManifestEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.host === "string" &&
    typeof record.fetchedAt === "string" &&
    typeof record.source === "string" &&
    Array.isArray(record.capabilities)
  );
}

/**
 * Read the cached manifest envelope, if present and structurally valid.
 * Returns `null` on any malformed or missing cache (callers should treat
 * this as "cold start").
 */
export function readManifestCache(): CapabilityManifestEnvelope | null {
  const filePath = resolveManifestCachePath();
  if (!fs.existsSync(filePath)) return null;

  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const parsed = parseJsonSafe(text);
  if (!isValidEnvelopeShape(parsed)) return null;
  return parsed;
}

/**
 * Atomically write the manifest envelope to disk.
 *
 * Write-to-temp + rename keeps readers from ever observing a partial file.
 */
export function writeManifestCache(envelope: CapabilityManifestEnvelope): string {
  const dir = resolveManifestCacheDir();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = resolveManifestCachePath();
  const tmpPath = path.join(dir, `.capabilities.${process.pid}.${Date.now()}.tmp`);

  const body = `${JSON.stringify(envelope, null, 2)}\n`;
  fs.writeFileSync(tmpPath, body, { mode: 0o644 });

  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // On some filesystems (e.g. cross-device) rename can fail. Fall back
    // to an in-place copy+unlink so the cache still lands atomically
    // from the reader's perspective (the copyFileSync is itself atomic
    // on POSIX for regular files).
    try {
      fs.copyFileSync(tmpPath, filePath);
      fs.unlinkSync(tmpPath);
    } catch {
      throw err;
    }
  }

  return filePath;
}

/**
 * Describe the cache path in a user-friendly form, collapsing the user's
 * home directory to `~` for log output.
 */
export function describeManifestCachePath(): string {
  const filePath = resolveManifestCachePath();
  const home = os.homedir();
  if (filePath.startsWith(`${home}/`)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

/**
 * Delete the cache file, if present. Returns `true` if a file was removed.
 */
export function clearManifestCache(): boolean {
  const filePath = resolveManifestCachePath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}
