import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GTM_ISSUE_KANBAN_COLUMNS,
  gtmIssueKanbanColumn,
  type GtmIssueKanbanColumn as GtmIssueKanbanColumnKey,
} from "@/gtm/lib/gtm-issue-kanban";

/** Fixed column body height: more cards visible above the fold; overflow scrolls inside the column. */
const KANBAN_COLUMN_BODY_HEIGHT = "h-[min(76vh,38rem)]";

function IssueKanbanCard({
  issue,
  issueHref,
  live,
}: {
  issue: Issue;
  issueHref: (issue: Issue) => string;
  live: boolean;
}) {
  const idLabel = issue.identifier ?? issue.id.slice(0, 8);
  return (
    <div className="shrink-0 rounded-md border border-border bg-card p-3 shadow-sm">
      <Link to={issueHref(issue)} className="line-clamp-2 block text-sm font-medium leading-snug hover:underline">
        {issue.title}
      </Link>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{idLabel}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px]">
          {issue.priority}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {issue.status.replaceAll("_", " ")}
        </Badge>
        {live ? (
          <Badge variant="default" className="gap-1 text-[10px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary-foreground/70 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground" />
            </span>
            Live
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function GtmIssuesKanbanColumnBody({
  colKey,
  colTitle,
  list,
  issueHref,
  liveIssueIds,
}: {
  colKey: GtmIssueKanbanColumnKey;
  colTitle: string;
  list: Issue[];
  issueHref: (issue: Issue) => string;
  liveIssueIds: Set<string>;
}) {
  return (
    <div className="flex min-h-0 min-w-[220px] max-w-[320px] flex-1 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{colTitle}</span>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {list.length}
        </Badge>
      </div>

      {list.length === 0 ? (
        <div
          className={cn(
            "flex flex-col justify-center rounded-lg border border-border bg-muted/20 p-2",
            KANBAN_COLUMN_BODY_HEIGHT,
            "min-h-[120px]",
          )}
        >
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No issues</p>
        </div>
      ) : (
        <div
          id={`kanban-col-${colKey}`}
          role="region"
          aria-label={`${colTitle} column, ${list.length} issues`}
          className={cn(
            "scrollbar-kanban-column flex flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-lg border border-border bg-muted/20 p-2",
            KANBAN_COLUMN_BODY_HEIGHT,
          )}
        >
          {list.map((issue) => (
            <IssueKanbanCard
              key={issue.id}
              issue={issue}
              issueHref={issueHref}
              live={liveIssueIds.has(issue.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GtmIssuesKanbanView({
  issues,
  issueHref,
  liveIssueIds,
}: {
  issues: Issue[];
  issueHref: (issue: Issue) => string;
  liveIssueIds: Set<string>;
}) {
  const byColumn = new Map<string, Issue[]>();
  for (const col of GTM_ISSUE_KANBAN_COLUMNS) {
    byColumn.set(col.key, []);
  }
  for (const issue of issues) {
    const k = gtmIssueKanbanColumn(issue.status);
    byColumn.get(k)!.push(issue);
  }

  return (
    <div className="flex min-h-0 items-stretch gap-3 overflow-x-auto px-2 pb-2 pt-2">
      {GTM_ISSUE_KANBAN_COLUMNS.map((col) => {
        const list = byColumn.get(col.key) ?? [];
        return (
          <GtmIssuesKanbanColumnBody
            key={col.key}
            colKey={col.key}
            colTitle={col.title}
            list={list}
            issueHref={issueHref}
            liveIssueIds={liveIssueIds}
          />
        );
      })}
    </div>
  );
}
