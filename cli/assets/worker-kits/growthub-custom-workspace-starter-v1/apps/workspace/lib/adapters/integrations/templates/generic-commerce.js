const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "generic-commerce",
  label: "Generic commerce / orders API",
  connectorKind: "http",
  capabilities: ["fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "generic-commerce",
    method: "GET"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "Store API base", type: "url", required: true },
    { name: "authRef", label: "Auth ref", type: "secretRef", required: true }
  ],
  supportedLanes: ["data-source"]
};

export default template;
