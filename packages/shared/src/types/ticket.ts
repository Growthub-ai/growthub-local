import type {
  AgentRole,
  TicketStageHandoffMode,
  TicketStageKind,
  TicketStatus,
} from "../constants.js";

export interface TicketStageSummary {
  stage: string;
  issueCount: number;
  doneCount: number;
}

export interface TicketStageDefinition {
  key: string;
  label: string;
  kind?: TicketStageKind | null;
  ownerRole?: AgentRole | null;
  handoffMode?: TicketStageHandoffMode | null;
  instructions?: string | null;
  exitCriteria?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Ticket {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  identifier: string | null;
  status: TicketStatus;
  currentStage: string;
  stageOrder: string[];
  stageDefinitions?: TicketStageDefinition[];
  stageSummaries?: TicketStageSummary[];
  createdByUserId: string | null;
  createdByAgentId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown> | null;
  instructions: string | null;
  leadAgentId: string | null;
}
