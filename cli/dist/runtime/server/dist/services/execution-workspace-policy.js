import { asString, parseObject } from "../adapters/utils.js";
function cloneRecord(value) {
    if (!value)
        return null;
    return { ...value };
}
function parseExecutionWorkspaceStrategy(raw) {
    const parsed = parseObject(raw);
    const type = asString(parsed.type, "");
    if (type !== "project_primary" && type !== "git_worktree" && type !== "adapter_managed" && type !== "cloud_sandbox") {
        return null;
    }
    return {
        type,
        ...(typeof parsed.baseRef === "string" ? { baseRef: parsed.baseRef } : {}),
        ...(typeof parsed.branchTemplate === "string" ? { branchTemplate: parsed.branchTemplate } : {}),
        ...(typeof parsed.worktreeParentDir === "string" ? { worktreeParentDir: parsed.worktreeParentDir } : {}),
        ...(typeof parsed.provisionCommand === "string" ? { provisionCommand: parsed.provisionCommand } : {}),
        ...(typeof parsed.teardownCommand === "string" ? { teardownCommand: parsed.teardownCommand } : {}),
    };
}
export function parseProjectExecutionWorkspacePolicy(raw) {
    const parsed = parseObject(raw);
    if (Object.keys(parsed).length === 0)
        return null;
    const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : false;
    const workspaceStrategy = parseExecutionWorkspaceStrategy(parsed.workspaceStrategy);
    const defaultMode = asString(parsed.defaultMode, "");
    const defaultProjectWorkspaceId = typeof parsed.defaultProjectWorkspaceId === "string" ? parsed.defaultProjectWorkspaceId : undefined;
    const allowIssueOverride = typeof parsed.allowIssueOverride === "boolean" ? parsed.allowIssueOverride : undefined;
    const normalizedDefaultMode = (() => {
        if (defaultMode === "shared_workspace" ||
            defaultMode === "isolated_workspace" ||
            defaultMode === "operator_branch" ||
            defaultMode === "adapter_default") {
            return defaultMode;
        }
        if (defaultMode === "project_primary")
            return "shared_workspace";
        if (defaultMode === "isolated")
            return "isolated_workspace";
        return undefined;
    })();
    return {
        enabled,
        ...(normalizedDefaultMode ? { defaultMode: normalizedDefaultMode } : {}),
        ...(allowIssueOverride !== undefined ? { allowIssueOverride } : {}),
        ...(defaultProjectWorkspaceId ? { defaultProjectWorkspaceId } : {}),
        ...(workspaceStrategy ? { workspaceStrategy } : {}),
        ...(parsed.workspaceRuntime && typeof parsed.workspaceRuntime === "object" && !Array.isArray(parsed.workspaceRuntime)
            ? { workspaceRuntime: { ...parsed.workspaceRuntime } }
            : {}),
        ...(parsed.branchPolicy && typeof parsed.branchPolicy === "object" && !Array.isArray(parsed.branchPolicy)
            ? { branchPolicy: { ...parsed.branchPolicy } }
            : {}),
        ...(parsed.pullRequestPolicy && typeof parsed.pullRequestPolicy === "object" && !Array.isArray(parsed.pullRequestPolicy)
            ? { pullRequestPolicy: { ...parsed.pullRequestPolicy } }
            : {}),
        ...(parsed.runtimePolicy && typeof parsed.runtimePolicy === "object" && !Array.isArray(parsed.runtimePolicy)
            ? { runtimePolicy: { ...parsed.runtimePolicy } }
            : {}),
        ...(parsed.cleanupPolicy && typeof parsed.cleanupPolicy === "object" && !Array.isArray(parsed.cleanupPolicy)
            ? { cleanupPolicy: { ...parsed.cleanupPolicy } }
            : {}),
    };
}
export function gateProjectExecutionWorkspacePolicy(projectPolicy, isolatedWorkspacesEnabled) {
    if (!isolatedWorkspacesEnabled)
        return null;
    return projectPolicy;
}
export function parseIssueExecutionWorkspaceSettings(raw) {
    const parsed = parseObject(raw);
    if (Object.keys(parsed).length === 0)
        return null;
    const workspaceStrategy = parseExecutionWorkspaceStrategy(parsed.workspaceStrategy);
    const mode = asString(parsed.mode, "");
    const normalizedMode = (() => {
        if (mode === "inherit" ||
            mode === "shared_workspace" ||
            mode === "isolated_workspace" ||
            mode === "operator_branch" ||
            mode === "reuse_existing" ||
            mode === "agent_default") {
            return mode;
        }
        if (mode === "project_primary")
            return "shared_workspace";
        if (mode === "isolated")
            return "isolated_workspace";
        return "";
    })();
    return {
        ...(normalizedMode
            ? { mode: normalizedMode }
            : {}),
        ...(workspaceStrategy ? { workspaceStrategy } : {}),
        ...(parsed.workspaceRuntime && typeof parsed.workspaceRuntime === "object" && !Array.isArray(parsed.workspaceRuntime)
            ? { workspaceRuntime: { ...parsed.workspaceRuntime } }
            : {}),
    };
}
export function defaultIssueExecutionWorkspaceSettingsForProject(projectPolicy) {
    if (!projectPolicy?.enabled)
        return null;
    return {
        mode: projectPolicy.defaultMode === "isolated_workspace"
            ? "isolated_workspace"
            : projectPolicy.defaultMode === "operator_branch"
                ? "operator_branch"
                : projectPolicy.defaultMode === "adapter_default"
                    ? "agent_default"
                    : "shared_workspace",
    };
}
export function resolveExecutionWorkspaceMode(input) {
    const issueMode = input.issueSettings?.mode;
    if (issueMode && issueMode !== "inherit" && issueMode !== "reuse_existing") {
        return issueMode;
    }
    if (input.projectPolicy?.enabled) {
        if (input.projectPolicy.defaultMode === "isolated_workspace")
            return "isolated_workspace";
        if (input.projectPolicy.defaultMode === "operator_branch")
            return "operator_branch";
        if (input.projectPolicy.defaultMode === "adapter_default")
            return "agent_default";
        return "shared_workspace";
    }
    if (input.legacyUseProjectWorkspace === false) {
        return "agent_default";
    }
    return "shared_workspace";
}
export function buildExecutionWorkspaceAdapterConfig(input) {
    const nextConfig = { ...input.agentConfig };
    const projectHasPolicy = Boolean(input.projectPolicy?.enabled);
    const issueHasWorkspaceOverrides = Boolean(input.issueSettings?.mode ||
        input.issueSettings?.workspaceStrategy ||
        input.issueSettings?.workspaceRuntime);
    const hasWorkspaceControl = projectHasPolicy || issueHasWorkspaceOverrides || input.legacyUseProjectWorkspace === false;
    if (hasWorkspaceControl) {
        if (input.mode === "isolated_workspace") {
            const strategy = input.issueSettings?.workspaceStrategy ??
                input.projectPolicy?.workspaceStrategy ??
                parseExecutionWorkspaceStrategy(nextConfig.workspaceStrategy) ??
                { type: "git_worktree" };
            nextConfig.workspaceStrategy = strategy;
        }
        else {
            delete nextConfig.workspaceStrategy;
        }
        if (input.mode === "agent_default") {
            delete nextConfig.workspaceRuntime;
        }
        else if (input.issueSettings?.workspaceRuntime) {
            nextConfig.workspaceRuntime = cloneRecord(input.issueSettings.workspaceRuntime) ?? undefined;
        }
        else if (input.projectPolicy?.workspaceRuntime) {
            nextConfig.workspaceRuntime = cloneRecord(input.projectPolicy.workspaceRuntime) ?? undefined;
        }
    }
    return nextConfig;
}
//# sourceMappingURL=execution-workspace-policy.js.map