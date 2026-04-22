/**
 * Manifest Registry — public entrypoint
 *
 * One discovery spine for every surface: CLI, hosted UI, harnesses, and
 * agent-native sub-branches. Reads and writes `CapabilityManifestEnvelope`
 * (v1 public contract) through the machine-scoped cache; snapshots into
 * a fork's `.growthub-fork/manifest.json` when asked.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftReport,
} from "@growthub/api-contract";
import { resolveInForkManifestPath } from "../../config/kit-forks-home.js";
import { produceEnvelope } from "./envelope-producer.js";
import {
  listCachedHosts,
  loadCachedEnvelope,
  loadPrevEnvelope,
  writeEnvelope,
} from "./cache.js";
import { compareEnvelopes } from "./drift.js";
import type { FetchEnvelopeOptions, LoadCachedEnvelopeOptions } from "./types.js";

export type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftReport,
};
export type { FetchEnvelopeOptions, LoadCachedEnvelopeOptions };
export { listCachedHosts, loadCachedEnvelope, loadPrevEnvelope } from "./cache.js";
export { compareEnvelopes } from "./drift.js";

function atomicWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * Fetch a fresh envelope from live sources and persist it to the cache.
 * Drift is stamped automatically against the prior cached envelope.
 */
export async function pullEnvelope(
  options: FetchEnvelopeOptions = {},
): Promise<{ envelope: CapabilityManifestEnvelope; drift: ManifestDriftReport }> {
  const envelope = await produceEnvelope(options);
  const { drift } = writeEnvelope(envelope);
  const persisted = loadCachedEnvelope(envelope.host) ?? envelope;
  return {
    envelope: persisted,
    drift: drift ?? { comparedAt: new Date().toISOString(), markers: [] },
  };
}

/**
 * Resolve the effective envelope for a caller:
 *   1. cached envelope for the host, if any
 *   2. otherwise a freshly-produced envelope (not persisted)
 *
 * Callers that want persistence should call `pullEnvelope()` explicitly.
 */
export async function resolveEnvelope(
  options: LoadCachedEnvelopeOptions = {},
): Promise<CapabilityManifestEnvelope> {
  const host = options.host;
  if (host) {
    const cached = loadCachedEnvelope(host);
    if (cached) return cached;
  }
  return produceEnvelope({ host });
}

/**
 * Snapshot the currently-cached (or freshly-produced) envelope into a
 * fork's `.growthub-fork/manifest.json`. Co-located with fork.json /
 * policy.json / trace.jsonl / authority.json.
 */
export async function snapshotToFork(
  forkPath: string,
  options: { host?: string } = {},
): Promise<{ manifestPath: string; envelope: CapabilityManifestEnvelope }> {
  const envelope = await resolveEnvelope({ host: options.host });
  const manifestPath = resolveInForkManifestPath(forkPath);
  atomicWriteJson(manifestPath, envelope);
  return { manifestPath, envelope };
}

/** Load a fork's manifest snapshot, or null if none exists. */
export function loadForkEnvelope(forkPath: string): CapabilityManifestEnvelope | null {
  const p = resolveInForkManifestPath(forkPath);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as CapabilityManifestEnvelope;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.capabilities)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Write an arbitrary envelope into a fork (used for import / cross-team share). */
export function writeForkEnvelope(
  forkPath: string,
  envelope: CapabilityManifestEnvelope,
): string {
  const manifestPath = resolveInForkManifestPath(forkPath);
  atomicWriteJson(manifestPath, envelope);
  return manifestPath;
}

/** Look up a single manifest entry by slug against the resolved envelope. */
export async function getCapabilityManifest(
  slug: string,
  options: LoadCachedEnvelopeOptions = {},
): Promise<CapabilityManifest | null> {
  const envelope = await resolveEnvelope(options);
  return envelope.capabilities.find((m) => m.slug === slug) ?? null;
}

/**
 * Export an envelope as a portable JSON file. Any surface that reads
 * `CapabilityManifestEnvelope` can consume the output without CLI internals.
 */
export async function exportEnvelope(
  outPath: string,
  options: LoadCachedEnvelopeOptions = {},
): Promise<string> {
  const envelope = await resolveEnvelope(options);
  atomicWriteJson(outPath, envelope);
  return outPath;
}

/**
 * Import an envelope from a portable JSON file. The imported envelope is
 * stamped with `source = "local-extension"` provenance so downstream
 * surfaces never confuse it with a live hosted pull.
 */
export function importEnvelopeFromFile(filePath: string): CapabilityManifestEnvelope {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as CapabilityManifestEnvelope;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.capabilities)) {
    throw new Error(`Invalid manifest envelope at ${filePath}`);
  }
  const now = new Date().toISOString();
  return {
    ...parsed,
    source: "local-extension",
    fetchedAt: now,
    provenance: {
      originType: "local-extension",
      sourceHost: parsed.host,
      localExtensionPath: filePath,
      recordedAt: now,
    },
  };
}
