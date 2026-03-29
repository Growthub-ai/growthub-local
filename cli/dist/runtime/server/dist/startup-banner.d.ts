import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
type UiMode = "none" | "static" | "vite-dev";
type ExternalPostgresInfo = {
    mode: "external-postgres";
    connectionString: string;
};
type EmbeddedPostgresInfo = {
    mode: "embedded-postgres";
    dataDir: string;
    port: number;
};
type StartupBannerOptions = {
    host: string;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    requestedPort: number;
    listenPort: number;
    uiMode: UiMode;
    db: ExternalPostgresInfo | EmbeddedPostgresInfo;
    migrationSummary: string;
    heartbeatSchedulerEnabled: boolean;
    heartbeatSchedulerIntervalMs: number;
    databaseBackupEnabled: boolean;
    databaseBackupIntervalMinutes: number;
    databaseBackupRetentionDays: number;
    databaseBackupDir: string;
};
export declare function printStartupBanner(opts: StartupBannerOptions): void;
export {};
//# sourceMappingURL=startup-banner.d.ts.map