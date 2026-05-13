const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "webhook",
  label: "Inbound webhook",
  connectorKind: "http",
  capabilities: ["fetchRecords"],
  apiRegistryDefaults: {
    integrationId: "webhook-ingest",
    method: "POST"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "endpoint", label: "Webhook path", type: "text", required: true },
    { name: "authRef", label: "Signing secret ref", type: "secretRef", required: false }
  ],
  supportedLanes: ["data-source", "sandbox-serverless"]
};

export default template;
