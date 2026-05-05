/**
 * Adapter environment reader — V1
 *
 * Reads all adapter configuration from environment variables at call time.
 * No module-level side effects; safe to call in both server and edge contexts.
 *
 * Persistence adapter modes
 * ─────────────────────────
 *   provider-managed (default)
 *     The deployment provider owns persistence. For local dev this resolves to
 *     filesystem reads/writes of growthub.config.json. For Vercel/Netlify this
 *     resolves to read-only mode (PATCH returns 409) unless the operator sets
 *     WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime.
 *
 *   postgres
 *     SQL-backed adapter. Requires DATABASE_URL. Use any Postgres-compatible
 *     provider (Supabase, Neon, Railway, etc.). Keep migration tooling outside
 *     the kit contract.
 *
 *   qstash-kv
 *     QStash KV adapter. Requires QSTASH_* env vars from Upstash.
 *
 * Integration adapter modes
 * ──────────────────────────
 *   static (default)
 *     No outbound integration requests. All workspace data comes from
 *     growthub.config.json. Widget bindings are local config-backed only.
 *
 *   growthub-bridge
 *     Growthub Bridge connected. Requires GROWTHUB_BRIDGE_BASE_URL,
 *     GROWTHUB_BRIDGE_USER_ID, and GROWTHUB_BRIDGE_ACCESS_TOKEN. Enables live
 *     integration data and bridge-backed widget bindings.
 *
 *   byo-api-key
 *     BYO API key mode. Operator configures provider-specific env vars and
 *     wires them into the integration layer.
 */
function readAdapterConfig() {
  return {
    deployTarget: process.env.AGENCY_PORTAL_DEPLOY_TARGET || "vercel",
    dataAdapter: readEnum("AGENCY_PORTAL_DATA_ADAPTER", ["postgres", "qstash-kv", "provider-managed"], "provider-managed"),
    authAdapter: readEnum("AGENCY_PORTAL_AUTH_ADAPTER", ["oidc", "clerk", "authjs", "provider-managed"], "provider-managed"),
    paymentAdapter: readEnum("AGENCY_PORTAL_PAYMENT_ADAPTER", ["none", "stripe", "polar"], "none"),
    integrationAdapter: readEnum("AGENCY_PORTAL_INTEGRATION_ADAPTER", ["growthub-bridge", "byo-api-key", "static"], "static"),
    reportingAdapter: process.env.AGENCY_PORTAL_REPORTING_ADAPTER || void 0,
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
function readEnum(key, allowed, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  if (allowed.includes(value)) return value;
  throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
}
export {
  readAdapterConfig
};
