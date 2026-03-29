import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
type ChallengeStatus = "available" | "claimed" | "expired" | "invalid";
export declare function initializeBoardClaimChallenge(db: Db, opts: {
    deploymentMode: DeploymentMode;
}): Promise<void>;
export declare function getBoardClaimWarningUrl(host: string, port: number): string | null;
export declare function inspectBoardClaimChallenge(token: string, code: string | undefined): {
    status: ChallengeStatus;
    requiresSignIn: boolean;
    expiresAt: string | null;
    claimedByUserId: string | null;
};
export declare function claimBoardOwnership(db: Db, opts: {
    token: string;
    code: string | undefined;
    userId: string;
}): Promise<{
    status: ChallengeStatus;
    claimedByUserId?: string;
}>;
export {};
//# sourceMappingURL=board-claim.d.ts.map