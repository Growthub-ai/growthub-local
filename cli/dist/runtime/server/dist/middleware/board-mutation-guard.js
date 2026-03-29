const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_DEV_ORIGINS = [
    "http://localhost:3100",
    "http://127.0.0.1:3100",
];
function parseOrigin(value) {
    if (!value)
        return null;
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`.toLowerCase();
    }
    catch {
        return null;
    }
}
function trustedOriginsForRequest(req) {
    const origins = new Set(DEFAULT_DEV_ORIGINS.map((value) => value.toLowerCase()));
    const host = req.header("host")?.trim();
    if (host) {
        origins.add(`http://${host}`.toLowerCase());
        origins.add(`https://${host}`.toLowerCase());
    }
    return origins;
}
function isTrustedBoardMutationRequest(req) {
    const allowedOrigins = trustedOriginsForRequest(req);
    const origin = parseOrigin(req.header("origin"));
    if (origin && allowedOrigins.has(origin))
        return true;
    const refererOrigin = parseOrigin(req.header("referer"));
    if (refererOrigin && allowedOrigins.has(refererOrigin))
        return true;
    return false;
}
export function boardMutationGuard() {
    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method.toUpperCase())) {
            next();
            return;
        }
        if (req.actor.type !== "board") {
            next();
            return;
        }
        // Local-trusted mode uses an implicit board actor for localhost-only development.
        // In this mode, origin/referer headers can be omitted by some clients for multipart
        // uploads; do not block those mutations.
        if (req.actor.source === "local_implicit") {
            next();
            return;
        }
        if (!isTrustedBoardMutationRequest(req)) {
            res.status(403).json({ error: "Board mutation requires trusted browser origin" });
            return;
        }
        next();
    };
}
//# sourceMappingURL=board-mutation-guard.js.map