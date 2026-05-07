function normalizeProviderId(provider) {
  return provider.trim().toLowerCase().replaceAll("_", "-");
}
function providerLabel(provider) {
  return normalizeProviderId(provider)
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
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
	    label: providerLabel(provider),
	    name: providerLabel(provider),
    authType: normalizeConnectionType(account.connectionType),
    status: isConnected ? "connected" : "needs-connection",
    isConnected,
    isActive,
    connectionId: account.id,
    authPath: "growthub-mcp-bridge",
    setupMode: "hosted-authority",
    connectionMetadata: {
      source: "growthub-mcp-accounts",
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
