import { and, desc, eq } from "drizzle-orm";
import { issueWorkProducts } from "@paperclipai/db";
function toIssueWorkProduct(row) {
    return {
        id: row.id,
        companyId: row.companyId,
        projectId: row.projectId ?? null,
        issueId: row.issueId,
        executionWorkspaceId: row.executionWorkspaceId ?? null,
        runtimeServiceId: row.runtimeServiceId ?? null,
        type: row.type,
        provider: row.provider,
        externalId: row.externalId ?? null,
        title: row.title,
        url: row.url ?? null,
        status: row.status,
        reviewState: row.reviewState,
        isPrimary: row.isPrimary,
        healthStatus: row.healthStatus,
        summary: row.summary ?? null,
        metadata: row.metadata ?? null,
        createdByRunId: row.createdByRunId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
export function workProductService(db) {
    return {
        listForIssue: async (issueId) => {
            const rows = await db
                .select()
                .from(issueWorkProducts)
                .where(eq(issueWorkProducts.issueId, issueId))
                .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
            return rows.map(toIssueWorkProduct);
        },
        getById: async (id) => {
            const row = await db
                .select()
                .from(issueWorkProducts)
                .where(eq(issueWorkProducts.id, id))
                .then((rows) => rows[0] ?? null);
            return row ? toIssueWorkProduct(row) : null;
        },
        createForIssue: async (issueId, companyId, data) => {
            const row = await db.transaction(async (tx) => {
                if (data.isPrimary) {
                    await tx
                        .update(issueWorkProducts)
                        .set({ isPrimary: false, updatedAt: new Date() })
                        .where(and(eq(issueWorkProducts.companyId, companyId), eq(issueWorkProducts.issueId, issueId), eq(issueWorkProducts.type, data.type)));
                }
                return await tx
                    .insert(issueWorkProducts)
                    .values({
                    ...data,
                    companyId,
                    issueId,
                })
                    .returning()
                    .then((rows) => rows[0] ?? null);
            });
            return row ? toIssueWorkProduct(row) : null;
        },
        update: async (id, patch) => {
            const row = await db.transaction(async (tx) => {
                const existing = await tx
                    .select()
                    .from(issueWorkProducts)
                    .where(eq(issueWorkProducts.id, id))
                    .then((rows) => rows[0] ?? null);
                if (!existing)
                    return null;
                if (patch.isPrimary === true) {
                    await tx
                        .update(issueWorkProducts)
                        .set({ isPrimary: false, updatedAt: new Date() })
                        .where(and(eq(issueWorkProducts.companyId, existing.companyId), eq(issueWorkProducts.issueId, existing.issueId), eq(issueWorkProducts.type, existing.type)));
                }
                return await tx
                    .update(issueWorkProducts)
                    .set({ ...patch, updatedAt: new Date() })
                    .where(eq(issueWorkProducts.id, id))
                    .returning()
                    .then((rows) => rows[0] ?? null);
            });
            return row ? toIssueWorkProduct(row) : null;
        },
        remove: async (id) => {
            const row = await db
                .delete(issueWorkProducts)
                .where(eq(issueWorkProducts.id, id))
                .returning()
                .then((rows) => rows[0] ?? null);
            return row ? toIssueWorkProduct(row) : null;
        },
    };
}
export { toIssueWorkProduct };
//# sourceMappingURL=work-products.js.map