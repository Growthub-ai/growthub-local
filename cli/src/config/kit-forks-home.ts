import os from "node:os";
import path from "node:path";
import { expandHomePrefix } from "./home.js";

/**
 * Kit Forks Home Resolver
 *
 * The fork-sync subsystem is intentionally decoupled from any harness home
 * directory — it is a kernel-packet-style worker-kit concern.
 *
 * Layout:
 *   GROWTHUB_KIT_FORKS_HOME/
 *     index.json                 # discovery index of registered forks
 *     jobs/<job-id>.json         # background sync job state
 *     orphan-jobs/<job-id>.json  # job state for unresolved / deregistered forks
 *
 *   <forkPath>/.growthub-fork/
 *     fork.json                  # canonical self-describing registration
 *
 * Default when the env var is unset: `~/.growthub/kit-forks`.
 */
export function resolveKitForksHomeDir(): string {
  const envHome = process.env.GROWTHUB_KIT_FORKS_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".growthub", "kit-forks");
}

export function resolveKitForksIndexPath(): string {
  return path.resolve(resolveKitForksHomeDir(), "index.json");
}

export function resolveKitForksJobsDir(): string {
  return path.resolve(resolveKitForksHomeDir(), "jobs");
}

export function resolveKitForksOrphanJobsDir(): string {
  return path.resolve(resolveKitForksHomeDir(), "orphan-jobs");
}

/** Directory name embedded inside every registered fork. */
export const IN_FORK_STATE_DIRNAME = ".growthub-fork";

export function resolveInForkStateDir(forkPath: string): string {
  return path.resolve(forkPath, IN_FORK_STATE_DIRNAME);
}

export function resolveInForkRegistrationPath(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "fork.json");
}

/**
 * In-fork capability manifest snapshot.
 *
 * Co-located with fork.json / policy.json / trace.jsonl / authority.json so
 * the fork artifact carries a frozen CapabilityManifestEnvelope alongside
 * its identity, policy, history, and attestation state.
 */
export function resolveInForkManifestPath(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "manifest.json");
}

/**
 * In-fork saved bindings directory.
 *
 *   <forkPath>/.growthub-fork/bindings/<slug>/<name>.json
 *
 * Saved bindings ride the same additive, drift-aware, trace-backed fork
 * substrate as the manifest snapshot. Cross-machine propagation is handled
 * by the existing fork-sync agent — not a second transport.
 */
export function resolveInForkBindingsDir(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "bindings");
}
