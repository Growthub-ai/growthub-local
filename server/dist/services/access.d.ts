import type { Db } from "@paperclipai/db";
import { companyMemberships } from "@paperclipai/db";
import type { PermissionKey, PrincipalType } from "@paperclipai/shared";
type MembershipRow = typeof companyMemberships.$inferSelect;
type GrantInput = {
    permissionKey: PermissionKey;
    scope?: Record<string, unknown> | null;
};
export declare function accessService(db: Db): {
    isInstanceAdmin: (userId: string | null | undefined) => Promise<boolean>;
    canUser: (companyId: string, userId: string | null | undefined, permissionKey: PermissionKey) => Promise<boolean>;
    hasPermission: (companyId: string, principalType: PrincipalType, principalId: string, permissionKey: PermissionKey) => Promise<boolean>;
    getMembership: (companyId: string, principalType: PrincipalType, principalId: string) => Promise<MembershipRow | null>;
    ensureMembership: (companyId: string, principalType: PrincipalType, principalId: string, membershipRole?: string | null, status?: "pending" | "active" | "suspended") => Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        principalType: string;
        principalId: string;
        membershipRole: string | null;
    }>;
    listMembers: (companyId: string) => Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        principalType: string;
        principalId: string;
        membershipRole: string | null;
    }[]>;
    setMemberPermissions: (companyId: string, memberId: string, grants: GrantInput[], grantedByUserId: string | null) => Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        principalType: string;
        principalId: string;
        membershipRole: string | null;
    } | null>;
    promoteInstanceAdmin: (userId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        role: string;
        userId: string;
    }>;
    demoteInstanceAdmin: (userId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        role: string;
        userId: string;
    }>;
    listUserCompanyAccess: (userId: string) => Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        principalType: string;
        principalId: string;
        membershipRole: string | null;
    }[]>;
    setUserCompanyAccess: (userId: string, companyIds: string[]) => Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        principalType: string;
        principalId: string;
        membershipRole: string | null;
    }[]>;
    setPrincipalGrants: (companyId: string, principalType: PrincipalType, principalId: string, grants: GrantInput[], grantedByUserId: string | null) => Promise<void>;
    listPrincipalGrants: (companyId: string, principalType: PrincipalType, principalId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        scope: Record<string, unknown> | null;
        principalType: string;
        principalId: string;
        permissionKey: string;
        grantedByUserId: string | null;
    }[]>;
    setPrincipalPermission: (companyId: string, principalType: PrincipalType, principalId: string, permissionKey: PermissionKey, enabled: boolean, grantedByUserId: string | null, scope?: Record<string, unknown> | null) => Promise<void>;
};
export {};
//# sourceMappingURL=access.d.ts.map