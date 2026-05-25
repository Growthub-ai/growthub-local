/**
 * Nango — resolver template.
 *
 * Seeds API Registry rows whose proxy + auth flow is delegated to Nango.
 * Each row carries the Nango `providerConfigKey` (defaults to the
 * `integrationId` when not set explicitly), the connection ID set, and the
 * list of enabled action functions. The Nango secret lives in env (default
 * env-ref name: `NANGO_SECRET_KEY`) and is resolved server-side at proxy
 * time. The browser never holds the secret.
 *
 * `connectorKind: "nango"` is recognized by the resolver registry and the
 * config-driven loader at `lib/adapters/integrations/nango/index.js`, which
 * registers a resolver for each api-registry row tagged with this kind.
 */

const template = {
  schemaVersion: "growthub-resolver-template-v1",
  templateId: "nango",
  label: "Nango integration backbone",
  connectorKind: "nango",
  capabilities: ["listEntities", "fetchRecords", "runAction"],
  apiRegistryDefaults: {
    integrationId: "nango-provider",
    authRef: "NANGO_SECRET_KEY",
    method: "GET",
    connectorKind: "nango",
    resolverTemplateId: "nango",
    schemaVersion: "growthub-resolver-template-v1"
  },
  dataSourceDefaults: {
    objectType: "data-source",
    binding: { sourceStorage: "workspace-source-records" }
  },
  configSchema: [
    { name: "integrationId", label: "Integration ID", type: "text", required: true, description: "Stable provider slug. Used as the resolver key and (when no override is set) as the Nango providerConfigKey." },
    { name: "providerConfigKey", label: "Nango provider config key", type: "text", required: false, description: "Overrides integrationId when the Nango key differs from the workspace slug." },
    { name: "endpoint", label: "Proxy endpoint", type: "text", required: false, description: "Path or absolute URL forwarded through Nango Proxy. Leave blank when the resolver derives the endpoint from listEntities." },
    { name: "method", label: "HTTP method", type: "text", required: false, description: "GET (default) | POST | PUT | PATCH | DELETE." },
    { name: "authRef", label: "Nango secret env ref", type: "secretRef", required: false, description: "Defaults to NANGO_SECRET_KEY. The env value is the Nango secret key; the workspace never sees it in the browser." },
    { name: "connectionIds", label: "Connection IDs", type: "text", required: false, description: "Comma-separated Nango connection IDs (one per tenant). The resolver fans out across them when more than one is set." },
    { name: "enabledActions", label: "Enabled actions", type: "text", required: false, description: "Comma-separated names of Nango action functions exposed as agent tools." },
    { name: "nangoMode", label: "Nango mode", type: "text", required: false, description: "cloud (default) or self-hosted. Self-hosted requires nangoHostUrl." },
    { name: "nangoHostUrl", label: "Nango host URL", type: "url", required: false, description: "Required when nangoMode = self-hosted." },
    { name: "nangoEnvironment", label: "Nango environment", type: "text", required: false, description: "dev (default) or prod. Maps to the Nango environment header." }
  ],
  supportedLanes: ["data-source", "sandbox-local", "sandbox-serverless"]
};

export default template;
