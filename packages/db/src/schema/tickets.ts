import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import type { TicketStageDefinition } from "@paperclipai/shared";

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    identifier: text("identifier"),
    status: text("status").notNull().default("active"),
    currentStage: text("current_stage").notNull().default("planning"),
    stageOrder: jsonb("stage_order").$type<string[]>().notNull().default(["planning", "execution", "review", "qa", "human"]),
    stageDefinitions: jsonb("stage_definitions").$type<TicketStageDefinition[]>().notNull().default([]),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    instructions: text("instructions"),
    leadAgentId: uuid("lead_agent_id"),
  },
  (table) => ({
    companyIdx: index("tickets_company_idx").on(table.companyId),
    companyStatusIdx: index("tickets_company_status_idx").on(table.companyId, table.status),
  }),
);
