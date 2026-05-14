const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "generic-crm",
  label: "Generic CRM feed",
  connectorKind: "http",
  capabilities: ["listEntities", "fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "generic-crm",
    method: "GET"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "baseUrl", label: "CRM base URL", type: "url", required: true },
    { name: "entityType", label: "Entity type", type: "text", required: true },
    { name: "authRef", label: "Auth ref", type: "secretRef", required: true }
  ],
  supportedLanes: ["data-source"]
};

export default template;
