import { type AuthBaseUrlMode, type DeploymentExposure, type DeploymentMode, type SecretProvider, type StorageProvider } from "@paperclipai/shared";
type DatabaseMode = "embedded-postgres" | "postgres";
export interface Config {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    host: string;
    port: number;
    allowedHostnames: string[];
    authBaseUrlMode: AuthBaseUrlMode;
    authPublicBaseUrl: string | undefined;
    authDisableSignUp: boolean;
    databaseMode: DatabaseMode;
    databaseUrl: string | undefined;
    embeddedPostgresDataDir: string;
    embeddedPostgresPort: number;
    databaseBackupEnabled: boolean;
    databaseBackupIntervalMinutes: number;
    databaseBackupRetentionDays: number;
    databaseBackupDir: string;
    serveUi: boolean;
    uiDevMiddleware: boolean;
    secretsProvider: SecretProvider;
    secretsStrictMode: boolean;
    secretsMasterKeyFilePath: string;
    storageProvider: StorageProvider;
    storageLocalDiskBaseDir: string;
    storageS3Bucket: string;
    storageS3Region: string;
    storageS3Endpoint: string | undefined;
    storageS3Prefix: string;
    storageS3ForcePathStyle: boolean;
    heartbeatSchedulerEnabled: boolean;
    heartbeatSchedulerIntervalMs: number;
    companyDeletionEnabled: boolean;
}
export declare function loadConfig(): Config;
export {};
//# sourceMappingURL=config.d.ts.map