function isLoopbackHostname(hostname) {
    const normalized = hostname.trim().toLowerCase();
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
function extractHostname(req) {
    const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
    const hostHeader = req.header("host")?.trim();
    const raw = forwardedHost || hostHeader;
    if (!raw)
        return null;
    try {
        return new URL(`http://${raw}`).hostname.trim().toLowerCase();
    }
    catch {
        return raw.trim().toLowerCase();
    }
}
function normalizeAllowedHostnames(values) {
    const unique = new Set();
    for (const value of values) {
        const trimmed = value.trim().toLowerCase();
        if (!trimmed)
            continue;
        unique.add(trimmed);
    }
    return Array.from(unique);
}
export function resolvePrivateHostnameAllowSet(opts) {
    const configuredAllow = normalizeAllowedHostnames(opts.allowedHostnames);
    const bindHost = opts.bindHost.trim().toLowerCase();
    const allowSet = new Set(configuredAllow);
    if (bindHost && bindHost !== "0.0.0.0") {
        allowSet.add(bindHost);
    }
    allowSet.add("localhost");
    allowSet.add("127.0.0.1");
    allowSet.add("::1");
    return allowSet;
}
function blockedHostnameMessage(hostname) {
    return (`Hostname '${hostname}' is not allowed for this Paperclip instance. ` +
        `If you want to allow this hostname, please run pnpm paperclipai allowed-hostname ${hostname}`);
}
export function privateHostnameGuard(opts) {
    if (!opts.enabled) {
        return (_req, _res, next) => next();
    }
    const allowSet = resolvePrivateHostnameAllowSet({
        allowedHostnames: opts.allowedHostnames,
        bindHost: opts.bindHost,
    });
    return (req, res, next) => {
        const hostname = extractHostname(req);
        const wantsJson = req.path.startsWith("/api") || req.accepts(["json", "html", "text"]) === "json";
        if (!hostname) {
            const error = "Missing Host header. If you want to allow a hostname, run pnpm paperclipai allowed-hostname <host>.";
            if (wantsJson) {
                res.status(403).json({ error });
            }
            else {
                res.status(403).type("text/plain").send(error);
            }
            return;
        }
        if (isLoopbackHostname(hostname) || allowSet.has(hostname)) {
            next();
            return;
        }
        const error = blockedHostnameMessage(hostname);
        if (wantsJson) {
            res.status(403).json({ error });
        }
        else {
            res.status(403).type("text/plain").send(error);
        }
    };
}
//# sourceMappingURL=private-hostname-guard.js.map