const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "generic-project-management",
  label: "Generic project management API",
  connectorKind: "http",
  capabilities: ["listEntities", "fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "generic-pm",
    method: "GET"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "API base URL", type: "url", required: true },
    { name: "authRef", label: "Auth ref", type: "secretRef", required: true }
  ],
  supportedLanes: ["data-source", "sandbox-serverless"]
};

export default template;
