import type { Ticket, TicketStageDefinition } from "@paperclipai/shared";
import { api } from "./client";

export type GhPr = {
  number: number;
  title: string;
  state: string;
  url: string;
  branch: string;
  repo: string;
  createdAt: string;
  user: string;
  draft: boolean;
};

export type GhRepo = {
  fullName: string;
  name: string;
  private: boolean;
  pushedAt: string;
};

export const ticketsApi = {
  list: (companyId: string) =>
    api.get<Ticket[]>(`/companies/${companyId}/tickets`),

  get: (companyId: string, ticketId: string) =>
    api.get<Ticket>(`/companies/${companyId}/tickets/${ticketId}`),

  create: (companyId: string, data: {
    title: string;
    description?: string;
    stageOrder?: string[];
    stageDefinitions?: TicketStageDefinition[];
    instructions?: string;
    leadAgentId?: string | null;
    metadata?: Record<string, unknown>;
  }) =>
    api.post<Ticket>(`/companies/${companyId}/tickets`, data),

  update: (companyId: string, ticketId: string, data: Partial<{
    title: string;
    description: string | null;
    status: string;
    currentStage: string;
    stageOrder: string[];
    stageDefinitions: TicketStageDefinition[];
  }>) =>
    api.patch<Ticket>(`/companies/${companyId}/tickets/${ticketId}`, data),

  advanceStage: (companyId: string, ticketId: string) =>
    api.post<Ticket>(`/companies/${companyId}/tickets/${ticketId}/advance`, {}),

  remove: (companyId: string, ticketId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/tickets/${ticketId}`),

  githubPrs: (companyId: string, repo: string, state = "open") =>
    api.get<GhPr[]>(`/companies/${companyId}/github/prs?repo=${encodeURIComponent(repo)}&state=${state}`),

  githubRepos: (companyId: string) =>
    api.get<GhRepo[]>(`/companies/${companyId}/github/repos`),
};
