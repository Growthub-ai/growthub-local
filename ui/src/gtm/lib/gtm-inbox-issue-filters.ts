import type { Issue, IssueStatus } from "@paperclipai/shared";

export type GtmInboxIssueDatePreset = "all" | "today" | "3d" | "7d" | "30d" | "90d" | "custom";

export type GtmInboxIssueStatusFilter = "all" | IssueStatus;

export type GtmInboxIssueAssigneeFilter =
  | "all"
  | "unassigned"
  | "user_assigned"
  | `agent:${string}`;

/** Resolve inbox `assignee` query param to filter value (supports `agent:<uuid>` or bare UUID). */
export function parseGtmInboxAssigneeSearchParam(raw: string | null | undefined): GtmInboxIssueAssigneeFilter | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t === "all" || t === "unassigned" || t === "user_assigned") return t;
  if (t.startsWith("agent:")) {
    const id = t.slice("agent:".length).trim();
    if (id.length > 0) return `agent:${id}`;
    return null;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return `agent:${t}`;
  }
  return null;
}

function issueUpdatedTime(issue: Issue): number {
  const raw = issue.updatedAt;
  const d = raw instanceof Date ? raw : new Date(raw);
  return d.getTime();
}

export function filterIssuesBySearch(issues: Issue[], query: string): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;
  return issues.filter((issue) => {
    const id = (issue.identifier ?? issue.id).toLowerCase();
    return issue.title.toLowerCase().includes(q) || id.includes(q);
  });
}

/** Inclusive start, inclusive end of calendar day (local). */
export function filterIssuesByUpdatedRange(
  issues: Issue[],
  fromMs: number | null,
  toMs: number | null,
): Issue[] {
  if (fromMs == null && toMs == null) return issues;
  return issues.filter((issue) => {
    const t = issueUpdatedTime(issue);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    return true;
  });
}

export function filterIssuesByStatus(issues: Issue[], filter: GtmInboxIssueStatusFilter): Issue[] {
  if (filter === "all") return issues;
  return issues.filter((i) => i.status === filter);
}

export function filterIssuesByAssignee(issues: Issue[], filter: GtmInboxIssueAssigneeFilter): Issue[] {
  if (filter === "all") return issues;
  if (filter === "unassigned") {
    return issues.filter((i) => !i.assigneeAgentId && !i.assigneeUserId);
  }
  if (filter === "user_assigned") {
    return issues.filter((i) => Boolean(i.assigneeUserId));
  }
  if (filter.startsWith("agent:")) {
    const id = filter.slice("agent:".length);
    return issues.filter((i) => i.assigneeAgentId === id);
  }
  return issues;
}

/** End of local day for `d` (23:59:59.999). */
export function endOfLocalDay(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return x;
}

/** Start of local day. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function parseYmdInput(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

export function inboxIssueDateBounds(
  preset: GtmInboxIssueDatePreset,
  customFrom: string,
  customTo: string,
): { fromMs: number | null; toMs: number | null } {
  if (preset === "all") return { fromMs: null, toMs: null };
  if (preset === "today") {
    const now = new Date();
    return { fromMs: startOfLocalDay(now).getTime(), toMs: endOfLocalDay(now).getTime() };
  }
  if (preset === "3d" || preset === "7d" || preset === "30d" || preset === "90d") {
    const days = preset === "3d" ? 3 : preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days, 0, 0, 0, 0);
    return { fromMs: d.getTime(), toMs: null };
  }
  const a = parseYmdInput(customFrom);
  const b = parseYmdInput(customTo);
  return {
    fromMs: a ? startOfLocalDay(a).getTime() : null,
    toMs: b ? endOfLocalDay(b).getTime() : null,
  };
}
