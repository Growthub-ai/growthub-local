export type MigrationConnection = {
    connectionString: string;
    source: string;
    stop: () => Promise<void>;
};
export declare function resolveMigrationConnection(): Promise<MigrationConnection>;
//# sourceMappingURL=migration-runtime.d.ts.map