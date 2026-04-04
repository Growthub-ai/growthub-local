import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { issuesApi } from "@/api/issues";
import { gtmApi } from "@/api/gtm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";

export function GtmInboxHiddenIssuesSheet({
  companyId,
  boardPath,
  queryKeyHidden,
  queryKeyIssues,
}: {
  companyId: string;
  boardPath: (path: string) => string;
  queryKeyHidden: readonly unknown[];
  queryKeyIssues: readonly unknown[];
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const hiddenQuery = useQuery({
    queryKey: queryKeyHidden,
    queryFn: () => gtmApi.listHiddenIssues(companyId),
    enabled: !!companyId,
    staleTime: 20_000,
  });

  const unhideMutation = useMutation({
    mutationFn: (issueId: string) => issuesApi.update(issueId, { hiddenAt: null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeyHidden] }),
        queryClient.invalidateQueries({ queryKey: [...queryKeyIssues] }),
      ]);
    },
  });

  const list = hiddenQuery.data ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Hidden issues"
          aria-label="Hidden issues — restore items you archived from the inbox"
        >
          <Archive className="h-4 w-4" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="text-base">Hidden issues</SheetTitle>
          <SheetDescription>
            Issues you hid from the board appear here. Restore any item to show it in the inbox again.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            {hiddenQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hidden issues. Use “Hide this Issue” on an issue to move it here.</p>
            ) : (
              <ul className="space-y-3">
                {list.map((issue) => (
                  <HiddenIssueRow
                    key={issue.id}
                    issue={issue}
                    boardPath={boardPath}
                    unhidePending={unhideMutation.isPending}
                    onUnhide={() => unhideMutation.mutate(issue.id)}
                    onNavigateIssue={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function HiddenIssueRow({
  issue,
  boardPath,
  unhidePending,
  onUnhide,
  onNavigateIssue,
}: {
  issue: Issue;
  boardPath: (path: string) => string;
  unhidePending: boolean;
  onUnhide: () => void;
  onNavigateIssue: () => void;
}) {
  const idLabel = issue.identifier ?? issue.id.slice(0, 8);
  const hidden =
    issue.hiddenAt instanceof Date ? issue.hiddenAt : issue.hiddenAt ? new Date(issue.hiddenAt) : null;
  const hiddenLabel = hidden
    ? hidden.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={boardPath(`/issues/${issue.id}`)}
            className="line-clamp-2 text-sm font-medium hover:underline"
            onClick={onNavigateIssue}
          >
            {issue.title}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{idLabel}</span>
            <span>·</span>
            <span>Hidden {hiddenLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {issue.status.replaceAll("_", " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {issue.priority}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          disabled={unhidePending}
          onClick={onUnhide}
        >
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
          Unhide
        </Button>
      </div>
    </li>
  );
}
