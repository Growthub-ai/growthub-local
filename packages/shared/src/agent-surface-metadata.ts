import type { Issue } from "./types/issue.js";
import type { IssueStatus } from "./constants.js";

/** Open work: assigned to agent and not terminal. */
export const GTM_AGENT_OPEN_ISSUE_STATUSES: readonly IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
];

export function readAgentMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

/** True when metadata marks this agent as DX-owned (exclude from GTM directory). */
export function metadataHasDxKind(metadata: unknown): boolean {
  const m = readAgentMetadataRecord(metadata);
  if (!m) return false;
  const v = m.dxKind;
  if (v === true) return true;
  if (typeof v === "string" && v.trim().length > 0) return true;
  return false;
}

function metadataFieldIsDx(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "dx";
}

/** True when metadata marks this row as DX product/surface. */
export function metadataIsDxSurface(metadata: unknown): boolean {
  const m = readAgentMetadataRecord(metadata);
  if (!m) return false;
  return metadataFieldIsDx(m.product) || metadataFieldIsDx(m.surfaceProfile);
}

/** True when metadata marks this agent as GTM-owned (exclude from DX agent list). */
export function metadataHasGtmKind(metadata: unknown): boolean {
  const m = readAgentMetadataRecord(metadata);
  if (!m) return false;
  const v = m.gtmKind;
  return typeof v === "string" && v.length > 0;
}

export function metadataIsGtmSurface(metadata: unknown): boolean {
  const m = readAgentMetadataRecord(metadata);
  if (!m) return false;
  return m.product === "gtm" || m.surfaceProfile === "gtm";
}

/**
 * GTM Agents page / gtm list: include legacy empty metadata, GTM-tagged agents,
 * and omit DX-tagged agents (`dxKind`, product/surface `dx`) so DX inventory never
 * mixes into GTM — including terminated rows on the removed-agents view.
 */
export function shouldIncludeAgentInGtmDirectoryList(agent: { metadata: unknown }): boolean {
  if (metadataHasDxKind(agent.metadata) || metadataIsDxSurface(agent.metadata)) {
    return false;
  }
  const m = readAgentMetadataRecord(agent.metadata);
  if (!m || Object.keys(m).length === 0) {
    return true;
  }
  if (metadataIsGtmSurface(agent.metadata)) {
    return true;
  }
  if (!m.product && !m.surfaceProfile) {
    return true;
  }
  return false;
}

/**
 * DX Agents list: hide GTM workspace/browser SDR agents and anything stamped gtmKind.
 */
export function shouldIncludeAgentInDxAgentList(agent: { metadata: unknown }): boolean {
  if (metadataHasGtmKind(agent.metadata) || metadataIsGtmSurface(agent.metadata)) {
    return false;
  }
  return true;
}

export function agentHasOpenAssignedIssues(agentId: string, issues: Pick<Issue, "assigneeAgentId" | "status">[]): boolean {
  return issues.some(
    (issue) =>
      issue.assigneeAgentId === agentId
      && (GTM_AGENT_OPEN_ISSUE_STATUSES as readonly string[]).includes(issue.status),
  );
}

export function agentHasBlockedAssignedIssue(agentId: string, issues: Pick<Issue, "assigneeAgentId" | "status">[]): boolean {
  return issues.some((issue) => issue.assigneeAgentId === agentId && issue.status === "blocked");
}
