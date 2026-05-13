const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "mcp-tool",
  label: "MCP tool bridge",
  connectorKind: "mcp",
  capabilities: ["listEntities", "fetchRecords", "runAction"],
  apiRegistryDefaults: {
    integrationId: "mcp-local-bridge",
    method: "POST"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "MCP endpoint", type: "url", required: true },
    { name: "authRef", label: "Auth ref", type: "secretRef", required: false }
  ],
  supportedLanes: ["data-source", "sandbox-local"]
};

export default template;
