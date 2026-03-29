import express, { type Request as ExpressRequest } from "express";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode, SurfaceRuntimeContract } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
type UiMode = "none" | "static" | "vite-dev";
export declare function resolveViteHmrPort(serverPort: number): number;
export declare function createApp(db: Db, opts: {
    uiMode: UiMode;
    serverPort: number;
    surfaceRuntime: SurfaceRuntimeContract;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    localPluginDir?: string;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
}): Promise<import("express-serve-static-core").Express>;
export {};
//# sourceMappingURL=app.d.ts.map