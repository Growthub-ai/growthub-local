import { pgTable, uuid, text, timestamp, integer, boolean as pgBoolean } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  issuePrefix: text("issue_prefix"),
  issueCounter: integer("issue_counter").notNull().default(0),
  budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
  spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
  requireBoardApprovalForNewAgents: pgBoolean("require_board_approval_for_new_agents").default(false),
  brandColor: text("brand_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
