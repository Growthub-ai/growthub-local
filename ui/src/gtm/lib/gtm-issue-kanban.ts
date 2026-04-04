import type { IssueStatus } from "@paperclipai/shared";

/** Issue board columns for GTM inbox (status-derived, issue-agnostic). */
export type GtmIssueKanbanColumn = "todo" | "active" | "review" | "blocked" | "done";

export function gtmIssueKanbanColumn(status: IssueStatus): GtmIssueKanbanColumn {
  if (status === "backlog" || status === "todo") return "todo";
  if (status === "in_progress") return "active";
  if (status === "in_review") return "review";
  if (status === "blocked") return "blocked";
  if (status === "done" || status === "cancelled") return "done";
  return "todo";
}

export const GTM_ISSUE_KANBAN_COLUMNS: { key: GtmIssueKanbanColumn; title: string }[] = [
  { key: "todo", title: "Todo" },
  { key: "active", title: "In progress" },
  { key: "review", title: "Review" },
  { key: "blocked", title: "Blocked" },
  { key: "done", title: "Done" },
];
