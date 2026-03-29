import type { Db } from "@paperclipai/db";
import { issueWorkProducts } from "@paperclipai/db";
import type { IssueWorkProduct } from "@paperclipai/shared";
type IssueWorkProductRow = typeof issueWorkProducts.$inferSelect;
declare function toIssueWorkProduct(row: IssueWorkProductRow): IssueWorkProduct;
export declare function workProductService(db: Db): {
    listForIssue: (issueId: string) => Promise<IssueWorkProduct[]>;
    getById: (id: string) => Promise<IssueWorkProduct | null>;
    createForIssue: (issueId: string, companyId: string, data: Omit<typeof issueWorkProducts.$inferInsert, "issueId" | "companyId">) => Promise<IssueWorkProduct | null>;
    update: (id: string, patch: Partial<typeof issueWorkProducts.$inferInsert>) => Promise<IssueWorkProduct | null>;
    remove: (id: string) => Promise<IssueWorkProduct | null>;
};
export { toIssueWorkProduct };
//# sourceMappingURL=work-products.d.ts.map