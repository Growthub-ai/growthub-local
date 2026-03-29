import type { Request, RequestHandler } from "express";
import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import type { BetterAuthSessionResult } from "../auth/better-auth.js";
interface ActorMiddlewareOptions {
    deploymentMode: DeploymentMode;
    resolveSession?: (req: Request) => Promise<BetterAuthSessionResult | null>;
}
export declare function actorMiddleware(db: Db, opts: ActorMiddlewareOptions): RequestHandler;
export declare function requireBoard(req: Express.Request): boolean;
export {};
//# sourceMappingURL=auth.d.ts.map