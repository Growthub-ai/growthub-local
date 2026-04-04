import { Link } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { AdapterBrandMark } from "@/components/AdapterBrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { agentRouteRef, cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import {
  gtmAgentKanbanColumn,
  gtmAgentLifecycleMeta,
  type GtmAgentKanbanColumn as KanbanCol,
} from "@/gtm/lib/gtm-agent-lifecycle-ui";
import type { GtmAgentAction } from "./GtmAgentsListView";

/** Match issues Kanban: fixed column body, internal vertical scroll for many cards. */
const KANBAN_COLUMN_BODY_HEIGHT = "h-[min(76vh,38rem)]";

const COLUMNS: { key: KanbanCol; title: string }[] = [
  { key: "running", title: "Running" },
  { key: "idle", title: "Idle" },
  { key: "paused", title: "Paused" },
  { key: "error", title: "Error" },
  { key: "other", title: "Other" },
];

export function GtmAgentsKanbanView({
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
  const byColumn = new Map<KanbanCol, Agent[]>();
  for (const col of COLUMNS) {
    byColumn.set(col.key, []);
  }
  for (const agent of agents) {
    const k = gtmAgentKanbanColumn(agent, liveAgentIds, isTrash);
    byColumn.get(k)!.push(agent);
  }

  const visibleColumns = isTrash
    ? COLUMNS.filter((c) => c.key === "other")
    : COLUMNS.filter((c) => c.key !== "other" || (byColumn.get("other")?.length ?? 0) > 0);

  return (
    <div className="flex min-h-0 items-stretch gap-3 overflow-x-auto pb-2 px-2 pt-2">
      {visibleColumns.map((col) => {
        const list = byColumn.get(col.key) ?? [];
        const colTitle = isTrash && col.key === "other" ? "Terminated" : col.title;

        return (
          <div key={col.key} className="flex min-h-0 min-w-[220px] max-w-[320px] flex-1 shrink-0 flex-col">
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
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">No agents</p>
              </div>
            ) : (
              <div
                role="region"
                aria-label={`${colTitle} column, ${list.length} agents`}
                className={cn(
                  "scrollbar-kanban-column flex flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-lg border border-border bg-muted/20 p-2",
                  KANBAN_COLUMN_BODY_HEIGHT,
                )}
              >
                {list.map((agent) => {
                  const meta = gtmAgentLifecycleMeta(agent, { liveAgentIds, isTrash });
                  return (
                    <div
                      key={agent.id}
                      className="shrink-0 rounded-md border border-border bg-card p-3 shadow-sm"
                    >
                      <Link
                        to={boardPath(`/agents/${agentRouteRef(agent)}/dashboard`)}
                        className="line-clamp-2 block text-sm font-medium hover:underline"
                      >
                        {agent.name}
                      </Link>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{agent.title ?? agent.role}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <AdapterBrandMark adapterType={agent.adapterType} size="icon-sm" />
                        <Badge variant={meta.variant} className={cn("text-[10px]", meta.runningNow ? "gap-1" : undefined)}>
                          {meta.runningNow ? "Running" : meta.label}
                        </Badge>
                      </div>
                      {!isTrash ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="icon-sm" variant="outline" className="h-7 w-7" asChild>
                            <Link to={boardPath(`/agents/${agentRouteRef(agent)}/configuration`)}>
                              <Settings className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAgentAction({ action: "invoke", agentId: agent.id })}>
                            Run
                          </Button>
                          {agent.status === "paused" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => onAgentAction({ action: "resume", agentId: agent.id })}
                            >
                              Resume
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={agent.status === "terminated"}
                              onClick={() => onAgentAction({ action: "pause", agentId: agent.id })}
                            >
                              Pause
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
