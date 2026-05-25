/**
 * OSS-tree declaration bridge for private full-workspace packages.
 *
 * The published CLI bundle is rebuilt from the full workspace, where these
 * modules provide their real declarations. The OSS checkout intentionally does
 * not include those packages, but source type-checking still needs a stable
 * contract for imports that cross that boundary.
 */
declare module "@paperclipai/adapter-utils" {
  export interface CLIAdapterModule {
    type: string;
    label?: string;
    formatStdoutEvent: (line: string, debug: boolean) => void;
    [key: string]: unknown;
  }
}

declare module "@paperclipai/adapter-utils/server-utils" {
  export function removeMaintainerOnlySkillSymlinks(targetDir: string, activeSkillNames: string[]): Promise<string[]>;
  export function resolvePaperclipSkillsDir(...args: unknown[]): Promise<string | null>;
}

declare module "@paperclipai/adapter-claude-local/cli" {
  export function printClaudeStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-codex-local/cli" {
  export function printCodexStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-cursor-local/cli" {
  export function printCursorStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-gemini-local/cli" {
  export function printGeminiStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-opencode-local/cli" {
  export function printOpenCodeStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-pi-local/cli" {
  export function printPiStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/adapter-openclaw-gateway/cli" {
  export function printOpenClawGatewayStreamEvent(line: string, debug?: boolean): void;
}

declare module "@paperclipai/db" {
  export type DatabaseBackupResult = {
    backupFile: string;
    sizeBytes: number;
    prunedCount: number;
    [key: string]: unknown;
  };

  type QueryChain<T = any[]> = Promise<T> & {
    select(fields?: Record<string, unknown>): QueryChain<T>;
    from(table: unknown): QueryChain<T>;
    where(condition: unknown): QueryChain<T>;
    set(values: Record<string, unknown>): QueryChain<T>;
    values(values: Record<string, unknown>): QueryChain<T>;
    returning(): QueryChain<any[]>;
  };

  export function createDb(connectionString: string): {
    execute(sql: string): Promise<unknown>;
    select(fields?: Record<string, unknown>): QueryChain<any[]>;
    update(table: unknown): QueryChain<any[]>;
    insert(table: unknown): QueryChain<any[]>;
    $client?: {
      end?: (options?: { timeout?: number }) => Promise<void>;
    };
  };
  export const instanceUserRoles: Record<string, unknown>;
  export const invites: Record<string, unknown>;
  export const projectWorkspaces: Record<string, unknown>;
  export function applyPendingMigrations(...args: unknown[]): Promise<unknown>;
  export function ensurePostgresDatabase(...args: unknown[]): Promise<unknown>;
  export function formatDatabaseBackupResult(result: DatabaseBackupResult): string;
  export function runDatabaseBackup(options: Record<string, unknown>): Promise<DatabaseBackupResult>;
  export function runDatabaseRestore(options: Record<string, unknown>): Promise<DatabaseBackupResult>;
}

declare module "@paperclipai/server" {
  export function startServer(options?: Record<string, unknown>): Promise<unknown>;
  export default Record<string, unknown>;
}

declare module "@paperclipai/shared" {
  type SchemaLike<T = any> = {
    parse(input: unknown): T;
    safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
  };

