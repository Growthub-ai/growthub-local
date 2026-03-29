import type { Request } from "express";
export declare function assertBoard(req: Request): void;
export declare function assertCompanyAccess(req: Request, companyId: string): void;
export declare function getActorInfo(req: Request): {
    actorType: "agent";
    actorId: string;
    agentId: string | null;
    runId: string | null;
} | {
    actorType: "user";
    actorId: string;
    agentId: null;
    runId: string | null;
};
//# sourceMappingURL=authz.d.ts.map