import { and, eq, desc, isNull } from "drizzle-orm";
import { tickets, issues } from "@paperclipai/db";
import { TICKET_STAGES } from "@paperclipai/shared";
export function ticketService(db) {
    return {
        list: (companyId) => db
            .select()
            .from(tickets)
            .where(eq(tickets.companyId, companyId))
            .orderBy(desc(tickets.updatedAt)),
        getById: (id) => db
            .select()
            .from(tickets)
            .where(eq(tickets.id, id))
            .then((rows) => rows[0] ?? null),
        create: async (companyId, data, createdByUserId) => {
            const count = await db
                .select()
                .from(tickets)
                .where(eq(tickets.companyId, companyId))
                .then((rows) => rows.length);
            const identifier = `TKT-${count + 1}`;
            return db
                .insert(tickets)
                .values({
                companyId,
                title: data.title,
                description: data.description ?? null,
                identifier,
                stageOrder: (data.stageOrder ?? [...TICKET_STAGES]),
                createdByUserId: createdByUserId ?? null,
            })
                .returning()
                .then((rows) => rows[0]);
        },
        update: (id, data) => db
            .update(tickets)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(tickets.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
        advanceStage: async (id) => {
            const ticket = await db
                .select()
                .from(tickets)
                .where(eq(tickets.id, id))
                .then((rows) => rows[0] ?? null);
            if (!ticket)
                return null;
            const order = ticket.stageOrder;
            const idx = order.indexOf(ticket.currentStage);
            const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : ticket.currentStage;
            const done = next === ticket.currentStage;
            return db
                .update(tickets)
                .set({
                currentStage: next,
                status: done ? "done" : ticket.status,
                completedAt: done ? new Date() : ticket.completedAt,
                updatedAt: new Date(),
            })
                .where(eq(tickets.id, id))
                .returning()
                .then((rows) => rows[0] ?? null);
        },
        remove: (id) => db
            .delete(tickets)
            .where(eq(tickets.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
        getIssues: (ticketId) => db
            .select()
            .from(issues)
            .where(and(eq(issues.ticketId, ticketId), isNull(issues.hiddenAt)))
            .orderBy(desc(issues.updatedAt)),
    };
}
//# sourceMappingURL=tickets.js.map