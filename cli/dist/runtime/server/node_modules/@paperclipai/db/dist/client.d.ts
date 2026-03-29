import postgres from "postgres";
import * as schema from "./schema/index.js";
export type MigrationState = {
    status: "upToDate";
    tableCount: number;
    availableMigrations: string[];
    appliedMigrations: string[];
} | {
    status: "needsMigrations";
    tableCount: number;
    availableMigrations: string[];
    appliedMigrations: string[];
    pendingMigrations: string[];
    reason: "no-migration-journal-empty-db" | "no-migration-journal-non-empty-db" | "pending-migrations";
};
export declare function createDb(url: string): import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
export declare function getPostgresDataDirectory(url: string): Promise<string | null>;
export type MigrationHistoryReconcileResult = {
    repairedMigrations: string[];
    remainingMigrations: string[];
};
export declare function reconcilePendingMigrationHistory(url: string): Promise<MigrationHistoryReconcileResult>;
export declare function inspectMigrations(url: string): Promise<MigrationState>;
export declare function applyPendingMigrations(url: string): Promise<void>;
export type MigrationBootstrapResult = {
    migrated: true;
    reason: "migrated-empty-db";
    tableCount: 0;
} | {
    migrated: false;
    reason: "already-migrated";
    tableCount: number;
} | {
    migrated: false;
    reason: "not-empty-no-migration-journal";
    tableCount: number;
};
export declare function migratePostgresIfEmpty(url: string): Promise<MigrationBootstrapResult>;
export declare function ensurePostgresDatabase(url: string, databaseName: string): Promise<"created" | "exists">;
export type Db = ReturnType<typeof createDb>;
//# sourceMappingURL=client.d.ts.map