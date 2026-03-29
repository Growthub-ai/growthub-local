import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode, SurfaceProfile } from "@paperclipai/shared";
export declare function healthRoutes(db?: Db, opts?: {
    surfaceProfile: SurfaceProfile;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
}): import("express-serve-static-core").Router;
//# sourceMappingURL=health.d.ts.map