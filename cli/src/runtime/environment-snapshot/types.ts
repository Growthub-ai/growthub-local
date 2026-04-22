/**
 * Environment Snapshot — Type Definitions
 *
 * Aggregated view of the local fork, the hosted account, and the bridge
 * between them. Drives the `🧭 Environment Management` lane in
 * `growthub discover`.
 */

import type { HostedProfile } from "@growthub/api-contract/execute";
import type {
  CapabilityRegistryMeta,
  CapabilityManifestEnvelope,
  ManifestDriftReport,
} from "@growthub/api-contract";

export interface LocalForkSnapshot {
  forkPath: string;
  forkId?: string;
  kitId?: string;
  label?: string;
  policyPresent: boolean;
  authorityPresent: boolean;
  traceEventCount?: number;
  lastTraceAt?: string;
  localExtensionCount: number;
}

export interface LocalSnapshot {
  /** All forks registered to this machine; empty when none. */
  registeredForks: LocalForkSnapshot[];
  /** Active fork context inferred from cwd; null when cwd is not a fork. */
  activeFork: LocalForkSnapshot | null;
  /** Count of local capability extensions across every registered fork. */
  totalLocalExtensions: number;
}

export interface HostedSnapshot {
  connected: boolean;
  baseUrl?: string;
  portalBaseUrl?: string;
  machineLabel?: string;
  workspaceLabel?: string;
  sessionExpired: boolean;
  profile?: HostedProfile;
  registry?: CapabilityRegistryMeta;
  reason?: string;
}

export type BridgeHealthState = "ready" | "needs-auth" | "needs-refresh" | "offline";

export interface BridgeSnapshot {
  state: BridgeHealthState;
  sessionTokenPresent: boolean;
  sessionExpired: boolean;
  cacheFresh: boolean;
  cacheHash?: string;
  remoteHash?: string;
  drift?: ManifestDriftReport;
  manifestCachePath?: string;
  /** Last-known envelope from cache when available. */
  lastEnvelope?: CapabilityManifestEnvelope;
  notes: string[];
}

export interface EnvironmentSnapshot {
  generatedAt: string;
  local: LocalSnapshot;
  hosted: HostedSnapshot;
  bridge: BridgeSnapshot;
}

export interface EnvironmentSnapshotOptions {
  /** Skip the hosted network call (used for fully offline renders). */
  offline?: boolean;
  /** Use the registry cache only; do not force a refresh. */
  cachedOnly?: boolean;
}
