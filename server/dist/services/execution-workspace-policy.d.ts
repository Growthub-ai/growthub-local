import type { ExecutionWorkspaceMode, IssueExecutionWorkspaceSettings, ProjectExecutionWorkspacePolicy } from "@paperclipai/shared";
type ParsedExecutionWorkspaceMode = Exclude<ExecutionWorkspaceMode, "inherit" | "reuse_existing">;
export declare function parseProjectExecutionWorkspacePolicy(raw: unknown): ProjectExecutionWorkspacePolicy | null;
export declare function gateProjectExecutionWorkspacePolicy(projectPolicy: ProjectExecutionWorkspacePolicy | null, isolatedWorkspacesEnabled: boolean): ProjectExecutionWorkspacePolicy | null;
export declare function parseIssueExecutionWorkspaceSettings(raw: unknown): IssueExecutionWorkspaceSettings | null;
export declare function defaultIssueExecutionWorkspaceSettingsForProject(projectPolicy: ProjectExecutionWorkspacePolicy | null): IssueExecutionWorkspaceSettings | null;
export declare function resolveExecutionWorkspaceMode(input: {
    projectPolicy: ProjectExecutionWorkspacePolicy | null;
    issueSettings: IssueExecutionWorkspaceSettings | null;
    legacyUseProjectWorkspace: boolean | null;
}): ParsedExecutionWorkspaceMode;
export declare function buildExecutionWorkspaceAdapterConfig(input: {
    agentConfig: Record<string, unknown>;
    projectPolicy: ProjectExecutionWorkspacePolicy | null;
    issueSettings: IssueExecutionWorkspaceSettings | null;
    mode: ParsedExecutionWorkspaceMode;
    legacyUseProjectWorkspace: boolean | null;
}): Record<string, unknown>;
export {};
//# sourceMappingURL=execution-workspace-policy.d.ts.map