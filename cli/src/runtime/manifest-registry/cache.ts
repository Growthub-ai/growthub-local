/**
 * Manifest Registry Cache
 *
 * Machine-scoped cache for `CapabilityManifestEnvelope` payloads. Reuses the
 * CLI-wide `~/.growthub/...` home convention (see `config/manifest-home.ts`).
 *
 * Writes are atomic (temp → rename) and preserve the prior envelope as
 * `envelope.prev.json` so drift comparisons never rely on a round-trip.
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveEnvelopePath,
  resolveHostDir,
  resolveManifestIndexPath,
  resolvePrevEnvelopePath,
  hostSlug,
} from "../../config/manifest-home.js";
import type { CapabilityManifestEnvelope } from "@growthub/api-contract";
import { compareEnvelopes } from "./drift.js";
import type { CacheWriteResult } from "./types.js";

interface ManifestIndexEntry {
  host: string;
  hostSlug: string;
  fetchedAt: string;
  capabilityCount: number;
}

interface ManifestIndex {
  version: 1;
  entries: ManifestIndexEntry[];
}

function readIndex(): ManifestIndex {
  const p = resolveManifestIndexPath();
  if (!fs.existsSync(p)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as ManifestIndex;
    if (!parsed || !Array.isArray(parsed.entries)) return { version: 1, entries: [] };
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeIndex(index: ManifestIndex): void {
  const p = resolveManifestIndexPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2) + "\n", "utf8");
}

function upsertIndex(entry: ManifestIndexEntry): void {
  const index = readIndex();
  const idx = index.entries.findIndex((e) => e.hostSlug === entry.hostSlug);
  if (idx >= 0) index.entries[idx] = entry;
  else index.entries.push(entry);
  writeIndex(index);
}

function atomicWrite(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

function readEnvelopeFile(filePath: string): CapabilityManifestEnvelope | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as CapabilityManifestEnvelope;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.capabilities)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Load the latest cached envelope for a host, or null if missing. */
export function loadCachedEnvelope(host: string): CapabilityManifestEnvelope | null {
  return readEnvelopeFile(resolveEnvelopePath(host));
}

/** Load the previous envelope for a host (for drift), or null if missing. */
export function loadPrevEnvelope(host: string): CapabilityManifestEnvelope | null {
  return readEnvelopeFile(resolvePrevEnvelopePath(host));
}

/**
 * Persist an envelope to the cache.
 *
 *   1. Rotate the current envelope.json to envelope.prev.json (if present).
 *   2. Atomically write the fresh envelope.
 *   3. Stamp the new envelope's `drift` relative to the prior one.
 *   4. Refresh the machine index.
 */
export function writeEnvelope(envelope: CapabilityManifestEnvelope): CacheWriteResult {
  const host = envelope.host;
  const envelopePath = resolveEnvelopePath(host);
  const prevEnvelopePath = resolvePrevEnvelopePath(host);

  fs.mkdirSync(resolveHostDir(host), { recursive: true });

  const existing = readEnvelopeFile(envelopePath);
  if (existing) {
    try {
      fs.copyFileSync(envelopePath, prevEnvelopePath);
    } catch {
      // best effort — drift is always additive and tolerant of missing prev
    }
  }

  const drift = compareEnvelopes(existing, envelope);
  const stamped: CapabilityManifestEnvelope = {
    ...envelope,
    drift: drift.markers.length > 0 ? drift : envelope.drift,
  };

  atomicWrite(envelopePath, JSON.stringify(stamped, null, 2) + "\n");

  upsertIndex({
    host,
    hostSlug: hostSlug(host),
    fetchedAt: stamped.fetchedAt,
    capabilityCount: stamped.capabilities.length,
  });

  return { envelopePath, prevEnvelopePath, drift };
}

/** Enumerate cached hosts from the machine index. */
export function listCachedHosts(): ManifestIndexEntry[] {
  return readIndex().entries;
}