  export type ActivityEvent = Record<string, any>;
  export type Agent = Record<string, any>;
  export type Approval = Record<string, any>;
  export type ApprovalComment = Record<string, any>;
  export type Company = Record<string, any>;
  export type CompanyPortabilityExportResult = {
    manifest: CompanyPortabilityManifest;
    files: Record<string, string>;
    warnings: string[];
  };
  export type CompanyPortabilityInclude = Record<string, any>;
  export type CompanyPortabilityImportResult = Record<string, any>;
  export type CompanyPortabilityManifest = Record<string, any>;
  export type CompanyPortabilityPreviewResult = Record<string, any>;
  export type DashboardSummary = Record<string, any>;
  export type DatabaseBackupConfig = Record<string, any>;
  export type DatabaseConfig = Record<string, any>;
  export type HeartbeatRun = Record<string, any>;
  export interface HeartbeatRunEvent {
    payload?: unknown;
    runId?: string;
    eventType?: string;
    message?: string;
    seq?: number;
    [key: string]: unknown;
  }
  export type HeartbeatRunStatus = string;
  export type Issue = Record<string, any>;
  export type IssueComment = Record<string, any>;
  export type LlmConfig = Record<string, any>;
  export type LoggingConfig = Record<string, any>;
  export type PaperclipConfig = {
    database: Record<string, any>;
    logging: Record<string, any>;
    server: Record<string, any>;
    auth: Record<string, any>;
    surface: Record<string, any>;
    storage: Record<string, any>;
    secrets: Record<string, any>;
    [key: string]: any;
  };
  export type SecretProvider = string;
  export type SecretsConfig = Record<string, any>;
  export type SecretsLocalEncryptedConfig = Record<string, any>;
  export type ServerConfig = Record<string, any>;
  export type StorageConfig = Record<string, any>;
  export type StorageLocalDiskConfig = Record<string, any>;
  export type StorageProvider = string;
  export type StorageS3Config = Record<string, any>;
  export type SurfaceConfig = Record<string, any>;
  export type SurfaceProfile = "dx" | "gtm";
  export type SurfaceRuntimeContract = Record<string, any>;
  export type ConfigMeta = Record<string, any>;
  export type AuthConfig = Record<string, any>;
  export type GtmState = Record<string, any>;
  export type AuthBaseUrlMode = string;
  export type DeploymentExposure = string;
  export type DeploymentMode = string;

  export const AUTH_BASE_URL_MODES: readonly AuthBaseUrlMode[];
  export const DEPLOYMENT_EXPOSURES: readonly DeploymentExposure[];
  export const DEPLOYMENT_MODES: readonly DeploymentMode[];
  export const SECRET_PROVIDERS: readonly SecretProvider[];
  export const STORAGE_PROVIDERS: readonly StorageProvider[];
  export const SURFACE_PROFILES: readonly SurfaceProfile[];
  export const addIssueCommentSchema: SchemaLike;
  export const authConfigSchema: SchemaLike<AuthConfig>;
  export const checkoutIssueSchema: SchemaLike;
  export const configMetaSchema: SchemaLike<ConfigMeta>;
  export const createApprovalSchema: SchemaLike;
  export const createIssueSchema: SchemaLike;
  export const databaseBackupConfigSchema: SchemaLike<DatabaseBackupConfig>;
  export const databaseConfigSchema: SchemaLike<DatabaseConfig>;
  export const llmConfigSchema: SchemaLike<LlmConfig>;
  export const loggingConfigSchema: SchemaLike<LoggingConfig>;
  export const paperclipConfigSchema: SchemaLike<PaperclipConfig>;
  export const requestApprovalRevisionSchema: SchemaLike;
  export const resolveApprovalSchema: SchemaLike;
  export const resubmitApprovalSchema: SchemaLike;
  export const secretsConfigSchema: SchemaLike<SecretsConfig>;
  export const secretsLocalEncryptedConfigSchema: SchemaLike<SecretsLocalEncryptedConfig>;
  export const serverConfigSchema: SchemaLike<ServerConfig>;
  export const storageConfigSchema: SchemaLike<StorageConfig>;
  export const storageLocalDiskConfigSchema: SchemaLike<StorageLocalDiskConfig>;
  export const storageS3ConfigSchema: SchemaLike<StorageS3Config>;
  export const surfaceConfigSchema: SchemaLike<SurfaceConfig>;
  export const updateIssueSchema: SchemaLike;
  export function coerceGtmState(input: unknown): GtmState;
  export function createDefaultGtmState(): GtmState;
  export function getSurfaceRuntimeContract(): SurfaceRuntimeContract;
  export function initializeSurfaceRuntimeContract(input?: unknown): SurfaceRuntimeContract;
  export function toGtmViewModel(state: GtmState): Record<string, any>;
}
