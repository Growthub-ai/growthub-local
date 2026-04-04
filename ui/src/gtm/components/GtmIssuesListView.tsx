import type { Issue } from "@paperclipai/shared";
import { IssueRow } from "@/components/IssueRow";
import { PriorityIcon } from "@/components/PriorityIcon";
import { StatusIcon } from "@/components/StatusIcon";
import { ClientPaginationFooter } from "@/components/ClientPaginationFooter";
import { useClientPagination } from "@/hooks/useClientPagination";
import { timeAgo } from "@/lib/timeAgo";
import { useMemo } from "react";

export function GtmIssuesListView({
  issues,
  issueHref,
  liveIssueIds,
}: {
  issues: Issue[];
  issueHref: (issue: Issue) => string;
  liveIssueIds: Set<string>;
}) {
  const resetKey = useMemo(() => issues.map((i) => i.id).join(","), [issues]);
  const { pageSize, setPageSize, page, setPage, pageCount, slice, total, startIdx, endIdx } = useClientPagination(
    issues,
    resetKey,
    { defaultPageSize: 25 },
  );

  return (
    <div className="flex flex-col">
      <div className="max-h-[min(70vh,56rem)] overflow-y-auto">
        <div className="divide-y divide-border">
          {slice.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              to={issueHref(issue)}
              desktopMetaLeading={(
                <>
                  <span className="hidden sm:inline-flex">
                    <PriorityIcon priority={issue.priority} />
                  </span>
                  <span className="hidden shrink-0 sm:inline-flex">
                    <StatusIcon status={issue.status} />
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  {liveIssueIds.has(issue.id) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 sm:gap-1.5 sm:px-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                      </span>
                      <span className="hidden text-[11px] font-medium text-blue-600 dark:text-blue-400 sm:inline">
                        Live
                      </span>
                    </span>
                  ) : null}
                </>
              )}
              mobileMeta={`updated ${timeAgo(issue.updatedAt)}`}
              trailingMeta={`updated ${timeAgo(issue.updatedAt)}`}
            />
          ))}
        </div>
      </div>
      <ClientPaginationFooter
        total={total}
        startIdx={startIdx}
        endIdx={endIdx}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
      />
    </div>
  );
}
