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
