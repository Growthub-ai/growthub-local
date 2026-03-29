import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import type { BetterAuthSessionResult } from "../auth/better-auth.js";
interface WsSocket {
    readyState: number;
    ping(): void;
    send(data: string): void;
    terminate(): void;
    close(code?: number, reason?: string): void;
    on(event: "pong", listener: () => void): void;
    on(event: "close", listener: () => void): void;
    on(event: "error", listener: (err: Error) => void): void;
}
interface WsServer {
    clients: Set<WsSocket>;
    on(event: "connection", listener: (socket: WsSocket, req: IncomingMessage) => void): void;
    on(event: "close", listener: () => void): void;
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, callback: (ws: WsSocket) => void): void;
    emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
}
export declare function setupLiveEventsWebSocketServer(server: HttpServer, db: Db, opts: {
    deploymentMode: DeploymentMode;
    resolveSessionFromHeaders?: (headers: Headers) => Promise<BetterAuthSessionResult | null>;
}): WsServer;
export {};
//# sourceMappingURL=live-events-ws.d.ts.map