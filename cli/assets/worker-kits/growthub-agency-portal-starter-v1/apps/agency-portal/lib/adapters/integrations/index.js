import { readAdapterConfig } from "@/lib/adapters/env";
import {
  agencyPortalIntegrationCatalog
} from "@/lib/domain/integrations";
import {
  normalizeGrowthubBridgePayload
} from "./growthub-connection-normalizer";
function describeIntegrationAdapter() {
  const config = readAdapterConfig();
  if (config.integrationAdapter === "growthub-bridge") {
    return {
      id: "growthub-bridge",
      label: "Growthub MCP bridge",
      requiredEnv: ["GROWTHUB_BRIDGE_BASE_URL", "GROWTHUB_BRIDGE_ACCESS_TOKEN"],
      authority: "growthub-gh-app"
    };
  }
  if (config.integrationAdapter === "byo-api-key") {
    return {
      id: "byo-api-key",
      label: "Bring your own API key",
      requiredEnv: ["AGENCY_PORTAL_BYO_CONNECTIONS_JSON"],
      authority: "workspace-env"
    };
  }
  return {
    id: "static",
    label: "Static starter catalog",
    requiredEnv: [],
    authority: "local-catalog"
  };
}
async function listAgencyPortalIntegrations() {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge") {
    if (config.integrationAdapter === "byo-api-key") {
      return mergeBringYourOwnRows(readBringYourOwnRows());
    }
    return agencyPortalIntegrationCatalog;
  }
  if (!config.growthubBridge.baseUrl || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN) {
    return agencyPortalIntegrationCatalog;
  }
  const url = new URL(config.growthubBridge.integrationsPath, config.growthubBridge.baseUrl);
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN}`
  };
  if (config.growthubBridge.userId) {
    headers["x-user-id"] = config.growthubBridge.userId;
  }
  const response = await fetch(url, {
    headers,
    next: { revalidate: 30 }
  });
  if (!response.ok) {
    return agencyPortalIntegrationCatalog;
  }
  const payload = await response.json();
  const merged = mergeBridgeRows(normalizeGrowthubBridgePayload(payload));
  return applyApiKeyOverlays(merged, config);
}
function applyApiKeyOverlays(integrations, config) {
  if (!config.dataSources.hasWindsorApiKey) return integrations;
  const windsorOverlay = {
    status: "connected",
    isConnected: true,
    isActive: true,
    authPath: "byo-api-key",
    setupMode: "bring-your-own-key",
    authType: "api_token",
    category: "api_key",
    secretEnvName: "WINDSOR_API_KEY",
    connectionMetadata: { source: "workspace-env", secretEnvName: "WINDSOR_API_KEY" }
  };
  return integrations.map((item) => {
    if (item.provider === "windsor-ai") return { ...item, ...windsorOverlay };
    if (item.provider === "google-sheets") return { ...item, ...windsorOverlay, secretEnvName: undefined, connectionMetadata: { source: "windsor-blended-data" } };
    return item;
  });
}
function readBringYourOwnRows() {
  const raw = process.env.AGENCY_PORTAL_BYO_CONNECTIONS_JSON;
  const rows = [];
  if (process.env.WINDSOR_API_KEY) {
    rows.push({
      id: "windsor-ai",
      provider: "windsor-ai",
      name: "Windsor AI",
      label: "Windsor AI",
      category: "api_key",
      authType: "api_token",
      status: "connected",
      isConnected: true,
      isActive: true,
      authPath: "byo-api-key",
      setupMode: "bring-your-own-key",
      secretEnvName: "WINDSOR_API_KEY",
      connectionMetadata: {
        source: "workspace-env",
        secretEnvName: "WINDSOR_API_KEY"
      }
    });
  }
  if (!raw) return rows;
  try {
    const parsed = JSON.parse(raw);
    return [...rows, ...normalizeGrowthubBridgePayload(parsed)];
  } catch {
    return rows;
  }
}
function mergeBringYourOwnRows(rows) {
  const merged = mergeBridgeRows(rows);
  return merged.map((item) => {
    const row = rows.find((candidate) => {
      const provider = candidate.provider || candidate.id;
      return provider === item.provider || candidate.id === item.id;
    });
    if (!row) return item;
    return {
      ...item,
      authPath: "byo-api-key",
      setupMode: "bring-your-own-key",
      secretEnvName: typeof row.secretEnvName === "string" ? row.secretEnvName : void 0,
      status: row.status || "connected"
    };
  });
}
function mergeBridgeRows(rows) {
  const seenProviders = /* @__PURE__ */ new Set();
  const merged = agencyPortalIntegrationCatalog.map((catalogItem) => {
    const row = rows.find((item) => {
      const provider = item.provider || item.id;
      return provider === catalogItem.provider || item.id === catalogItem.id;
    });
    if (!row) return catalogItem;
    seenProviders.add(row.provider || row.id || catalogItem.provider);
    return {
      ...catalogItem,
      label: row.label || row.name || catalogItem.label,
      name: row.name || row.label || catalogItem.name,
      icon: row.icon || catalogItem.icon,
      description: row.description || catalogItem.description,
      category: row.category || catalogItem.category,
      authType: row.authType || catalogItem.authType,
      isConnected: row.isConnected ?? (row.status === "connected" ? true : catalogItem.isConnected),
      isActive: row.isActive ?? (row.status === "connected" ? true : catalogItem.isActive),
      authPath: row.authPath || catalogItem.authPath,
      setupMode: row.setupMode || catalogItem.setupMode,
      status: row.status || (row.isConnected || row.isActive ? "connected" : catalogItem.status),
      connectionId: row.connectionId,
      accountId: row.accountId,
      secretEnvName: row.secretEnvName,
      connectionMetadata: row.connectionMetadata || row.metadata,
      metadata: row.metadata || row.connectionMetadata
    };
  });
  const discoveredRows = rows.filter((row) => {
    const provider = row.provider || row.id;
    if (!provider) return false;
    if (seenProviders.has(provider)) return false;
    return !agencyPortalIntegrationCatalog.some((item) => item.provider === provider || item.id === row.id);
  });
  return [...merged, ...discoveredRows.map(toDiscoveredIntegration)];
}
function toDiscoveredIntegration(row) {
  const provider = row.provider || row.id || "unknown-provider";
  const label = row.label || row.name || provider;
  const isDataPipeline = ["windsor-ai", "google-sheets", "google-analytics", "shopify", "meta-ads"].includes(provider);
  const isConnected = row.isConnected ?? row.status === "connected";
  return {
    id: row.id || provider,
    label,
    name: row.name || label,
    icon: row.icon || label.slice(0, 1).toUpperCase(),
    provider,
    description: row.description || "Connected through the Growthub account bridge.",
    category: row.category || "mcp_connector",
    authType: row.authType || "oauth_first_party",
    isConnected,
    isActive: row.isActive ?? isConnected,
    lane: isDataPipeline ? "data-source" : "workspace-integration",
    objectType: isDataPipeline ? "data-pipeline" : "mcp-connection",
    status: row.status || (isConnected ? "connected" : "needs-connection"),
    authPath: row.authPath || "growthub-mcp-bridge",
    setupMode: row.setupMode || "hosted-authority",
    connectionId: row.connectionId,
    accountId: row.accountId,
    secretEnvName: row.secretEnvName,
    connectionMetadata: row.connectionMetadata || row.metadata,
    metadata: row.metadata || row.connectionMetadata
  };
}
export {
  describeIntegrationAdapter,
  listAgencyPortalIntegrations
};
