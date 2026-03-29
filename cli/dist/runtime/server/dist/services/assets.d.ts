import type { Db } from "@paperclipai/db";
import { assets } from "@paperclipai/db";
export declare function assetService(db: Db): {
    create: (companyId: string, data: Omit<typeof assets.$inferInsert, "companyId">) => Promise<{
        sha256: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
    }>;
    getById: (id: string) => Promise<{
        sha256: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        provider: string;
        objectKey: string;
        contentType: string;
        byteSize: number;
        originalFilename: string | null;
        createdByAgentId: string | null;
        createdByUserId: string | null;
    }>;
};
//# sourceMappingURL=assets.d.ts.map