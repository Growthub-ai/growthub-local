export type ResolvedDatabaseTarget = {
    mode: "postgres";
    connectionString: string;
    source: "DATABASE_URL" | "paperclip-env" | "config.database.connectionString";
    configPath: string;
    envPath: string;
} | {
    mode: "embedded-postgres";
    dataDir: string;
    port: number;
    source: `embedded-postgres@${number}`;
    configPath: string;
    envPath: string;
};
export declare function resolveDatabaseTarget(): ResolvedDatabaseTarget;
//# sourceMappingURL=runtime-config.d.ts.map