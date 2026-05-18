import os from "node:os";
import path from "node:path";

const DEFAULT_INSTANCE_ID = "default";
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Resolve the per-user CLI home directory.
 *
 * Honors the env-var families in this priority order so that every existing
 * call site (auth session store, memory store, instance config, secrets
 * keyfile, etc.) routes the same way:
 *
 *   1. GROWTHUB_LOCAL_HOME      — canonical Growthub-native override (new)
 *   2. PAPERCLIP_HOME           — legacy interop, unchanged behavior
 *   3. ~/.paperclip             — unchanged default on-disk root
 *
 * This is the single point where the new GROWTHUB_LOCAL_HOME env var becomes
 * effective for the whole CLI. The on-disk layout under the chosen root is
 * unchanged.
 */
export function resolvePaperclipHomeDir(): string {
  const growthubHome = process.env.GROWTHUB_LOCAL_HOME?.trim();
  if (growthubHome) return path.resolve(expandHomePrefix(growthubHome));
  const envHome = process.env.PAPERCLIP_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".paperclip");
}

/**
 * Resolve the active instance id.
 *
 * Honors GROWTHUB_LOCAL_INSTANCE_ID (new canonical) then PAPERCLIP_INSTANCE_ID
 * (legacy interop), then the explicit override argument, then "default".
 */
export function resolvePaperclipInstanceId(override?: string): string {
  const raw =
    override?.trim()
    || process.env.GROWTHUB_LOCAL_INSTANCE_ID?.trim()
    || process.env.PAPERCLIP_INSTANCE_ID?.trim()
    || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(
      `Invalid instance id '${raw}'. Allowed characters: letters, numbers, '_' and '-'.`,
    );
  }
  return raw;
}

export function resolvePaperclipInstanceRoot(instanceId?: string): string {
  const id = resolvePaperclipInstanceId(instanceId);
  return path.resolve(resolvePaperclipHomeDir(), "instances", id);
}

export function resolveDefaultConfigPath(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "config.json");
}

export function resolveDefaultContextPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "context.json");
}

export function resolveDefaultEmbeddedPostgresDir(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "db");
}

export function resolveDefaultLogsDir(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "logs");
}

export function resolveDefaultSecretsKeyFilePath(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "secrets", "master.key");
}

export function resolveDefaultStorageDir(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "data", "storage");
}

export function resolveDefaultBackupDir(instanceId?: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "data", "backups");
}

export function resolveMemoryDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "memory");
}

export function resolveMemoryProjectsDir(): string {
  return path.resolve(resolveMemoryDir(), "projects");
}

export function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

export function describeLocalInstancePaths(instanceId?: string) {
  const resolvedInstanceId = resolvePaperclipInstanceId(instanceId);
  const instanceRoot = resolvePaperclipInstanceRoot(resolvedInstanceId);
  return {
    homeDir: resolvePaperclipHomeDir(),
    instanceId: resolvedInstanceId,
    instanceRoot,
    configPath: resolveDefaultConfigPath(resolvedInstanceId),
    embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(resolvedInstanceId),
    backupDir: resolveDefaultBackupDir(resolvedInstanceId),
    logDir: resolveDefaultLogsDir(resolvedInstanceId),
    secretsKeyFilePath: resolveDefaultSecretsKeyFilePath(resolvedInstanceId),
    storageDir: resolveDefaultStorageDir(resolvedInstanceId),
  };
}
