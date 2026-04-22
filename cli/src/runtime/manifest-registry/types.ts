/**
 * Manifest Registry — internal types
 *
 * The public shape is re-exported from `@growthub/api-contract` (CMS SDK v1).
 * This file only adds registry-internal shapes the CLI needs to operate the
 * cache and producer — no new public contract surface.
 */

import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftMarker,
  ManifestDriftReport,
  ManifestProvenance,
} from "@growthub/api-contract";

export type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftMarker,
  ManifestDriftReport,
  ManifestProvenance,
};

/** Options for producing a fresh envelope from live sources. */
export interface FetchEnvelopeOptions {
  /** Hosted base URL or logical host identifier. Defaults to the active session host. */
  host?: string;
  /** Workspace path to scan for local extension manifests. Defaults to cwd. */
  workspacePath?: string;
  /** If true, skip the hosted fetch (useful in offline / extension-only mode). */
  skipHosted?: boolean;
}

/** Options for reading an envelope from the machine cache. */
export interface LoadCachedEnvelopeOptions {
  host?: string;
}

/** Result of a cache write, with drift against the prior envelope. */
export interface CacheWriteResult {
  envelopePath: string;
  prevEnvelopePath: string;
  drift?: ManifestDriftReport;
}
