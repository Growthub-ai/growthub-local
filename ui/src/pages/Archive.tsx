import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Issue } from "@paperclipai/shared";

export function ArchivePage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: issues = [], isLoading } = useQuery({
    queryKey: queryKeys.issues.archived(selectedCompanyId!),
    queryFn: () => issuesApi.listArchived(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) => issuesApi.bulkRestore(selectedCompanyId!, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.archived(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      setSelected(new Set());
    },
  });

  function toggleAll() {
    if (selected.size === issues.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(issues.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = [...selected];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Archive</h1>
          {issues.length > 0 && (
            <span className="text-xs text-muted-foreground">({issues.length})</span>
          )}
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => restoreMutation.mutate(selectedIds)}
              disabled={restoreMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restore
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Loading...</div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Archive className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No archived issues</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-4 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === issues.length && issues.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issue</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Archived</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {issues.map((issue: Issue) => (
                <tr
                  key={issue.id}
                  className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(issue.id)}
                      onChange={() => toggleOne(issue.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        to={`/${selectedCompany?.issuePrefix}/issues/${issue.id}`}
                        className="font-medium text-foreground hover:underline truncate max-w-lg"
                      >
                        {issue.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{issue.identifier}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground capitalize">
                      {issue.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {issue.hiddenAt
                      ? new Date(issue.hiddenAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restoreMutation.mutate([issue.id])}
                      disabled={restoreMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
