export type NormalizedAgentPermissions = Record<string, unknown> & {
    canCreateAgents: boolean;
};
export declare function defaultPermissionsForRole(role: string): NormalizedAgentPermissions;
export declare function normalizeAgentPermissions(permissions: unknown, role: string): NormalizedAgentPermissions;
//# sourceMappingURL=agent-permissions.d.ts.map