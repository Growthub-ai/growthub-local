import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { invites, joinRequests } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
export declare function companyInviteExpiresAt(nowMs?: number): Date;
type JoinDiagnostic = {
    code: string;
    level: "info" | "warn";
    message: string;
    hint?: string;
};
export declare function buildJoinDefaultsPayloadForAccept(input: {
    adapterType: string | null;
    defaultsPayload: unknown;
    paperclipApiUrl?: unknown;
    inboundOpenClawAuthHeader?: string | null;
    inboundOpenClawTokenHeader?: string | null;
}): unknown;
export declare function mergeJoinDefaultsPayloadForReplay(existingDefaultsPayload: unknown, nextDefaultsPayload: unknown): unknown;
export declare function canReplayOpenClawGatewayInviteAccept(input: {
    requestType: "human" | "agent";
    adapterType: string | null;
    existingJoinRequest: Pick<typeof joinRequests.$inferSelect, "requestType" | "adapterType" | "status"> | null;
}): boolean;
export declare function normalizeAgentDefaultsForJoin(input: {
    adapterType: string | null;
    defaultsPayload: unknown;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bindHost: string;
    allowedHostnames: string[];
}): {
    normalized: Record<string, unknown> | null;
    diagnostics: JoinDiagnostic[];
    fatalErrors: string[];
};
export declare function buildInviteOnboardingTextDocument(req: Request, token: string, invite: typeof invites.$inferSelect, opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bindHost: string;
    allowedHostnames: string[];
}): string;
type JoinRequestManagerCandidate = {
    id: string;
    role: string;
    reportsTo: string | null;
};
export declare function resolveJoinRequestAgentManagerId(candidates: JoinRequestManagerCandidate[]): string | null;
export declare function accessRoutes(db: Db, opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bindHost: string;
    allowedHostnames: string[];
}): import("express-serve-static-core").Router;
export {};
//# sourceMappingURL=access.d.ts.map