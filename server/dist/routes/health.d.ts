import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode, SurfaceProfile } from "@paperclipai/shared";
export declare function healthRoutes(db?: Db, opts?: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    surfaceProfile?: SurfaceProfile;
}): import("express-serve-static-core").Router;
//# sourceMappingURL=health.d.ts.map