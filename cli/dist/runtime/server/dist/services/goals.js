import { and, asc, eq, isNull } from "drizzle-orm";
import { goals } from "@paperclipai/db";
export async function getDefaultCompanyGoal(db, companyId) {
    const activeRootGoal = await db
        .select()
        .from(goals)
        .where(and(eq(goals.companyId, companyId), eq(goals.level, "company"), eq(goals.status, "active"), isNull(goals.parentId)))
        .orderBy(asc(goals.createdAt))
        .then((rows) => rows[0] ?? null);
    if (activeRootGoal)
        return activeRootGoal;
    const anyRootGoal = await db
        .select()
        .from(goals)
        .where(and(eq(goals.companyId, companyId), eq(goals.level, "company"), isNull(goals.parentId)))
        .orderBy(asc(goals.createdAt))
        .then((rows) => rows[0] ?? null);
    if (anyRootGoal)
        return anyRootGoal;
    return db
        .select()
        .from(goals)
        .where(and(eq(goals.companyId, companyId), eq(goals.level, "company")))
        .orderBy(asc(goals.createdAt))
        .then((rows) => rows[0] ?? null);
}
export function goalService(db) {
    return {
        list: (companyId) => db.select().from(goals).where(eq(goals.companyId, companyId)),
        getById: (id) => db
            .select()
            .from(goals)
            .where(eq(goals.id, id))
            .then((rows) => rows[0] ?? null),
        getDefaultCompanyGoal: (companyId) => getDefaultCompanyGoal(db, companyId),
        create: (companyId, data) => db
            .insert(goals)
            .values({ ...data, companyId })
            .returning()
            .then((rows) => rows[0]),
        update: (id, data) => db
            .update(goals)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(goals.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
        remove: (id) => db
            .delete(goals)
            .where(eq(goals.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
    };
}
//# sourceMappingURL=goals.js.map