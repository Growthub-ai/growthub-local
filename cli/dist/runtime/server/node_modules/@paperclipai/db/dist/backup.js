import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDatabaseBackupResult, runDatabaseBackup } from "./backup-lib.js";
function expandHomePrefix(value) {
    if (value === "~")
        return os.homedir();
    if (value.startsWith("~/"))
        return path.resolve(os.homedir(), value.slice(2));
    return value;
}
function resolvePaperclipHomeDir() {
    const envHome = process.env.PAPERCLIP_HOME?.trim();
    if (envHome)
        return path.resolve(expandHomePrefix(envHome));
    return path.resolve(os.homedir(), ".paperclip");
}
function resolvePaperclipInstanceId() {
    const raw = process.env.PAPERCLIP_INSTANCE_ID?.trim() || "default";
    if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
        throw new Error(`Invalid PAPERCLIP_INSTANCE_ID '${raw}'.`);
    }
    return raw;
}
function resolveDefaultConfigPath() {
    return path.resolve(resolvePaperclipHomeDir(), "instances", resolvePaperclipInstanceId(), "config.json");
}
function readConfig(configPath) {
    if (!existsSync(configPath))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8"));
        return typeof parsed === "object" && parsed ? parsed : null;
    }
    catch {
        return null;
    }
}
function asPositiveInt(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    const rounded = Math.trunc(value);
    return rounded > 0 ? rounded : null;
}
function resolveEmbeddedPort(config) {
    return asPositiveInt(config?.database?.embeddedPostgresPort) ?? 54329;
}
function resolveConnectionString(config) {
    const envUrl = process.env.DATABASE_URL?.trim();
    if (envUrl)
        return envUrl;
    if (config?.database?.mode === "postgres" && typeof config.database.connectionString === "string") {
        const trimmed = config.database.connectionString.trim();
        if (trimmed)
            return trimmed;
    }
    const port = resolveEmbeddedPort(config);
    return `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
}
function resolveDefaultBackupDir() {
    return path.resolve(resolvePaperclipHomeDir(), "instances", resolvePaperclipInstanceId(), "data", "backups");
}
function resolveBackupDir(config) {
    const raw = config?.database?.backup?.dir;
    if (typeof raw === "string" && raw.trim().length > 0) {
        return path.resolve(expandHomePrefix(raw.trim()));
    }
    return resolveDefaultBackupDir();
}
function resolveRetentionDays(config) {
    return asPositiveInt(config?.database?.backup?.retentionDays) ?? 30;
}
async function main() {
    const configPath = resolveDefaultConfigPath();
    const config = readConfig(configPath);
    const connectionString = resolveConnectionString(config);
    const backupDir = resolveBackupDir(config);
    const retentionDays = resolveRetentionDays(config);
    console.log(`Config path: ${configPath}`);
    console.log(`Backing up database to: ${backupDir}`);
    console.log(`Retention window: ${retentionDays} day(s)`);
    try {
        const result = await runDatabaseBackup({
            connectionString,
            backupDir,
            retentionDays,
            filenamePrefix: "paperclip",
        });
        console.log(`Backup saved: ${formatDatabaseBackupResult(result)}`);
    }
    catch (err) {
        console.error("Backup failed.");
        if (err instanceof Error) {
            console.error(err.message);
        }
        else {
            console.error(String(err));
        }
        process.exit(1);
    }
}
await main();
//# sourceMappingURL=backup.js.map