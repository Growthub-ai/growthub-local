export type GtmKnowledgeCollaborator = {
  email?: string;
  user_id?: string;
  can_edit?: boolean;
  status?: string;
};

export type GtmKnowledgeShareConfig = {
  collaborators?: GtmKnowledgeCollaborator[];
};

export type GtmKnowledgeMetadata = {
  origin?: string;
  connector_type?: string;
  table_id?: string;
  visibility?: string;
  workspace_id?: string | null;
  admin_id?: string | null;
  notes?: string | null;
  share_config?: GtmKnowledgeShareConfig;
};

export type GtmKnowledgeItemRecord = {
  agentSlug: string;
  compressed: boolean;
  createdAt: string;
  fileName: string;
  id: string;
  isActive: boolean;
  itemCount: number;
  metadata: GtmKnowledgeMetadata;
  sourceType: string;
  storagePath: string;
  updatedAt: string;
  userId: string;
};

export type GtmConnectorRecord = {
  id: string;
  label: string;
  target: string;
  status: "connected" | "needs_attention";
  config: {
    workspaceId: string | null;
    adminId: string | null;
  };
};

export type GtmWorkflowRun = {
  command: string | null;
  error: string | null;
  finishedAt: string | null;
  pid: number | null;
  startedAt: string | null;
  status: "idle" | "running" | "failed";
};

export type GtmState = {
  profile: {
    adminId: string | null;
    ghAppPath: string | null;
    growthubAccountEmail: string | null;
    workspaceId: string | null;
    workspaceName: string | null;
  };
  knowledge: {
    items: GtmKnowledgeItemRecord[];
    table: GtmKnowledgeItemRecord;
  };
  connectors: GtmConnectorRecord[];
  workflow: {
    id: "local-sdr";
    label: string;
    lastRun: GtmWorkflowRun;
    referenceInterfaces: {
      internalSocialsPath: string | null;
      localSdrPath: string | null;
    };
    runnerPath: string | null;
  };
};

export type GtmViewModel = {
  profile: {
    account: string;
    appConnection: string;
    workspace: string;
  };
  knowledge: {
    group: {
      connector: string;
      itemCount: number;
      label: string;
      notes: string | null;
    };
    items: Array<{
      kind: string;
      notes: string | null;
      title: string;
    }>;
  };
  connectors: Array<{
    label: string;
    status: string;
    summary: string;
    target: string;
  }>;
  workflow: {
    actionLabel: string;
    interfaces: string[];
    label: string;
    lastRunAt: string;
    runner: string;
    status: string;
  };
};

export type GtmCampaignKnowledgePolicy = {
  saveRunOutputs: boolean;
  freezeWhenConnected: boolean;
};

export type GtmCampaignPolicy = {
  heartbeatCadence: string | null;
  performanceReviewCadence: string | null;
  escalationPolicy: string | null;
};

export type GtmCampaignStageMetadata = {
  kpis?: string | null;
  sop?: string | null;
  outputExpectations?: string | null;
  policy?: string | null;
  knowledgeItems?: string | null;
};

export type GtmCampaignSettings = {
  policy: GtmCampaignPolicy;
  knowledge: GtmCampaignKnowledgePolicy;
  defaultIssueConfig: {
    outputExpectations: string | null;
    successMetric: string | null;
    knowledgeCaptureNotes: string | null;
  };
};

export type GtmCampaignWorkspaceBinding = {
  repoUrl: string | null;
  baseRef: string | null;
  branchTemplate: string | null;
};

export type GtmCampaignMetadata = {
  product: "gtm";
  surfaceProfile: "gtm";
  entity: "campaign";
  targetAudience?: string | null;
  offer?: string | null;
  successDefinition?: string | null;
  settings?: GtmCampaignSettings | null;
  workspaceBinding?: GtmCampaignWorkspaceBinding | null;
};

