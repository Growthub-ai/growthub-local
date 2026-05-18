/**
 * Growthub Local Profile — home directory + instance id primitives.
 *
 * This file is the canonical Growthub-named API for resolving the per-user
 * CLI install root. It is a thin, additive wrapper over the legacy Paperclip
 * primitives in `./home.ts` — both name families resolve to the same on-disk
 * paths so existing installs keep working unchanged.
 *
 * Resolution order for the home directory:
 *   1. GROWTHUB_LOCAL_HOME             (new canonical override)
 *   2. PAPERCLIP_HOME                  (legacy interop)
 *   3. ~/.paperclip                    (legacy default — unchanged on disk)
 *
 * Resolution order for the instance id:
 *   1. GROWTHUB_LOCAL_INSTANCE_ID      (new canonical override)
 *   2. PAPERCLIP_INSTANCE_ID           (legacy interop)
 *   3. "default"
 *
 * Why both: AWaC's product framing now centers on the **Growthub Local
 * profile** as the free, machine-bound PLG identity that ties together the
 * CLI install, Memory & Knowledge, and the optional hosted Growthub account.
 * Renaming the on-disk layout would force a migration and break Phase-A
 * invariants; aliasing the *names* keeps every existing path stable while
 * giving new code a clean, customer-facing primitive to import.
 *
 * Layout (unchanged):
 *   ~/.paperclip/
 *     instances/<id>/config.json       — GrowthubLocalProfile envelope
 *     instances/<id>/db/               — embedded postgres data dir
 *     instances/<id>/logs/             — instance logs
 *     instances/<id>/secrets/master.key — local-encrypted secrets keyfile
 *     instances/<id>/data/storage/     — local-disk artifact storage
 *     instances/<id>/data/backups/     — db backups
 *     memory/projects/<slug>.json      — Memory & Knowledge per-project store
 *     memory/provider-config.json      — memory provider/api-key config
 *     memory/sync-state.json           — per-project last-synced cursor (NEW)
 */

import os from "node:os";
import path from "node:path";
import {
  resolvePaperclipHomeDir,
  resolvePaperclipInstanceId,
  resolvePaperclipInstanceRoot,
  resolveMemoryDir,
  resolveMemoryProjectsDir,
} from "./home.js";

const DEFAULT_INSTANCE_ID = "default";

/**
 * Resolve the Growthub Local home directory.
 *
 * Delegates to the underlying `resolvePaperclipHomeDir` primitive, which
 * already honors GROWTHUB_LOCAL_HOME → PAPERCLIP_HOME → ~/.paperclip in
 * that order. Aliased here as the canonical Growthub-named import for
 * new code; both names resolve to the exact same path.
 */
export function resolveGrowthubLocalHomeDir(): string {
  return resolvePaperclipHomeDir();
}

/**
 * Resolve the Growthub Local instance id.
 *
 * Delegates to `resolvePaperclipInstanceId`, which honors
 * GROWTHUB_LOCAL_INSTANCE_ID → PAPERCLIP_INSTANCE_ID → "default" plus an
 * explicit override argument. Same validation contract (letters, digits,
 * '_', '-').
 */
export function resolveGrowthubLocalInstanceId(override?: string): string {
  return resolvePaperclipInstanceId(override);
}

/**
 * Resolve the on-disk root for a specific Growthub Local instance.
 *
 * Same layout as the Paperclip primitives — kept aliased so callers can
 * import the Growthub-named API without churning the filesystem.
 */
export function resolveGrowthubLocalInstanceRoot(instanceId?: string): string {
  return resolvePaperclipInstanceRoot(resolveGrowthubLocalInstanceId(instanceId));
}

/**
 * Memory & Knowledge directories, namespaced under the Growthub Local home.
 *
 * Memory data is shared across instances under the same home dir — it is
 * tied to the user's free Growthub profile, not to a specific Paperclip
 * server instance.
 */
export function resolveGrowthubProfileMemoryDir(): string {
  return resolveMemoryDir();
}

export function resolveGrowthubProfileMemoryProjectsDir(): string {
  return resolveMemoryProjectsDir();
}

/**
 * Resolve the per-project sync-state file used by the Memory & Profile
 * binding primitive. Tracks the last-synced observation id and timestamp
 * per project so subsequent syncs only push deltas.
 */
export function resolveGrowthubProfileSyncStatePath(): string {
  return path.resolve(resolveGrowthubProfileMemoryDir(), "sync-state.json");
}

/**
 * Describe every path the Growthub Local profile owns. Useful for `growthub
 * profile` JSON output, agent inspection, and verification scripts.
 */
export function describeGrowthubLocalProfilePaths(instanceId?: string) {
  const resolvedInstanceId = resolveGrowthubLocalInstanceId(instanceId);
  const homeDir = resolveGrowthubLocalHomeDir();
  const instanceRoot = resolveGrowthubLocalInstanceRoot(resolvedInstanceId);
  return {
    homeDir,
    instanceId: resolvedInstanceId,
    instanceRoot,
    configPath: path.resolve(instanceRoot, "config.json"),
    embeddedPostgresDataDir: path.resolve(instanceRoot, "db"),
    backupDir: path.resolve(instanceRoot, "data", "backups"),
    logDir: path.resolve(instanceRoot, "logs"),
    secretsKeyFilePath: path.resolve(instanceRoot, "secrets", "master.key"),
    storageDir: path.resolve(instanceRoot, "data", "storage"),
    memoryDir: resolveGrowthubProfileMemoryDir(),
    memoryProjectsDir: resolveGrowthubProfileMemoryProjectsDir(),
    syncStatePath: resolveGrowthubProfileSyncStatePath(),
    osHomedir: os.homedir(),
    defaultInstanceId: DEFAULT_INSTANCE_ID,
  };
}
