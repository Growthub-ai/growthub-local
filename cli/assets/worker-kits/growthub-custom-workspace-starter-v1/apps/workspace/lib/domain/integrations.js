const dataSources = [
  {
    id: "windsor-ai",
    label: "Windsor AI",
    name: "Windsor AI",
    icon: "W",
    provider: "windsor-ai",
    description: "Primary blended marketing data source for cross-channel reporting.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "data-source",
    objectType: "data-pipeline",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "google-sheets-blended-data",
    label: "Google Sheets blended data",
    name: "Google Sheets blended data",
    icon: "G",
    provider: "google-sheets",
    description: "Windsor AI blended data destination for spreadsheet-backed reporting workflows.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "data-source",
    objectType: "data-pipeline",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "google-analytics",
    label: "Google Analytics",
    name: "Google Analytics",
    icon: "G",
    provider: "google-analytics",
    description: "First-party Growthub connection for analytics properties and account metrics.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "data-source",
    objectType: "data-pipeline",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "shopify",
    label: "Shopify",
    name: "Shopify",
    icon: "S",
    provider: "shopify",
    description: "Commerce data source resolved through the Growthub MCP connection store.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "data-source",
    objectType: "data-pipeline",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "meta-ads",
    label: "Meta Facebook and Instagram",
    name: "Meta Facebook and Instagram",
    icon: "M",
    provider: "meta-ads",
    description: "First-party Meta account access for Facebook and Instagram performance data.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "data-source",
    objectType: "data-pipeline",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  }
];
const workspaceIntegrations = [
  {
    id: "asana",
    label: "Asana",
    name: "Asana",
    icon: "A",
    provider: "asana",
    description: "Project and task operations available through the connected Growthub account.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "workspace-integration",
    objectType: "mcp-connection",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "slack",
    label: "Slack",
    name: "Slack",
    icon: "S",
    provider: "slack",
    description: "Team messaging and notification workflows without app-local Slack secrets.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "workspace-integration",
    objectType: "mcp-connection",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "go-high-level",
    label: "GoHighLevel",
    name: "GoHighLevel",
    icon: "G",
    provider: "go-high-level",
    description: "CRM and social account access delegated through Growthub connection authority.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "workspace-integration",
    objectType: "mcp-connection",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "google-drive",
    label: "Google Drive",
    name: "Google Drive",
    icon: "G",
    provider: "google-drive",
    description: "Document and knowledge-base access resolved through the user's connected account.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "workspace-integration",
    objectType: "mcp-connection",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  },
  {
    id: "notion",
    label: "Notion",
    name: "Notion",
    icon: "N",
    provider: "notion",
    description: "Workspace knowledge and project content access through the Growthub bridge.",
    category: "mcp_connector",
    authType: "oauth_first_party",
    isConnected: false,
    isActive: false,
    lane: "workspace-integration",
    objectType: "mcp-connection",
    status: "needs-connection",
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority"
  }
];
const governedWorkspaceIntegrationCatalog = [...dataSources, ...workspaceIntegrations];

function groupIntegrationsByLane(integrations) {
  return {
    dataSources: integrations.filter((item) => item.lane === "data-source"),
    workspaceIntegrations: integrations.filter((item) => item.lane === "workspace-integration")
  };
}

function normalizeIntegrationEntity(entity) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return null;
  const id = typeof entity.id === "string" ? entity.id.trim() : "";
  const label = typeof entity.label === "string" && entity.label.trim()
    ? entity.label.trim()
    : id;
  if (!id || !label) return null;
  const normalized = {
    id,
    label,
    secondaryLabel: typeof entity.secondaryLabel === "string" ? entity.secondaryLabel : id,
    entityType: typeof entity.entityType === "string" ? entity.entityType : undefined,
    provider: typeof entity.provider === "string" ? entity.provider : undefined,
    lane: typeof entity.lane === "string" ? entity.lane : undefined,
    status: typeof entity.status === "string" ? entity.status : undefined,
    metadata: entity.metadata && typeof entity.metadata === "object" && !Array.isArray(entity.metadata)
      ? entity.metadata
      : undefined
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function normalizeIntegrationEntities(entities) {
  if (!Array.isArray(entities)) return [];
  return entities.map(normalizeIntegrationEntity).filter(Boolean);
}

export {
  governedWorkspaceIntegrationCatalog,
  groupIntegrationsByLane,
  normalizeIntegrationEntities
};