const DEFAULT_GTM_CAMPAIGN_SETTINGS: GtmCampaignSettings = {
  policy: {
    heartbeatCadence: null,
    performanceReviewCadence: null,
    escalationPolicy: null,
  },
  knowledge: {
    saveRunOutputs: true,
    freezeWhenConnected: true,
  },
  defaultIssueConfig: {
    outputExpectations: null,
    successMetric: null,
    knowledgeCaptureNotes: null,
  },
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeGtmCampaignStageMetadata(value: unknown): GtmCampaignStageMetadata | null {
  const record = readRecord(value);
  if (!record) return null;
  return {
    kpis: readString(record.kpis),
    sop: readString(record.sop),
    outputExpectations: readString(record.outputExpectations),
    policy: readString(record.policy),
    knowledgeItems: readString(record.knowledgeItems),
  };
}

export function normalizeGtmCampaignSettings(value: unknown): GtmCampaignSettings {
  const record = readRecord(value);
  const policy = readRecord(record?.policy);
  const knowledge = readRecord(record?.knowledge);
  const defaultIssueConfig = readRecord(record?.defaultIssueConfig);

  return {
    policy: {
      heartbeatCadence: readString(policy?.heartbeatCadence),
      performanceReviewCadence: readString(policy?.performanceReviewCadence),
      escalationPolicy: readString(policy?.escalationPolicy),
    },
    knowledge: {
      saveRunOutputs: readBoolean(knowledge?.saveRunOutputs, DEFAULT_GTM_CAMPAIGN_SETTINGS.knowledge.saveRunOutputs),
      freezeWhenConnected: readBoolean(knowledge?.freezeWhenConnected, DEFAULT_GTM_CAMPAIGN_SETTINGS.knowledge.freezeWhenConnected),
    },
    defaultIssueConfig: {
      outputExpectations: readString(defaultIssueConfig?.outputExpectations),
      successMetric: readString(defaultIssueConfig?.successMetric),
      knowledgeCaptureNotes: readString(defaultIssueConfig?.knowledgeCaptureNotes),
    },
  };
}

export function normalizeGtmCampaignWorkspaceBinding(
  value: unknown,
): GtmCampaignWorkspaceBinding | null {
  const record = readRecord(value);
  if (!record) return null;
  const repoUrl = readString(record.repoUrl);
  const baseRef = readString(record.baseRef);
  const branchTemplate = readString(record.branchTemplate);
  if (!repoUrl && !baseRef && !branchTemplate) return null;
  return { repoUrl, baseRef, branchTemplate };
}

export function readGtmCampaignMetadata(value: unknown): GtmCampaignMetadata | null {
  const record = readRecord(value);
  if (!record) return null;
  if (record.product !== "gtm" && record.surfaceProfile !== "gtm") return null;
  return {
    product: "gtm",
    surfaceProfile: "gtm",
    entity: "campaign",
    targetAudience: readString(record.targetAudience),
    offer: readString(record.offer),
    successDefinition: readString(record.successDefinition),
    settings: normalizeGtmCampaignSettings(record.settings),
    workspaceBinding: normalizeGtmCampaignWorkspaceBinding(record.workspaceBinding),
  };
}

export function buildGtmCampaignMetadata(input: {
  targetAudience?: string | null;
  offer?: string | null;
  successDefinition?: string | null;
  settings?: GtmCampaignSettings | null;
  workspaceBinding?: GtmCampaignWorkspaceBinding | null;
}): GtmCampaignMetadata {
  return {
    product: "gtm",
    surfaceProfile: "gtm",
    entity: "campaign",
    targetAudience: readString(input.targetAudience),
    offer: readString(input.offer),
    successDefinition: readString(input.successDefinition),
    settings: normalizeGtmCampaignSettings(input.settings),
    workspaceBinding: normalizeGtmCampaignWorkspaceBinding(input.workspaceBinding),
  };
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function mapGtmKnowledgeKind(sourceType: string): string {
  return sourceType === "table" ? "table" : "item";
}

export function formatConnectorLabel(type: string | null | undefined): string {
  if (!type?.trim()) return "Manual";
  return humanizeToken(type);
}

export function formatKnowledgeGroupLabel(table: Pick<GtmKnowledgeItemRecord, "fileName">): string {
  return humanizeToken(table.fileName);
}

export function createDefaultGtmState(now = new Date().toISOString()): GtmState {
  return {
    profile: {
      growthubAccountEmail: null,
      workspaceName: "Workspace",
      ghAppPath: null,
      workspaceId: null,
      adminId: null,
    },
    knowledge: {
      table: {
        id: "workspace-knowledge-table",
        agentSlug: "__user_general",
        compressed: false,
        createdAt: now,
        fileName: "workspace_knowledge",
        isActive: true,
        itemCount: 0,
        metadata: {
          origin: "table",
          notes: "No workspace knowledge has been imported yet.",
        },
        sourceType: "table",
        storagePath: "knowledge/tables/workspace_knowledge.txt",
        updatedAt: now,
        userId: "local-user",
      },
      items: [],
    },
    connectors: [],
    workflow: {
      id: "local-sdr",
      label: "Local SDR",
      runnerPath: null,
      referenceInterfaces: {
        internalSocialsPath: null,
        localSdrPath: null,
      },
      lastRun: {
        command: null,
        error: null,
        finishedAt: null,
        pid: null,
        startedAt: null,
        status: "idle",
      },
    },
  };
}

export function coerceGtmState(raw: unknown): GtmState {
  const fallback = createDefaultGtmState();
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Partial<GtmState>;
  const fallbackItemTemplate = fallback.knowledge.table;
  const fallbackConnectorTemplate: GtmConnectorRecord = fallback.connectors[0] ?? {
    id: "gtm-connector",
    label: "Connector",
    target: "Configure workspace and connector settings",
    status: "needs_attention",
    config: {
      workspaceId: null,
      adminId: null,
    },
  };
  return {
    profile: {
      ...fallback.profile,
      ...candidate.profile,
    },
    knowledge: {
      table: {
        ...fallback.knowledge.table,
        ...candidate.knowledge?.table,
        metadata: {
          ...fallback.knowledge.table.metadata,
          ...candidate.knowledge?.table?.metadata,
        },
      },
      items: Array.isArray(candidate.knowledge?.items) && candidate.knowledge.items.length > 0
        ? candidate.knowledge.items.map((item, index) => ({
          ...fallbackItemTemplate,
          ...item,
          metadata: {
            ...fallbackItemTemplate.metadata,
            ...item.metadata,
          },
        }))
        : fallback.knowledge.items,
    },
    connectors: Array.isArray(candidate.connectors) && candidate.connectors.length > 0
      ? candidate.connectors.map((connector, index) => ({
        ...fallbackConnectorTemplate,
        ...connector,
        config: {
          ...fallbackConnectorTemplate.config,
          ...connector.config,
        },
      }))
      : fallback.connectors,
    workflow: {
      ...fallback.workflow,
      ...candidate.workflow,
      referenceInterfaces: {
        ...fallback.workflow.referenceInterfaces,
        ...candidate.workflow?.referenceInterfaces,
      },
      lastRun: {
        ...fallback.workflow.lastRun,
        ...candidate.workflow?.lastRun,
      },
    },
  };
}

export function toGtmViewModel(state: GtmState): GtmViewModel {
  const workflowRun = state.workflow.lastRun;
  return {
    profile: {
      account: state.profile.growthubAccountEmail ?? "Not connected",
      workspace: state.profile.workspaceName ?? "Workspace",
      appConnection: state.profile.ghAppPath ?? "App not configured",
    },
    knowledge: {
      group: {
        label: formatKnowledgeGroupLabel(state.knowledge.table),
        connector: formatConnectorLabel(state.knowledge.table.metadata.connector_type),
        notes: state.knowledge.table.metadata.notes ?? null,
        itemCount: state.knowledge.items.length,
      },
      items: state.knowledge.items.map((item) => ({
        title: item.fileName,
        kind: mapGtmKnowledgeKind(item.sourceType),
        notes: item.metadata.notes ?? null,
      })),
    },
    connectors: state.connectors.map((connector) => ({
      label: connector.label,
      target: connector.target,
      status: connector.status === "connected" ? "Connected" : "Needs attention",
      summary: connector.config.workspaceId
        ? `Workspace ${connector.config.workspaceId}`
        : "Connector requires configuration",
    })),
    workflow: {
      label: state.workflow.label,
      runner: state.workflow.runnerPath ?? "No local runner configured",
      status: !state.workflow.runnerPath
        ? "Needs setup"
        : workflowRun.status === "running"
        ? "Running"
        : workflowRun.status === "failed"
          ? "Needs attention"
          : "Ready",
      lastRunAt: workflowRun.startedAt ?? "Not started",
      actionLabel: state.workflow.runnerPath ? "Launch Local SDR" : "Configure Local SDR",
      interfaces: [
        state.workflow.referenceInterfaces.internalSocialsPath ?? "Reference app not configured",
        state.workflow.referenceInterfaces.localSdrPath ?? "Workflow runner not configured",
      ],
    },
  };
}
