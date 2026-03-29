const PROJECT_URL_KEY_DELIM_RE = /[^a-z0-9]+/g;
const PROJECT_URL_KEY_TRIM_RE = /^-+|-+$/g;
export function normalizeProjectUrlKey(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(PROJECT_URL_KEY_DELIM_RE, "-")
        .replace(PROJECT_URL_KEY_TRIM_RE, "");
    return normalized.length > 0 ? normalized : null;
}
export function deriveProjectUrlKey(name, fallback) {
    return normalizeProjectUrlKey(name) ?? normalizeProjectUrlKey(fallback) ?? "project";
}
//# sourceMappingURL=project-url-key.js.map