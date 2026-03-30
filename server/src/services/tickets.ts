import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, executionWorkspaces, issues, tickets } from "@paperclipai/db";
import type { CreateTicket, TicketStageDefinition, UpdateTicket } from "@paperclipai/shared";
import {
  buildTicketStageOrder,
  formatTicketStageLabel,
  getTicketStageDefinition,
  normalizeTicketStageDefinitions,
  resolveTicketCurrentStage,
} from "@paperclipai/shared";
import { resolveIssueGoalId } from "./issue-goal-fallback.js";
import { getDefaultCompanyGoal } from "./goals.js";

interface TicketStageStateInput {
  stageDefinitions?: TicketStageDefinition[] | null;
  stageOrder?: string[] | null;
  currentStage?: string | null;
}

interface TicketBootstrapContext {
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  instructions: string | null;
  stageDefinition?: TicketStageDefinition | null;
  previousStageDefinition?: TicketStageDefinition | null;
  previousIssue?: {
    identifier: string | null;
    title: string;
    status: string;
  } | null;
}

export function resolveTicketStageState(input: TicketStageStateInput) {
  const stageDefinitions = normalizeTicketStageDefinitions({
    stageDefinitions: input.stageDefinitions,
    stageOrder: input.stageOrder,
  });
  return {
    stageDefinitions,
    stageOrder: buildTicketStageOrder(stageDefinitions),
    currentStage: resolveTicketCurrentStage(input.currentStage, stageDefinitions),
  };
}

export function formatTicketBootstrapIssueDescription(input: TicketBootstrapContext): string | null {
  const sections: string[] = [];

  const description = input.description?.trim();
  if (description) {
    sections.push(description);
  }

  const instructions = input.instructions?.trim();
  if (instructions) {
    sections.push(`## Ticket Instructions\n${instructions}`);
  }

  if (input.stageDefinition) {
    const details = [
      `stage: ${input.stageDefinition.label}`,
      input.stageDefinition.kind ? `kind: ${input.stageDefinition.kind}` : null,
      input.stageDefinition.ownerRole ? `owner role: ${input.stageDefinition.ownerRole}` : null,
      input.stageDefinition.handoffMode ? `handoff mode: ${input.stageDefinition.handoffMode}` : null,
    ].filter((value): value is string => Boolean(value));

    if (details.length > 0) {
      sections.push(`## Stage Context\n- ${details.join("\n- ")}`);
    }

    if (input.stageDefinition.instructions) {
      sections.push(`## Stage Instructions\n${input.stageDefinition.instructions}`);
    }

    if (input.stageDefinition.exitCriteria) {
      sections.push(`## Exit Criteria\n${input.stageDefinition.exitCriteria}`);
    }
  }

  if (input.previousStageDefinition || input.previousIssue) {
    const handoffLines = [
      input.previousStageDefinition ? `from stage: ${input.previousStageDefinition.label}` : null,
      input.previousIssue?.identifier ? `previous issue: ${input.previousIssue.identifier}` : null,
      input.previousIssue?.title ? `previous issue title: ${input.previousIssue.title}` : null,
      input.previousIssue?.status ? `previous issue status: ${input.previousIssue.status}` : null,
    ].filter((value): value is string => Boolean(value));

    if (handoffLines.length > 0) {
      sections.push(`## Handoff Context\n- ${handoffLines.join("\n- ")}`);
    }
  }

  const linkedPr = input.metadata?.linkedPr;
  if (linkedPr && typeof linkedPr === "object") {
    const pr = linkedPr as Record<string, unknown>;
    const number = typeof pr.number === "number" ? `#${pr.number}` : null;
    const title = typeof pr.title === "string" && pr.title.trim().length > 0 ? pr.title.trim() : null;
    const branch = typeof pr.branch === "string" && pr.branch.trim().length > 0 ? pr.branch.trim() : null;
    const repo = typeof pr.repo === "string" && pr.repo.trim().length > 0 ? pr.repo.trim() : null;
    const url = typeof pr.url === "string" && pr.url.trim().length > 0 ? pr.url.trim() : null;
    const details = [
      number,
      title,
      branch ? `branch: ${branch}` : null,
      repo ? `repo: ${repo}` : null,
      url,
    ].filter((value): value is string => Boolean(value));

    if (details.length > 0) {
      sections.push(`## Linked PR\n- ${details.join("\n- ")}`);
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

async function resolveStageAssigneeAgentId(input: {
  tx: any;
  companyId: string;
  stageDefinition: TicketStageDefinition | null;
  fallbackLeadAgentId: string | null;
}) {
  if (!input.stageDefinition?.ownerRole) {
    return input.fallbackLeadAgentId;
  }

  const matchingAgent = await input.tx
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, input.companyId),
        eq(agents.role, input.stageDefinition.ownerRole),
        ne(agents.status, "terminated"),
      ),
    )
    .orderBy(asc(agents.createdAt))
    .then((rows: Array<{ id: string }>) => rows[0] ?? null);

  return matchingAgent?.id ?? input.fallbackLeadAgentId;
}

