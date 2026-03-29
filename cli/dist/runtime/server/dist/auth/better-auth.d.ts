import type { Request, RequestHandler } from "express";
import { betterAuth } from "better-auth";
import type { Db } from "@paperclipai/db";
import type { Config } from "../config.js";
export type BetterAuthSessionUser = {
    id: string;
    email?: string | null;
    name?: string | null;
};
export type BetterAuthSessionResult = {
    session: {
        id: string;
        userId: string;
    } | null;
    user: BetterAuthSessionUser | null;
};
type BetterAuthInstance = ReturnType<typeof betterAuth>;
export declare function deriveAuthTrustedOrigins(config: Config): string[];
export declare function createBetterAuthInstance(db: Db, config: Config, trustedOrigins?: string[]): BetterAuthInstance;
export declare function createBetterAuthHandler(auth: BetterAuthInstance): RequestHandler;
export declare function resolveBetterAuthSessionFromHeaders(auth: BetterAuthInstance, headers: Headers): Promise<BetterAuthSessionResult | null>;
export declare function resolveBetterAuthSession(auth: BetterAuthInstance, req: Request): Promise<BetterAuthSessionResult | null>;
export {};
//# sourceMappingURL=better-auth.d.ts.map