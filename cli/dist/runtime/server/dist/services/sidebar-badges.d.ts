import type { Db } from "@paperclipai/db";
import type { SidebarBadges } from "@paperclipai/shared";
export declare function sidebarBadgeService(db: Db): {
    get: (companyId: string, extra?: {
        joinRequests?: number;
        unreadTouchedIssues?: number;
    }) => Promise<SidebarBadges>;
};
//# sourceMappingURL=sidebar-badges.d.ts.map