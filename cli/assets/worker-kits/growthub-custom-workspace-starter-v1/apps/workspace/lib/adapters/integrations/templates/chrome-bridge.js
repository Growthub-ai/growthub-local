const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "chrome-bridge",
  label: "Chrome extension bridge",
  connectorKind: "chrome",
  capabilities: ["fetchRecords", "runAction"],
  apiRegistryDefaults: {
    integrationId: "chrome-bridge",
    method: "POST"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "Bridge base URL", type: "url", required: true },
    { name: "authRef", label: "Bridge token ref", type: "secretRef", required: true }
  ],
  supportedLanes: ["sandbox-local", "data-source"]
};

export default template;
