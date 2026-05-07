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

/**
 * Governed Integration Reference Binding — sample entity catalog.
 *
 * These are SAMPLE entities used in dev/static adapter mode so builders
 * can see the full entity-selection UX without a live Bridge connection.
 * In growthub-bridge adapter mode, the server replaces these with real
 * entities returned by the provider. The shape is NormalizedIntegrationEntity:
 *
 *   { id, label, secondaryLabel?, entityType?, provider?, lane?, status?, metadata? }
 *
 * Widgets ONLY persist `id`. `label` is display-only and resolved at runtime.
 */
const SAMPLE_ENTITIES_BY_PROVIDER = {
  "meta-ads": [
    {
      id: "57497690",
      label: "Dr. Robert Whitfield",
      secondaryLabel: "57497690",
      entityType: "account",
      provider: "meta-ads",
      lane: "data-source",
      status: "connected"
    },
    {
      id: "1234567890",
      label: "Medi-Weightloss",
      secondaryLabel: "1234567890",
      entityType: "account",
      provider: "meta-ads",
      lane: "data-source",
      status: "connected"
    },
    {
      id: "9876543210",
      label: "Livea Centers",
      secondaryLabel: "9876543210",
      entityType: "account",
      provider: "meta-ads",
      lane: "data-source",
      status: "connected"
    }
  ],
  "shopify": [
    {
      id: "my-store-demo",
      label: "My Store (Demo)",
      secondaryLabel: "my-store-demo.myshopify.com",
      entityType: "store",
      provider: "shopify",
      lane: "data-source",
      status: "connected"
    }
  ],
  "google-analytics": [
    {
      id: "123456789",
      label: "Main Property",
      secondaryLabel: "GA4 · 123456789",
      entityType: "property",
      provider: "google-analytics",
      lane: "data-source",
      status: "connected"
    },
    {
      id: "987654321",
      label: "Blog Property",
      secondaryLabel: "GA4 · 987654321",
      entityType: "property",
      provider: "google-analytics",
      lane: "data-source",
      status: "connected"
    }
  ],
  "google-sheets": [
    {
      id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
      label: "Marketing Reporting Sheet",
      secondaryLabel: "Google Sheets · Blended Data",
      entityType: "sheet",
      provider: "google-sheets",
      lane: "data-source",
      status: "connected"
    }
  ],
  "windsor-ai": [
    {
      id: "windsor-blended-pipeline",
      label: "Blended Marketing Data",
      secondaryLabel: "Windsor AI pipeline",
      entityType: "pipeline",
      provider: "windsor-ai",
      lane: "data-source",
      status: "connected"
    }
  ],
  "slack": [
    {
      id: "C0123456",
      label: "#general",
      secondaryLabel: "Slack channel",
      entityType: "channel",
      provider: "slack",
      lane: "workspace-integration",
      status: "connected"
    },
    {
      id: "C0654321",
      label: "#marketing",
      secondaryLabel: "Slack channel",
      entityType: "channel",
      provider: "slack",
      lane: "workspace-integration",
      status: "connected"
    }
  ],
  "asana": [
    {
      id: "1204622972791333",
      label: "Marketing Projects",
      secondaryLabel: "Asana project",
      entityType: "project",
      provider: "asana",
      lane: "workspace-integration",
      status: "connected"
    }
  ],
  "go-high-level": [
    {
      id: "ghl-location-demo",
      label: "Demo Location",
      secondaryLabel: "GoHighLevel location",
      entityType: "location",
      provider: "go-high-level",
      lane: "workspace-integration",
      status: "connected"
    }
  ],
  "google-drive": [
    {
      id: "1a2b3c4d5e6f7g8h",
      label: "Client Deliverables",
      secondaryLabel: "Google Drive folder",
      entityType: "folder",
      provider: "google-drive",
      lane: "workspace-integration",
      status: "connected"
    }
  ],
  "notion": [
    {
      id: "notion-workspace-demo",
      label: "Team Workspace",
      secondaryLabel: "Notion workspace",
      entityType: "workspace",
      provider: "notion",
      lane: "workspace-integration",
      status: "connected"
    }
  ]
};

/**
 * Look up sample entity metadata for a given integration by ID or provider slug.
 * In static adapter mode this returns demo entities so builders can preview the
 * full UX. In growthub-bridge mode the integration adapter enriches these with
 * real entities from the connected provider.
 */
function getEntityMetadataForIntegration(integrationId) {
  if (!integrationId) return [];
  const key = integrationId.toLowerCase().replace(/_/g, "-");
  return SAMPLE_ENTITIES_BY_PROVIDER[key] || [];
}

export {
  SAMPLE_ENTITIES_BY_PROVIDER,
  governedWorkspaceIntegrationCatalog,
  getEntityMetadataForIntegration,
  groupIntegrationsByLane
};
