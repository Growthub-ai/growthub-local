export type DataAdapterKind = "postgres" | "qstash-kv" | "provider-managed";
export type AuthAdapterKind = "oidc" | "clerk" | "authjs" | "provider-managed";
export type PaymentAdapterKind = "none" | "stripe" | "polar";
export type IntegrationAdapterKind = "growthub-bridge" | "byo-api-key" | "static";

export type AgencyPortalAdapterConfig = {
  deployTarget: "vercel";
  dataAdapter: DataAdapterKind;
  authAdapter: AuthAdapterKind;
  paymentAdapter: PaymentAdapterKind;
  integrationAdapter: IntegrationAdapterKind;
  reportingAdapter?: string;
  growthubBridge: {
    baseUrl?: string;
    integrationsPath: string;
    userId?: string;
    hasAccessToken: boolean;
  };
  dataSources: {
    hasWindsorApiKey: boolean;
  };
};

export function readAdapterConfig(): AgencyPortalAdapterConfig {
  return {
    deployTarget: "vercel",
    dataAdapter: readEnum("AGENCY_PORTAL_DATA_ADAPTER", ["postgres", "qstash-kv", "provider-managed"], "provider-managed"),
    authAdapter: readEnum("AGENCY_PORTAL_AUTH_ADAPTER", ["oidc", "clerk", "authjs", "provider-managed"], "provider-managed"),
    paymentAdapter: readEnum("AGENCY_PORTAL_PAYMENT_ADAPTER", ["none", "stripe", "polar"], "none"),
    integrationAdapter: readEnum("AGENCY_PORTAL_INTEGRATION_ADAPTER", ["growthub-bridge", "byo-api-key", "static"], "static"),
    reportingAdapter: process.env.AGENCY_PORTAL_REPORTING_ADAPTER || undefined,
    growthubBridge: {
      baseUrl: process.env.GROWTHUB_BRIDGE_BASE_URL || undefined,
      integrationsPath: process.env.GROWTHUB_BRIDGE_INTEGRATIONS_PATH || "/api/mcp/accounts",
      userId: process.env.GROWTHUB_BRIDGE_USER_ID || undefined,
      hasAccessToken: Boolean(process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN),
    },
    dataSources: {
      hasWindsorApiKey: Boolean(process.env.WINDSOR_API_KEY),
    },
  };
}

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[key];
  if (!value) return fallback;
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
}
