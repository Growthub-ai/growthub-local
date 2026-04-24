const providerAliases = {
  ga4: "google-analytics",
  google_analytics: "google-analytics",
  google_drive: "google-drive",
  ghl: "go-high-level",
  gohighlevel: "go-high-level",
  meta: "meta-ads",
  meta_ads: "meta-ads"
};
function normalizeProviderId(provider) {
  const normalized = provider.trim().toLowerCase().replaceAll("_", "-");
  return providerAliases[normalized] || normalized;
}
function isHostedRecord(row) {
  return "provider" in row && ("ready" in row || "connectedAt" in row || "scopes" in row || "handle" in row);
}
function normalizeHostedIntegration(row) {
  const provider = normalizeProviderId(row.provider);
  const ready = row.ready !== false;
  return {
    id: provider,
    provider,
    label: row.label,
    name: row.label,
    status: ready ? "connected" : "needs-connection",
    isConnected: ready,
    isActive: ready,
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority",
    connectionMetadata: {
      source: "growthub-cli-profile",
      connectedAt: row.connectedAt,
      scopes: row.scopes,
      handle: row.handle
    }
  };
}
function normalizeMcpAccount(account) {
  const provider = normalizeProviderId(account.provider);
  const isActive = account.isActive === true;
  const isVerified = account.isVerified === true;
  const isConnected = isActive;
  return {
    id: provider,
    provider,
    label: account.connectionName || void 0,
    name: account.connectionName || void 0,
    authType: normalizeConnectionType(account.connectionType),
    status: isConnected ? "connected" : "needs-connection",
    isConnected,
    isActive,
    connectionId: account.id,
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority",
    connectionMetadata: {
      source: "growthub-mcp-accounts",
      accountId: account.id,
      connectionName: account.connectionName,
      connectionType: account.connectionType,
      isVerified,
      appSlug: account.appSlug,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      metadata: account.metadata || void 0
    }
  };
}
function normalizeConnectionType(connectionType) {
  if (connectionType === "api_token" || connectionType === "api_key") return "api_token";
  if (connectionType === "webhook") return "webhook";
  return "oauth_first_party";
}
function normalizeBridgeRow(row) {
  if (isHostedRecord(row)) return normalizeHostedIntegration(row);
  const provider = normalizeProviderId(row.provider || row.id || "");
  return {
    ...row,
    id: row.id || provider,
    provider
  };
}
function normalizeGrowthubBridgePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeBridgeRow);
  }
  return [
    ...(payload.integrations || []).map(normalizeBridgeRow),
    ...(payload.accounts || []).map(normalizeMcpAccount),
    ...(payload.dataSources || []).map(normalizeBridgeRow),
    ...(payload.workspaceIntegrations || []).map(normalizeBridgeRow)
  ];
}
export {
  normalizeGrowthubBridgePayload
};
