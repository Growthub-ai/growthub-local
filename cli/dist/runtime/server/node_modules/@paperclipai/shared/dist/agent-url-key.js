const AGENT_URL_KEY_DELIM_RE = /[^a-z0-9]+/g;
const AGENT_URL_KEY_TRIM_RE = /^-+|-+$/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuidLike(value) {
    if (typeof value !== "string")
        return false;
    return UUID_RE.test(value.trim());
}
export function normalizeAgentUrlKey(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(AGENT_URL_KEY_DELIM_RE, "-")
        .replace(AGENT_URL_KEY_TRIM_RE, "");
    return normalized.length > 0 ? normalized : null;
}
export function deriveAgentUrlKey(name, fallback) {
    return normalizeAgentUrlKey(name) ?? normalizeAgentUrlKey(fallback) ?? "agent";
}
//# sourceMappingURL=agent-url-key.js.map