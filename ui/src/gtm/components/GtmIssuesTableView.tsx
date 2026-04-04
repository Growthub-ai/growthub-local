import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { ClientPaginationFooter } from "@/components/ClientPaginationFooter";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useMemo } from "react";

export function GtmIssuesTableView({
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
      <div className="max-h-[min(70vh,56rem)] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="h-11 px-4 align-middle font-medium">Issue</th>
              <th className="h-11 px-4 align-middle font-medium">Id</th>
              <th className="h-11 px-4 align-middle font-medium">Status</th>
              <th className="h-11 px-4 align-middle font-medium">Priority</th>
              <th className="h-11 px-4 align-middle font-medium">Activity</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((issue) => {
              const live = liveIssueIds.has(issue.id);
              const idLabel = issue.identifier ?? issue.id.slice(0, 8);
              return (
                <tr key={issue.id} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 align-middle font-medium">
                    <Link to={issueHref(issue)} className="line-clamp-2 hover:underline">
                      {issue.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle font-mono text-xs text-muted-foreground">{idLabel}</td>
                  <td className="px-4 py-3 align-middle">
                    <Badge variant="secondary" className="text-xs font-normal">
                      {issue.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Badge variant="outline" className="text-xs">
                      {issue.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {live ? (
                      <Badge variant="default" className="gap-1.5 text-xs">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary-foreground/70 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        </span>
                        Live
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
