import os from "node:os";
export const CURRENT_USER_REDACTION_TOKEN = "[]";
function isPlainObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function uniqueNonEmpty(values) {
    return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}
function splitPathSegments(value) {
    return value.replace(/[\\/]+$/, "").split(/[\\/]+/).filter(Boolean);
}
function replaceLastPathSegment(pathValue, replacement) {
    const normalized = pathValue.replace(/[\\/]+$/, "");
    const lastSeparator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    if (lastSeparator < 0)
        return replacement;
    return `${normalized.slice(0, lastSeparator + 1)}${replacement}`;
}
function defaultUserNames() {
    const candidates = [
        process.env.USER,
        process.env.LOGNAME,
        process.env.USERNAME,
    ];
    try {
        candidates.push(os.userInfo().username);
    }
    catch {
        // Some environments do not expose userInfo; env vars are enough fallback.
    }
    return uniqueNonEmpty(candidates);
}
function defaultHomeDirs(userNames) {
    const candidates = [
        process.env.HOME,
        process.env.USERPROFILE,
    ];
    try {
        candidates.push(os.homedir());
    }
    catch {
        // Ignore and fall back to env hints below.
    }
    for (const userName of userNames) {
        candidates.push(`/Users/${userName}`);
        candidates.push(`/home/${userName}`);
        candidates.push(`C:\\Users\\${userName}`);
    }
    return uniqueNonEmpty(candidates);
}
let cachedCurrentUserCandidates = null;
function getDefaultCurrentUserCandidates() {
    if (cachedCurrentUserCandidates)
        return cachedCurrentUserCandidates;
    const userNames = defaultUserNames();
    cachedCurrentUserCandidates = {
        userNames,
        homeDirs: defaultHomeDirs(userNames),
        replacement: CURRENT_USER_REDACTION_TOKEN,
    };
    return cachedCurrentUserCandidates;
}
function resolveCurrentUserCandidates(opts) {
    const defaults = getDefaultCurrentUserCandidates();
    const userNames = uniqueNonEmpty(opts?.userNames ?? defaults.userNames);
    const homeDirs = uniqueNonEmpty(opts?.homeDirs ?? defaults.homeDirs);
    const replacement = opts?.replacement?.trim() || defaults.replacement;
    return { userNames, homeDirs, replacement };
}
export function redactCurrentUserText(input, opts) {
    if (!input)
        return input;
    const { userNames, homeDirs, replacement } = resolveCurrentUserCandidates(opts);
    let result = input;
    for (const homeDir of [...homeDirs].sort((a, b) => b.length - a.length)) {
        const lastSegment = splitPathSegments(homeDir).pop() ?? "";
        const replacementDir = userNames.includes(lastSegment)
            ? replaceLastPathSegment(homeDir, replacement)
            : replacement;
        result = result.split(homeDir).join(replacementDir);
    }
    for (const userName of [...userNames].sort((a, b) => b.length - a.length)) {
        const pattern = new RegExp(`(?<![A-Za-z0-9._-])${escapeRegExp(userName)}(?![A-Za-z0-9._-])`, "g");
        result = result.replace(pattern, replacement);
    }
    return result;
}
export function redactCurrentUserValue(value, opts) {
    if (typeof value === "string") {
        return redactCurrentUserText(value, opts);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => redactCurrentUserValue(entry, opts));
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const redacted = {};
    for (const [key, entry] of Object.entries(value)) {
        redacted[key] = redactCurrentUserValue(entry, opts);
    }
    return redacted;
}
//# sourceMappingURL=log-redaction.js.map