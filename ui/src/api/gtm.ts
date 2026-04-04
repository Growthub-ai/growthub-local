import type { Agent, HeartbeatRun, Issue, Ticket, GtmViewModel } from "@paperclipai/shared";
import { api } from "./client";

export type GtmInboxEntry = {
  id: string;
  kind: "issue" | "ticket" | "run";
  title: string;
  subtitle: string;
  updatedAt: string;
  issueId?: string | null;
  agentId?: string | null;
};

export type GtmWorkspaceConfig = {
  defaults: {
    name: string;
    title: string;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
  };
  existingAgent: Agent | null;
  environmentTest: {
    adapterType: string;
    status: "pass" | "warn" | "fail";
    checks: Array<{
      code: string;
      level: "info" | "warn" | "error";
      message: string;
      detail?: string | null;
      hint?: string | null;
    }>;
    testedAt: string;
  } | null;
};

export type GtmConnectionStatus = {
  baseUrl: string;
  callbackUrl: string;
  connected: boolean;
  portalBaseUrl: string;
  machineLabel: string;
  workspaceLabel: string;
};

export type GtmCampaignDraft = {
  title: string;
  description: string;
  instructions: string;
  targetAudience: string;
  offer: string;
  successDefinition: string;
  leadAgentId: string | null;
};

export const gtmApi = {
  getProfile: () => api.get<GtmViewModel["profile"]>("/gtm/profile"),
  getKnowledge: () => api.get<GtmViewModel["knowledge"]>("/gtm/knowledge"),
  getConnectors: () => api.get<GtmViewModel["connectors"]>("/gtm/connectors"),
  getConnection: () => api.get<GtmConnectionStatus>("/gtm/connection"),
  saveConnectionConfig: (body: { baseUrl: string }) =>
    api.post<GtmConnectionStatus>("/gtm/connection/config", body),
  testConnection: () =>
    api.post<{ success: true; message: string; knowledgeItemId: string | null }>("/gtm/connection/test", {}),
  disconnectConnection: () =>
    api.post<GtmConnectionStatus>("/gtm/connection/disconnect", {}),
  getWorkflow: () => api.get<GtmViewModel["workflow"]>("/gtm/workflow"),
  launchWorkflow: () => api.post<GtmViewModel["workflow"]>("/gtm/workflow/run", {}),
  listAgents: (companyId: string, scope: "default" | "trash" = "default") =>
    api.get<Agent[]>(
      `/gtm/companies/${companyId}/agents${scope === "trash" ? "?scope=trash" : ""}`,
    ),
  createAgent: (companyId: string, body: Record<string, unknown>) =>
    api.post<Agent>(`/gtm/companies/${companyId}/agents`, body),
  invokeAgent: (agentId: string, companyId: string) =>
    api.post(`/gtm/agents/${agentId}/invoke?companyId=${encodeURIComponent(companyId)}`, {}),
  pauseAgent: (agentId: string, companyId: string) =>
    api.post<Agent>(`/gtm/agents/${agentId}/pause?companyId=${encodeURIComponent(companyId)}`, {}),
  resumeAgent: (agentId: string, companyId: string) =>
    api.post<Agent>(`/gtm/agents/${agentId}/resume?companyId=${encodeURIComponent(companyId)}`, {}),
  listTickets: (companyId: string) => api.get<Ticket[]>(`/gtm/companies/${companyId}/tickets`),
  createTicket: (companyId: string, body: Record<string, unknown>) =>
    api.post<Ticket>(`/gtm/companies/${companyId}/tickets`, body),
  createCampaignDraft: (
    companyId: string,
    body: {
      draftProfile: string;
      prompt: string;
      extendExisting: boolean;
    },
  ) => api.post<GtmCampaignDraft>(`/gtm/companies/${companyId}/campaign-drafts`, body),
  listIssues: (companyId: string) => api.get<Issue[]>(`/gtm/companies/${companyId}/issues`),
  listHiddenIssues: (companyId: string) =>
    api.get<Issue[]>(`/gtm/companies/${companyId}/issues/hidden`),
  createIssue: (companyId: string, body: Record<string, unknown>) =>
    api.post<Issue>(`/gtm/companies/${companyId}/issues`, body),
  listInbox: (companyId: string) => api.get<GtmInboxEntry[]>(`/gtm/companies/${companyId}/inbox`),
  listRuns: (companyId: string) => api.get<HeartbeatRun[]>(`/gtm/companies/${companyId}/runs`),
  enforceHeartbeat: (companyId: string, ticketId: string) =>
    api.post<{ campaignId: string; issuesCreated: number; errors: string[] }>(
      `/gtm/companies/${companyId}/campaigns/${ticketId}/heartbeat`,
      {},
    ),
  triggerPerformanceReview: (companyId: string, ticketId: string) =>
    api.post<{ campaignId: string; reviewIssueId: string | null; agentsReviewed: number; error: string | null }>(
      `/gtm/companies/${companyId}/campaigns/${ticketId}/performance-review`,
      {},
    ),
  getWorkspaceConfig: (companyId: string) =>
    api.get<GtmWorkspaceConfig>(`/gtm/companies/${companyId}/workspace-config`),
  upsertWorkspaceClaudeBrowser: (companyId: string, body: Record<string, unknown>) =>
    api.post<{ agent: Agent; environmentTest: GtmWorkspaceConfig["environmentTest"] }>(
      `/gtm/companies/${companyId}/workspace-config/claude-browser`,
      body,
    ),

  // Knowledge Base — database explorer
  listKnowledgeTables: () =>
    api.get<{ tables: Array<{ name: string; columnCount: number }> }>("/gtm/knowledge-base/tables"),
  getKnowledgeTable: (name: string, opts?: { limit?: number; offset?: number }) =>
    api.get<KnowledgeTableResult>(
      `/gtm/knowledge-base/tables/${encodeURIComponent(name)}${
        opts ? `?limit=${opts.limit ?? 50}&offset=${opts.offset ?? 0}` : ""
      }`,
    ),
  executeKnowledgeQuery: (query: string) =>
    api.post<KnowledgeQueryResult>("/gtm/knowledge-base/query", { query }),
};

// Knowledge Base types
export type KnowledgeTableColumn = {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
};

export type KnowledgeTableResult = {
  table: string;
  columns: KnowledgeTableColumn[];
  rows: Record<string, unknown>[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type KnowledgeQueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
};
