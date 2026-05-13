const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "generic-spreadsheet",
  label: "Generic spreadsheet / table feed",
  connectorKind: "http",
  capabilities: ["fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "generic-spreadsheet",
    method: "GET"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "Export URL", type: "url", required: true },
    { name: "authRef", label: "Auth ref", type: "secretRef", required: false }
  ],
  supportedLanes: ["data-source"]
};

export default template;