async function getLatestStageIssue(input: {
  tx: any;
  ticketId: string;
  stage: string | null;
}) {
  if (!input.stage) return null;
  return input.tx
    .select({
      identifier: issues.identifier,
      title: issues.title,
      status: issues.status,
    })
    .from(issues)
    .where(
      and(
        eq(issues.ticketId, input.ticketId),
        eq(issues.ticketStage, input.stage),
        isNull(issues.hiddenAt),
      ),
    )
    .orderBy(desc(issues.updatedAt))
    .then((rows: Array<{ identifier: string | null; title: string; status: string }>) => rows[0] ?? null);
}

async function ensureStageIssue(input: {
  tx: any;
  companyId: string;
  ticket: {
    id: string;
    title: string;
    description: string | null;
    metadata: Record<string, unknown> | null;
    instructions: string | null;
    leadAgentId: string | null;
    createdByUserId: string | null;
  };
  stage: string;
  stageDefinition: TicketStageDefinition | null;
  previousStageDefinition?: TicketStageDefinition | null;
}) {
  const existingCount = await input.tx
    .select({ count: sql<number>`count(*)` })
    .from(issues)
    .where(
      and(
        eq(issues.ticketId, input.ticket.id),
        eq(issues.ticketStage, input.stage),
        isNull(issues.hiddenAt),
      ),
    )
    .then((rows: Array<{ count: number }>) => Number(rows[0]?.count ?? 0));

  if (existingCount > 0) return;

  const [defaultCompanyGoal, company, assigneeAgentId, previousIssue] = await Promise.all([
    getDefaultCompanyGoal(input.tx, input.companyId),
    input.tx
      .update(companies)
      .set({ issueCounter: sql`${companies.issueCounter} + 1` })
      .where(eq(companies.id, input.companyId))
      .returning({ issueCounter: companies.issueCounter, issuePrefix: companies.issuePrefix })
      .then((rows: Array<{ issueCounter: number; issuePrefix: string }>) => rows[0]),
    resolveStageAssigneeAgentId({
      tx: input.tx,
      companyId: input.companyId,
      stageDefinition: input.stageDefinition,
      fallbackLeadAgentId: input.ticket.leadAgentId,
    }),
    getLatestStageIssue({
      tx: input.tx,
      ticketId: input.ticket.id,
      stage: input.previousStageDefinition?.key ?? null,
    }),
  ]);

  await input.tx.insert(issues).values({
    companyId: input.companyId,
    ticketId: input.ticket.id,
    ticketStage: input.stage,
    title: input.ticket.title,
    description: formatTicketBootstrapIssueDescription({
      title: input.ticket.title,
      description: input.ticket.description ?? null,
      metadata: input.ticket.metadata ?? null,
      instructions: input.ticket.instructions ?? null,
      stageDefinition: input.stageDefinition,
      previousStageDefinition: input.previousStageDefinition ?? null,
      previousIssue,
    }),
    status: "backlog",
    priority: "medium",
    assigneeAgentId: assigneeAgentId ?? null,
    createdByUserId: input.ticket.createdByUserId,
    issueNumber: company.issueCounter,
    identifier: `${company.issuePrefix}-${company.issueCounter}`,
    requestDepth: 0,
    goalId: resolveIssueGoalId({
      projectId: null,
      goalId: null,
      defaultGoalId: defaultCompanyGoal?.id ?? null,
    }),
  });
}

function getTicketStageContract(ticket: typeof tickets.$inferSelect) {
  return resolveTicketStageState({
    stageDefinitions: ticket.stageDefinitions ?? null,
    stageOrder: ticket.stageOrder as string[],
    currentStage: ticket.currentStage,
  });
}

function toNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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
      const stageState = resolveTicketStageState({
        stageDefinitions: data.stageDefinitions,
        stageOrder: data.stageOrder,
      });

      return db.transaction(async (tx) => {
        const count = await tx
          .select()
          .from(tickets)
          .where(eq(tickets.companyId, companyId))
          .then((rows) => rows.length);
        const identifier = `TKT-${count + 1}`;

        const ticket = await tx
          .insert(tickets)
          .values({
            companyId,
            title: data.title,
            description: data.description ?? null,
            identifier,
            currentStage: stageState.currentStage,
            stageOrder: stageState.stageOrder,
            stageDefinitions: stageState.stageDefinitions,
            createdByUserId: createdByUserId ?? null,
            metadata: data.metadata ?? null,
            instructions: data.instructions ?? null,
            leadAgentId: data.leadAgentId ?? null,
          })
          .returning()
          .then((rows) => rows[0]);

        await ensureStageIssue({
          tx,
          companyId,
          ticket: {
            id: ticket.id,
            title: ticket.title,
            description: ticket.description ?? null,
            metadata: toNullableRecord(ticket.metadata),
            instructions: ticket.instructions ?? null,
            leadAgentId: ticket.leadAgentId ?? null,
            createdByUserId: ticket.createdByUserId ?? null,
          },
          stage: stageState.currentStage,
          stageDefinition: getTicketStageDefinition(stageState.stageDefinitions, stageState.currentStage),
        });

        return ticket;
      });
    },

    update: async (id: string, data: UpdateTicket) => {
      return db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(tickets)
          .where(eq(tickets.id, id))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        const existingStageState = getTicketStageContract(existing);
        const stageContractChanged =
          Object.prototype.hasOwnProperty.call(data, "stageDefinitions") ||
          Object.prototype.hasOwnProperty.call(data, "stageOrder");
        const currentStageChanged = Object.prototype.hasOwnProperty.call(data, "currentStage");

        const nextStageState =
          stageContractChanged || currentStageChanged
            ? resolveTicketStageState({
                stageDefinitions: data.stageDefinitions ?? existingStageState.stageDefinitions,
                stageOrder:
                  Object.prototype.hasOwnProperty.call(data, "stageDefinitions")
                    ? undefined
                    : data.stageOrder ?? existingStageState.stageOrder,
                currentStage: data.currentStage ?? existing.currentStage,
              })
            : existingStageState;

        const patch: Record<string, unknown> = {
          ...data,
          updatedAt: new Date(),
        };

        if (stageContractChanged || existingStageState.stageDefinitions.length > 0) {
          patch.stageDefinitions = nextStageState.stageDefinitions;
          patch.stageOrder = nextStageState.stageOrder;
        }
        if (stageContractChanged || currentStageChanged) {
          patch.currentStage = nextStageState.currentStage;
        }

        const updated = await tx
          .update(tickets)
          .set(patch)
          .where(eq(tickets.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);
        if (!updated) return null;

        if ((stageContractChanged || currentStageChanged) && updated.status === "active") {
          const currentIndex = nextStageState.stageOrder.indexOf(nextStageState.currentStage);
          await ensureStageIssue({
            tx,
            companyId: updated.companyId,
            ticket: {
              id: updated.id,
              title: updated.title,
              description: updated.description ?? null,
              metadata: toNullableRecord(updated.metadata),
              instructions: updated.instructions ?? null,
              leadAgentId: updated.leadAgentId ?? null,
              createdByUserId: updated.createdByUserId ?? null,
            },
            stage: nextStageState.currentStage,
            stageDefinition: getTicketStageDefinition(nextStageState.stageDefinitions, nextStageState.currentStage),
            previousStageDefinition:
              currentIndex > 0
                ? getTicketStageDefinition(nextStageState.stageDefinitions, nextStageState.stageOrder[currentIndex - 1])
                : null,
          });
        }

        return updated;
      });
    },

    advanceStage: async (id: string) => {
      return db.transaction(async (tx) => {
        const ticket = await tx
          .select()
          .from(tickets)
          .where(eq(tickets.id, id))
          .then((rows) => rows[0] ?? null);
        if (!ticket) return null;

        const stageState = getTicketStageContract(ticket);
        const idx = stageState.stageOrder.indexOf(ticket.currentStage);
        const next = idx >= 0 && idx < stageState.stageOrder.length - 1 ? stageState.stageOrder[idx + 1] : ticket.currentStage;
        const done = next === ticket.currentStage;

        const updated = await tx
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

        if (!updated || done) return updated;

        await ensureStageIssue({
          tx,
          companyId: updated.companyId,
          ticket: {
            id: updated.id,
            title: updated.title,
            description: updated.description ?? null,
            metadata: toNullableRecord(updated.metadata),
            instructions: updated.instructions ?? null,
            leadAgentId: updated.leadAgentId ?? null,
            createdByUserId: updated.createdByUserId ?? null,
          },
          stage: next,
          stageDefinition: getTicketStageDefinition(stageState.stageDefinitions, next),
          previousStageDefinition: getTicketStageDefinition(stageState.stageDefinitions, ticket.currentStage),
        });

        return updated;
      });
    },

    remove: (id: string) =>
      db
        .delete(tickets)
        .where(eq(tickets.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    getIssues: (ticketId: string) =>
      db
        .select({
          id: issues.id,
          companyId: issues.companyId,
          ticketId: issues.ticketId,
          ticketStage: issues.ticketStage,
          projectId: issues.projectId,
          title: issues.title,
          description: issues.description,
          status: issues.status,
          priority: issues.priority,
          assigneeAgentId: issues.assigneeAgentId,
          assigneeUserId: issues.assigneeUserId,
          executionWorkspaceId: issues.executionWorkspaceId,
          issueNumber: issues.issueNumber,
          identifier: issues.identifier,
          requestDepth: issues.requestDepth,
          createdAt: issues.createdAt,
          updatedAt: issues.updatedAt,
          currentBranchName: executionWorkspaces.branchName,
          currentWorkspacePath: executionWorkspaces.cwd,
        })
        .from(issues)
        .leftJoin(executionWorkspaces, eq(executionWorkspaces.id, issues.executionWorkspaceId))
        .where(and(eq(issues.ticketId, ticketId), isNull(issues.hiddenAt)))
        .orderBy(desc(issues.updatedAt)),
  };
}
