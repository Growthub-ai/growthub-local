export function defaultPermissionsForRole(role) {
    return {
        canCreateAgents: role === "ceo",
    };
}
export function normalizeAgentPermissions(permissions, role) {
    const defaults = defaultPermissionsForRole(role);
    if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
        return defaults;
    }
    const record = permissions;
    return {
        canCreateAgents: typeof record.canCreateAgents === "boolean"
            ? record.canCreateAgents
            : defaults.canCreateAgents,
    };
}
//# sourceMappingURL=agent-permissions.js.map