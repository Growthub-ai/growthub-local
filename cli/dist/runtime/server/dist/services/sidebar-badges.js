import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import { agents, approvals, heartbeatRuns } from "@paperclipai/db";
const ACTIONABLE_APPROVAL_STATUSES = ["pending", "revision_requested"];
const FAILED_HEARTBEAT_STATUSES = ["failed", "timed_out"];
export function sidebarBadgeService(db) {
    return {
        get: async (companyId, extra) => {
            const actionableApprovals = await db
                .select({ count: sql `count(*)` })
                .from(approvals)
                .where(and(eq(approvals.companyId, companyId), inArray(approvals.status, ACTIONABLE_APPROVAL_STATUSES)))
                .then((rows) => Number(rows[0]?.count ?? 0));
            const latestRunByAgent = await db
                .selectDistinctOn([heartbeatRuns.agentId], {
                runStatus: heartbeatRuns.status,
            })
                .from(heartbeatRuns)
                .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
                .where(and(eq(heartbeatRuns.companyId, companyId), eq(agents.companyId, companyId), not(eq(agents.status, "terminated"))))
                .orderBy(heartbeatRuns.agentId, desc(heartbeatRuns.createdAt));
            const failedRuns = latestRunByAgent.filter((row) => FAILED_HEARTBEAT_STATUSES.includes(row.runStatus)).length;
            const joinRequests = extra?.joinRequests ?? 0;
            const unreadTouchedIssues = extra?.unreadTouchedIssues ?? 0;
            return {
                inbox: actionableApprovals + failedRuns + joinRequests + unreadTouchedIssues,
                approvals: actionableApprovals,
                failedRuns,
                joinRequests,
            };
        },
    };
}
//# sourceMappingURL=sidebar-badges.js.map