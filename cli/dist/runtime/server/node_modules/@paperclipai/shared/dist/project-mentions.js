export const PROJECT_MENTION_SCHEME = "project://";
const HEX_COLOR_RE = /^[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_RE = /^[0-9a-f]{3}$/i;
const HEX_COLOR_WITH_HASH_RE = /^#[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_WITH_HASH_RE = /^#[0-9a-f]{3}$/i;
const PROJECT_MENTION_LINK_RE = /\[[^\]]*]\((project:\/\/[^)\s]+)\)/gi;
function normalizeHexColor(input) {
    if (!input)
        return null;
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    if (HEX_COLOR_WITH_HASH_RE.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    if (HEX_COLOR_RE.test(trimmed)) {
        return `#${trimmed.toLowerCase()}`;
    }
    if (HEX_COLOR_SHORT_WITH_HASH_RE.test(trimmed)) {
        const raw = trimmed.slice(1).toLowerCase();
        return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
    }
    if (HEX_COLOR_SHORT_RE.test(trimmed)) {
        const raw = trimmed.toLowerCase();
        return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
    }
    return null;
}
export function buildProjectMentionHref(projectId, color) {
    const trimmedProjectId = projectId.trim();
    const normalizedColor = normalizeHexColor(color ?? null);
    if (!normalizedColor) {
        return `${PROJECT_MENTION_SCHEME}${trimmedProjectId}`;
    }
    return `${PROJECT_MENTION_SCHEME}${trimmedProjectId}?c=${encodeURIComponent(normalizedColor.slice(1))}`;
}
export function parseProjectMentionHref(href) {
    if (!href.startsWith(PROJECT_MENTION_SCHEME))
        return null;
    let url;
    try {
        url = new URL(href);
    }
    catch {
        return null;
    }
    if (url.protocol !== "project:")
        return null;
    const projectId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
    if (!projectId)
        return null;
    const color = normalizeHexColor(url.searchParams.get("c") ?? url.searchParams.get("color"));
    return {
        projectId,
        color,
    };
}
export function extractProjectMentionIds(markdown) {
    if (!markdown)
        return [];
    const ids = new Set();
    const re = new RegExp(PROJECT_MENTION_LINK_RE);
    let match;
    while ((match = re.exec(markdown)) !== null) {
        const parsed = parseProjectMentionHref(match[1]);
        if (parsed)
            ids.add(parsed.projectId);
    }
    return [...ids];
}
//# sourceMappingURL=project-mentions.js.map