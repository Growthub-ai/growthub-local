export type IntegrationLane = "data-source" | "workspace-integration";
export type IntegrationStatus = "available" | "connected" | "needs-connection";
export type IntegrationObjectType = "data-pipeline" | "mcp-connection";
export type IntegrationCategory = "mcp_connector" | "api_key" | "custom";
export type IntegrationAuthType = "oauth_pipedream" | "oauth_first_party" | "api_token" | "webhook";

export type AgencyPortalIntegration = {
  id: string;
  label: string;
  name: string;
  icon: string;
  provider: string;
  description: string;
  category: IntegrationCategory;
  authType: IntegrationAuthType;
  isConnected: boolean;
  isActive: boolean;
  connectionId?: string;
  connectionMetadata?: Record<string, unknown>;
  lane: IntegrationLane;
  objectType: IntegrationObjectType;
  status: IntegrationStatus;
  authPath: "growthub-mcp-bridge" | "byo-api-key" | "adapter-api" | "manual";
  setupMode: "hosted-authority" | "bring-your-own-key" | "local-catalog";
  accountId?: string;
  secretEnvName?: string;
  metadata?: Record<string, unknown>;
};

const dataSources: AgencyPortalIntegration[] = [
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
  },
];

const workspaceIntegrations: AgencyPortalIntegration[] = [
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
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
    setupMode: "hosted-authority",
  },
];

export const agencyPortalIntegrationCatalog = [...dataSources, ...workspaceIntegrations];

export function groupIntegrationsByLane(integrations: AgencyPortalIntegration[]) {
  return {
    dataSources: integrations.filter((item) => item.lane === "data-source"),
    workspaceIntegrations: integrations.filter((item) => item.lane === "workspace-integration"),
  };
}
