function readAdapterConfig() {
  return {
    deployTarget: "vercel",
    dataAdapter: readEnum(["GROWTHUB_WORKSPACE_DATA_ADAPTER", "AGENCY_PORTAL_DATA_ADAPTER"], ["postgres", "qstash-kv", "provider-managed"], "provider-managed"),
    authAdapter: readEnum(["GROWTHUB_WORKSPACE_AUTH_ADAPTER", "AGENCY_PORTAL_AUTH_ADAPTER"], ["oidc", "clerk", "authjs", "provider-managed"], "provider-managed"),
    paymentAdapter: readEnum(["GROWTHUB_WORKSPACE_PAYMENT_ADAPTER", "AGENCY_PORTAL_PAYMENT_ADAPTER"], ["none", "stripe", "polar"], "none"),
    integrationAdapter: readEnum(["GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER", "AGENCY_PORTAL_INTEGRATION_ADAPTER"], ["growthub-bridge", "byo-api-key", "static"], "static"),
    reportingAdapter: process.env.GROWTHUB_WORKSPACE_REPORTING_ADAPTER || process.env.AGENCY_PORTAL_REPORTING_ADAPTER || void 0,
    growthubBridge: {
      baseUrl: process.env.GROWTHUB_BRIDGE_BASE_URL || void 0,
      integrationsPath: process.env.GROWTHUB_BRIDGE_INTEGRATIONS_PATH || "/api/mcp/accounts",
      userId: process.env.GROWTHUB_BRIDGE_USER_ID || void 0,
      hasAccessToken: Boolean(process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN)
    },
    dataSources: {
      hasWindsorApiKey: Boolean(process.env.WINDSOR_API_KEY)
    }
  };
}
function readEnum(keys, allowed, fallback) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const key = keyList.find((candidate) => process.env[candidate]);
  const value = key ? process.env[key] : undefined;
  if (!value) return fallback;
  if (allowed.includes(value)) return value;
  throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
}
export {
  readAdapterConfig
};
