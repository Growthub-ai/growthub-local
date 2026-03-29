import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { and, eq, isNull } from "drizzle-orm";
import { agentApiKeys, companyMemberships, instanceUserRoles } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { subscribeCompanyLiveEvents } from "../services/live-events.js";
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require("ws");
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
function rejectUpgrade(socket, statusLine, message) {
    const safe = message.replace(/[\r\n]+/g, " ").trim();
    socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${safe}`);
    socket.destroy();
}
function parseCompanyId(pathname) {
    const match = pathname.match(/^\/api\/companies\/([^/]+)\/events\/ws$/);
    if (!match)
        return null;
    try {
        return decodeURIComponent(match[1] ?? "");
    }
    catch {
        return null;
    }
}
function parseBearerToken(rawAuth) {
    const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (!auth)
        return null;
    if (!auth.toLowerCase().startsWith("bearer "))
        return null;
    const token = auth.slice("bearer ".length).trim();
    return token.length > 0 ? token : null;
}
function headersFromIncomingMessage(req) {
    const headers = new Headers();
    for (const [key, raw] of Object.entries(req.headers)) {
        if (!raw)
            continue;
        if (Array.isArray(raw)) {
            for (const value of raw)
                headers.append(key, value);
            continue;
        }
        headers.set(key, raw);
    }
    return headers;
}
async function authorizeUpgrade(db, req, companyId, url, opts) {
    const queryToken = url.searchParams.get("token")?.trim() ?? "";
    const authToken = parseBearerToken(req.headers.authorization);
    const token = authToken ?? (queryToken.length > 0 ? queryToken : null);
    // Browser board context has no bearer token in local_trusted and authenticated modes.
    if (!token) {
        if (opts.deploymentMode === "local_trusted") {
            return {
                companyId,
                actorType: "board",
                actorId: "board",
            };
        }
        if (opts.deploymentMode !== "authenticated" || !opts.resolveSessionFromHeaders) {
            return null;
        }
        const session = await opts.resolveSessionFromHeaders(headersFromIncomingMessage(req));
        const userId = session?.user?.id;
        if (!userId)
            return null;
        const [roleRow, memberships] = await Promise.all([
            db
                .select({ id: instanceUserRoles.id })
                .from(instanceUserRoles)
                .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
                .then((rows) => rows[0] ?? null),
            db
                .select({ companyId: companyMemberships.companyId })
                .from(companyMemberships)
                .where(and(eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, userId), eq(companyMemberships.status, "active"))),
        ]);
        const hasCompanyMembership = memberships.some((row) => row.companyId === companyId);
        if (!roleRow && !hasCompanyMembership)
            return null;
        return {
            companyId,
            actorType: "board",
            actorId: userId,
        };
    }
    const tokenHash = hashToken(token);
    const key = await db
        .select()
        .from(agentApiKeys)
        .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
        .then((rows) => rows[0] ?? null);
    if (!key || key.companyId !== companyId) {
        return null;
    }
    await db
        .update(agentApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(agentApiKeys.id, key.id));
    return {
        companyId,
        actorType: "agent",
        actorId: key.agentId,
    };
}
export function setupLiveEventsWebSocketServer(server, db, opts) {
    const wss = new WebSocketServer({ noServer: true });
    const cleanupByClient = new Map();
    const aliveByClient = new Map();
    const pingInterval = setInterval(() => {
        for (const socket of wss.clients) {
            if (!aliveByClient.get(socket)) {
                socket.terminate();
                continue;
            }
            aliveByClient.set(socket, false);
            socket.ping();
        }
    }, 30000);
    wss.on("connection", (socket, req) => {
        const context = req.paperclipUpgradeContext;
        if (!context) {
            socket.close(1008, "missing context");
            return;
        }
        const unsubscribe = subscribeCompanyLiveEvents(context.companyId, (event) => {
            if (socket.readyState !== WebSocket.OPEN)
                return;
            socket.send(JSON.stringify(event));
        });
        cleanupByClient.set(socket, unsubscribe);
        aliveByClient.set(socket, true);
        socket.on("pong", () => {
            aliveByClient.set(socket, true);
        });
        socket.on("close", () => {
            const cleanup = cleanupByClient.get(socket);
            if (cleanup)
                cleanup();
            cleanupByClient.delete(socket);
            aliveByClient.delete(socket);
        });
        socket.on("error", (err) => {
            logger.warn({ err, companyId: context.companyId }, "live websocket client error");
        });
    });
    wss.on("close", () => {
        clearInterval(pingInterval);
    });
    server.on("upgrade", (req, socket, head) => {
        if (!req.url) {
            rejectUpgrade(socket, "400 Bad Request", "missing url");
            return;
        }
        const url = new URL(req.url, "http://localhost");
        const companyId = parseCompanyId(url.pathname);
        if (!companyId) {
            socket.destroy();
            return;
        }
        void authorizeUpgrade(db, req, companyId, url, {
            deploymentMode: opts.deploymentMode,
            resolveSessionFromHeaders: opts.resolveSessionFromHeaders,
        })
            .then((context) => {
            if (!context) {
                rejectUpgrade(socket, "403 Forbidden", "forbidden");
                return;
            }
            const reqWithContext = req;
            reqWithContext.paperclipUpgradeContext = context;
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, reqWithContext);
            });
        })
            .catch((err) => {
            logger.error({ err, path: req.url }, "failed websocket upgrade authorization");
            rejectUpgrade(socket, "500 Internal Server Error", "upgrade failed");
        });
    });
    return wss;
}
//# sourceMappingURL=live-events-ws.js.map