import type { RequestHandler } from "express";
export declare function resolvePrivateHostnameAllowSet(opts: {
    allowedHostnames: string[];
    bindHost: string;
}): Set<string>;
export declare function privateHostnameGuard(opts: {
    enabled: boolean;
    allowedHostnames: string[];
    bindHost: string;
}): RequestHandler;
//# sourceMappingURL=private-hostname-guard.d.ts.map