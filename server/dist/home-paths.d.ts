export declare function resolvePaperclipHomeDir(): string;
export declare function resolvePaperclipInstanceId(): string;
export declare function resolvePaperclipInstanceRoot(): string;
export declare function resolveDefaultConfigPath(): string;
export declare function resolveDefaultEmbeddedPostgresDir(): string;
export declare function resolveDefaultLogsDir(): string;
export declare function resolveDefaultSecretsKeyFilePath(): string;
export declare function resolveDefaultStorageDir(): string;
export declare function resolveDefaultBackupDir(): string;
export declare function resolveDefaultAgentWorkspaceDir(agentId: string): string;
/** Shared `instances/<id>/workspaces` root — where local agents should run by default (not per-agent subfolders). */
export declare function resolveSharedInstanceWorkspacesDir(): string;
/**
 * If `cwd` points at `.../workspaces/<uuid>/...`, rewrite to the parent `.../workspaces`.
 * Fixes bad configs that bound every agent to its own UUID directory under the shared pool.
 */
export declare function normalizePerAgentWorkspacesCwdToShared(cwd: string): string;
export declare function resolveManagedProjectWorkspaceDir(input: {
    companyId: string;
    projectId: string;
    repoName?: string | null;
}): string;
export declare function resolveHomeAwarePath(value: string): string;
//# sourceMappingURL=home-paths.d.ts.map