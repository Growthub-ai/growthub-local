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
  listAgents: (companyId: string) => api.get<Agent[]>(`/gtm/companies/${companyId}/agents`),
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
  listIssues: (companyId: string) => api.get<Issue[]>(`/gtm/companies/${companyId}/issues`),
  createIssue: (companyId: string, body: Record<string, unknown>) =>
    api.post<Issue>(`/gtm/companies/${companyId}/issues`, body),
  listInbox: (companyId: string) => api.get<GtmInboxEntry[]>(`/gtm/companies/${companyId}/inbox`),
  listRuns: (companyId: string) => api.get<HeartbeatRun[]>(`/gtm/companies/${companyId}/runs`),
  getWorkspaceConfig: (companyId: string) =>
    api.get<GtmWorkspaceConfig>(`/gtm/companies/${companyId}/workspace-config`),
  upsertWorkspaceClaudeBrowser: (companyId: string, body: Record<string, unknown>) =>
    api.post<{ agent: Agent; environmentTest: GtmWorkspaceConfig["environmentTest"] }>(
      `/gtm/companies/${companyId}/workspace-config/claude-browser`,
      body,
    ),
};
