import { Link } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { AdapterBrandMark } from "@/components/AdapterBrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientPaginationFooter } from "@/components/ClientPaginationFooter";
import { useClientPagination } from "@/hooks/useClientPagination";
import { agentRouteRef } from "@/lib/utils";
import { Settings } from "lucide-react";
import { gtmAgentLifecycleMeta, sortGtmAgentsForListTable } from "@/gtm/lib/gtm-agent-lifecycle-ui";
import { useMemo } from "react";

export type GtmAgentAction = { action: "invoke" | "pause" | "resume" | "restore"; agentId: string };

export function GtmAgentsListView({
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
      <div className="max-h-[min(70vh,56rem)] overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {slice.map((agent) => {
            const meta = gtmAgentLifecycleMeta(agent, { liveAgentIds, isTrash });
            return (
              <div
                key={agent.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm transition-[opacity,box-shadow,transform] duration-200 ease-out"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <Link
                      to={boardPath(`/agents/${agentRouteRef(agent)}/dashboard`)}
                      className="truncate font-medium hover:underline"
                    >
                      {agent.name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">{agent.title ?? agent.role}</p>
                    {typeof (agent.adapterConfig as Record<string, unknown> | null)?.browserSlot === "string" ? (
                      <p className="truncate text-xs text-muted-foreground">
                        Slot {String((agent.adapterConfig as Record<string, unknown>).browserSlot)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdapterBrandMark adapterType={agent.adapterType} />
                    <Badge variant={meta.variant} className={meta.runningNow ? "gap-1.5" : undefined}>
                      {meta.runningNow ? (
                        <>
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary-foreground/70 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
                          </span>
                          Running
                        </>
                      ) : (
                        meta.label
                      )}
                    </Badge>
                    {!isTrash ? (
                      <>
                        <Button size="icon-sm" variant="outline" asChild aria-label={`Open settings for ${agent.name}`}>
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
                      </>
                    ) : agent.status === "terminated" ? (
                      <Button size="sm" variant="default" onClick={() => onAgentAction({ action: "restore", agentId: agent.id })}>
                        Restore
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
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
