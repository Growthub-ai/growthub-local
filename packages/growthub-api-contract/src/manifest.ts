/**
 * Growthub API v1 — Capability Manifest Envelope
 *
 * Envelope the hosted registry endpoint (GET /api/cli/capabilities) and
 * the CLI's on-disk cache both conform to. The envelope carries enough
 * provenance for forks to tell what manifest they are running against,
 * and for agents to detect drift without re-fetching nodes.
 */

import type { CmsCapabilityNode, CapabilityFamily } from "./capabilities.js";

export interface CapabilityManifestMeta {
  /** Hosted base URL this manifest was pulled from. */
  sourceUrl: string;
  /** ISO timestamp of when the manifest was built by the hosted app. */
  publishedAt?: string;
  /** ISO timestamp of when the CLI fetched/read this envelope. */
  fetchedAt: string;
  /** Stable hash over the sorted node list — used for drift detection. */
  registryHash: string;
  /** Count of nodes in the envelope. */
  nodeCount: number;
  /** Count of enabled nodes. */
  enabledCount: number;
  /** Breakdown of node count per family. */
  familyCounts: Partial<Record<CapabilityFamily, number>>;
  /** TTL in seconds suggested by the hosted app; the CLI may use its own. */
  suggestedTtlSeconds?: number;
}

export interface CapabilityManifestEnvelope {
  /** Envelope schema version. */
  version: 1;
  meta: CapabilityManifestMeta;
  nodes: CmsCapabilityNode[];
  /** Optional signature emitted by the hosted app for integrity checks. */
  signature?: {
    algorithm: "ed25519";
    publicKeyId: string;
    signature: string;
  };
}

/**
 * Local-extension declaration. Files placed at
 * `<forkPath>/.growthub-fork/capabilities/*.json` are loaded, validated, and
 * merged into the registry view. Extensions are advisory — the hosted app
 * remains the source of truth.
 */
export interface LocalCapabilityExtension {
  version: 1;
  node: CmsCapabilityNode;
  /** Optional note documenting why this extension exists. */
  note?: string;
  /** Whether this extension is active or intentionally disabled in-place. */
  active: boolean;
}

export type ManifestDriftSeverity = "none" | "node-added" | "node-removed" | "node-mutated" | "hash-mismatch";

export interface ManifestDriftReport {
  severity: ManifestDriftSeverity;
  addedSlugs: string[];
  removedSlugs: string[];
  mutatedSlugs: string[];
  localHash: string;
  remoteHash: string;
  evaluatedAt: string;
}
