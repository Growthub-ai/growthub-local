export type RunDatabaseBackupOptions = {
    connectionString: string;
    backupDir: string;
    retentionDays: number;
    filenamePrefix?: string;
    connectTimeoutSeconds?: number;
    includeMigrationJournal?: boolean;
    excludeTables?: string[];
    nullifyColumns?: Record<string, string[]>;
};
export type RunDatabaseBackupResult = {
    backupFile: string;
    sizeBytes: number;
    prunedCount: number;
};
export type RunDatabaseRestoreOptions = {
    connectionString: string;
    backupFile: string;
    connectTimeoutSeconds?: number;
};
export declare function runDatabaseBackup(opts: RunDatabaseBackupOptions): Promise<RunDatabaseBackupResult>;
export declare function runDatabaseRestore(opts: RunDatabaseRestoreOptions): Promise<void>;
export declare function formatDatabaseBackupResult(result: RunDatabaseBackupResult): string;
//# sourceMappingURL=backup-lib.d.ts.map