import type { Agent } from "@paperclipai/shared";

export type GtmLifecycleVariant = "default" | "secondary" | "destructive" | "outline";

export function gtmAgentRunningNow(
  agent: Agent,
  liveAgentIds: Set<string>,
  isTrash: boolean,
): boolean {
  return !isTrash && (liveAgentIds.has(agent.id) || agent.status === "running");
}

/** List / table: running and live-queue agents first, then stable by name. */
export function sortGtmAgentsForListTable(
  agents: Agent[],
  liveAgentIds: Set<string>,
  isTrash: boolean,
): Agent[] {
  return [...agents].sort((a, b) => {
    const runA = gtmAgentRunningNow(a, liveAgentIds, isTrash);
    const runB = gtmAgentRunningNow(b, liveAgentIds, isTrash);
    if (runA !== runB) return runA ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  });
}

export function gtmAgentLifecycleMeta(
  agent: Agent,
  options: { liveAgentIds: Set<string>; isTrash: boolean },
): { label: string; variant: GtmLifecycleVariant; runningNow: boolean } {
  const runningNow = gtmAgentRunningNow(agent, options.liveAgentIds, options.isTrash);
  if (agent.status === "error") return { label: "Error", variant: "destructive", runningNow };
  if (agent.status === "paused") return { label: "Paused", variant: "secondary", runningNow };
  if (options.isTrash || agent.status === "terminated") {
    return { label: "Terminated", variant: "outline", runningNow };
  }
  if (runningNow) return { label: "Running", variant: "default", runningNow };
  if (agent.status === "idle" || agent.status === "active") return { label: "Idle", variant: "outline", runningNow };
  return { label: agent.status, variant: "outline", runningNow };
}

/** Kanban column key for cosmetic grouping */
export type GtmAgentKanbanColumn = "running" | "idle" | "paused" | "error" | "other";

export function gtmAgentKanbanColumn(
  agent: Agent,
  liveAgentIds: Set<string>,
  isTrash: boolean,
): GtmAgentKanbanColumn {
  if (isTrash || agent.status === "terminated") return "other";
  if (agent.status === "error") return "error";
  if (agent.status === "paused") return "paused";
  if (gtmAgentRunningNow(agent, liveAgentIds, isTrash)) return "running";
  if (agent.status === "idle" || agent.status === "active") return "idle";
  return "other";
}
