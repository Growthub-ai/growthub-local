const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "custom-http",
  label: "Custom HTTP connector",
  connectorKind: "http",
  capabilities: ["listEntities", "fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "custom-http",
    method: "GET"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "Base URL", type: "url", required: true },
    { name: "endpoint", label: "Endpoint path", type: "text", required: false },
    { name: "authRef", label: "Auth env ref", type: "secretRef", required: false }
  ],
  supportedLanes: ["data-source", "sandbox-local", "sandbox-serverless"]
};

export default template;
