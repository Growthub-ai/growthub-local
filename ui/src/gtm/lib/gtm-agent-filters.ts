import type { Agent, Issue } from "@paperclipai/shared";
import {
  agentHasBlockedAssignedIssue,
  agentHasOpenAssignedIssues,
  shouldIncludeAgentInGtmDirectoryList,
} from "@paperclipai/shared";

export type GtmAgentsFilterTab = "all" | "active" | "paused" | "error";

export type GtmAgentsListSegment = GtmAgentsFilterTab | "new" | "trash";

/**
 * Same rule set as GET /gtm/companies/:id/agents: drops DX agents (`dxKind`, DX surface)
 * so GTM UI cannot display them even if the API response regresses.
 */
export function filterAgentsForGtmDirectoryUi<T extends { metadata: unknown }>(agents: T[]): T[] {
  return agents.filter((a) => shouldIncludeAgentInGtmDirectoryList(a));
}

export function parseGtmAgentsListSegment(pathname: string): GtmAgentsListSegment | null {
  const m = pathname.match(/\/agents\/(all|active|paused|error|new|trash)(?:\/|$|\?|#)/);
  const s = m?.[1];
  if (s === "all" || s === "active" || s === "paused" || s === "error" || s === "new" || s === "trash") return s;
  return null;
}

export function gtmAgentsPathToFilterTab(segment: GtmAgentsListSegment | null): GtmAgentsFilterTab {
  if (segment === "active" || segment === "paused" || segment === "error") return segment;
  return "all";
}

function statusMatchesLegacyActive(status: string): boolean {
  return status === "active" || status === "running" || status === "idle";
}

/**
 * Live run = heartbeat run queued or running for this agent (from company run list).
 */
export function buildGtmLiveAgentIdSet(
  runs: Array<{ agentId: string; status: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.status === "running" || run.status === "queued") {
      ids.add(run.agentId);
    }
  }
  return ids;
}

export function filterGtmAgentsByTab(
  agents: Agent[],
  tab: GtmAgentsFilterTab,
  issues: Pick<Issue, "assigneeAgentId" | "status">[],
  liveAgentIds: Set<string>,
): Agent[] {
  return agents.filter((agent) => {
    const status = agent.status;
    const openWork = agentHasOpenAssignedIssues(agent.id, issues);
    const blockedIssue = agentHasBlockedAssignedIssue(agent.id, issues);
    const isLive = liveAgentIds.has(agent.id);
    const runningLike = status === "running" || isLive;

    if (tab === "all") return true;

    if (tab === "active") {
      if (status === "terminated" || status === "pending_approval") return false;
      if (status === "paused" || status === "error") return false;
      if (runningLike || openWork) return true;
      return statusMatchesLegacyActive(status);
    }

    if (tab === "paused") {
      return status === "paused";
    }

    if (tab === "error") {
      return status === "error" || blockedIssue;
    }

    return true;
  });
}
