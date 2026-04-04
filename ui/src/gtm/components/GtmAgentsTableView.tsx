import { Link } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { AdapterBrandMark } from "@/components/AdapterBrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientPaginationFooter } from "@/components/ClientPaginationFooter";
import { useClientPagination } from "@/hooks/useClientPagination";
import { agentRouteRef, cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { gtmAgentLifecycleMeta, sortGtmAgentsForListTable } from "@/gtm/lib/gtm-agent-lifecycle-ui";
import type { GtmAgentAction } from "./GtmAgentsListView";
import { useMemo } from "react";

export function GtmAgentsTableView({
  agents,
  isTrash,
  liveAgentIds,
  boardPath,
  onAgentAction,
}: {
  agents: Agent[];
  isTrash: boolean;
  liveAgentIds: Set<string>;
  boardPath: (path: string) => string;
  onAgentAction: (payload: GtmAgentAction) => void;
}) {
  const sortedAgents = useMemo(
    () => sortGtmAgentsForListTable(agents, liveAgentIds, isTrash),
    [agents, liveAgentIds, isTrash],
  );
  const resetKey = useMemo(
    () => [...agents].map((a) => a.id).sort().join(","),
    [agents],
  );
  const { pageSize, setPageSize, page, setPage, pageCount, slice, total, startIdx, endIdx } = useClientPagination(
    sortedAgents,
    resetKey,
  );

  return (
    <div className="flex flex-col">
      <div className="max-h-[min(70vh,56rem)] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="h-11 px-4 align-middle font-medium">Name</th>
              <th className="h-11 px-4 align-middle font-medium">Title / role</th>
              <th className="h-11 px-4 align-middle font-medium">Model</th>
              <th className="h-11 px-4 align-middle font-medium">Status</th>
              {!isTrash ? <th className="h-11 px-4 align-middle font-medium text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {slice.map((agent) => {
              const meta = gtmAgentLifecycleMeta(agent, { liveAgentIds, isTrash });
              return (
                <tr
                  key={agent.id}
                  className="border-b border-border transition-[background-color,opacity,transform] duration-200 ease-out hover:bg-muted/30"
                >
                  <td className="px-4 py-3 align-middle font-medium">
                    <Link to={boardPath(`/agents/${agentRouteRef(agent)}/dashboard`)} className="hover:underline">
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle text-muted-foreground">{agent.title ?? agent.role}</td>
                  <td className="px-4 py-3 align-middle">
                    <AdapterBrandMark adapterType={agent.adapterType} />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Badge variant={meta.variant} className={cn("text-xs", meta.runningNow ? "gap-1.5" : undefined)}>
                      {meta.runningNow ? (
                        <>
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary-foreground/70 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                          </span>
                          Running
                        </>
                      ) : (
                        meta.label
                      )}
                    </Badge>
                  </td>
                  {!isTrash ? (
                    <td className="px-4 py-3 align-middle text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button size="icon-sm" variant="outline" asChild aria-label={`Settings ${agent.name}`}>
                          <Link to={boardPath(`/agents/${agentRouteRef(agent)}/configuration`)}>
                            <Settings className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAgentAction({ action: "invoke", agentId: agent.id })}>
                          Run
                        </Button>
                        {agent.status === "paused" ? (
                          <Button size="sm" variant="outline" onClick={() => onAgentAction({ action: "resume", agentId: agent.id })}>
                            Resume
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={agent.status === "terminated"}
                            onClick={() => onAgentAction({ action: "pause", agentId: agent.id })}
                          >
                            Pause
                          </Button>
                        )}
                      </div>
                    </td>
                  ) : null}
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
