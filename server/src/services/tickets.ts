import { and, eq, desc, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { tickets, issues } from "@paperclipai/db";
import type { CreateTicket, UpdateTicket } from "@paperclipai/shared";
import { TICKET_STAGES } from "@paperclipai/shared";

export function ticketService(db: Db) {
  return {
    list: (companyId: string) =>
      db
        .select()
        .from(tickets)
        .where(eq(tickets.companyId, companyId))
        .orderBy(desc(tickets.updatedAt)),

    getById: (id: string) =>
      db
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .then((rows) => rows[0] ?? null),

    create: async (companyId: string, data: CreateTicket, createdByUserId?: string) => {
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
          stageOrder: (data.stageOrder ?? [...TICKET_STAGES]) as string[],
          createdByUserId: createdByUserId ?? null,
        })
        .returning()
        .then((rows) => rows[0]);
    },

    update: (id: string, data: UpdateTicket) =>
      db
        .update(tickets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tickets.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    advanceStage: async (id: string) => {
      const ticket = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .then((rows) => rows[0] ?? null);
      if (!ticket) return null;
      const order = ticket.stageOrder as string[];
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

    remove: (id: string) =>
      db
        .delete(tickets)
        .where(eq(tickets.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    getIssues: (ticketId: string) =>
      db
        .select()
        .from(issues)
        .where(and(eq(issues.ticketId, ticketId), isNull(issues.hiddenAt)))
        .orderBy(desc(issues.updatedAt)),
  };
}
