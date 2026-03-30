import type { PaperclipConfig } from "@paperclipai/shared";

export type GrowthubConnectionState = {
  baseUrl: string;
  connected: boolean;
  portalBaseUrl: string;
  machineLabel: string;
  workspaceLabel: string;
  token: string;
};

function normalizeUrl(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function resolveGrowthubBaseUrl(input: {
  configuredBaseUrl?: string | null;
  portalBaseUrl?: string | null;
  envBaseUrl?: string | null;
}): string {
  const configuredBaseUrl = normalizeUrl(input.configuredBaseUrl);
  if (configuredBaseUrl) return configuredBaseUrl;

  const envBaseUrl = normalizeUrl(input.envBaseUrl);
  if (envBaseUrl) return envBaseUrl;

  return normalizeUrl(input.portalBaseUrl);
}

export function resolveGrowthubBridgeBaseUrls(input: {
  baseUrl?: string | null;
  portalBaseUrl?: string | null;
}): string[] {
  const baseUrl = normalizeUrl(input.baseUrl);
  const portalBaseUrl = normalizeUrl(input.portalBaseUrl);

  if (!baseUrl && !portalBaseUrl) return [];
  if (!baseUrl) return portalBaseUrl ? [portalBaseUrl] : [];
  if (!portalBaseUrl || portalBaseUrl === baseUrl) return [baseUrl];
  return [baseUrl, portalBaseUrl];
}

export function readGrowthubConnectionState(
  config: Pick<PaperclipConfig, "auth"> | null,
  envBaseUrl?: string | null,
): GrowthubConnectionState {
  return {
    baseUrl: resolveGrowthubBaseUrl({
      configuredBaseUrl: config?.auth.growthubBaseUrl,
      portalBaseUrl: config?.auth.growthubPortalBaseUrl,
      envBaseUrl,
    }),
    connected: Boolean(config?.auth.token?.trim()),
    portalBaseUrl: normalizeUrl(config?.auth.growthubPortalBaseUrl),
    machineLabel: config?.auth.growthubMachineLabel?.trim() || "",
    workspaceLabel: config?.auth.growthubWorkspaceLabel?.trim() || "",
    token: config?.auth.token?.trim() || "",
  };
}

export function applyGrowthubCallbackAuth(
  config: PaperclipConfig,
  input: {
    token: string;
    portalBaseUrl?: string | null;
    machineLabel?: string | null;
    workspaceLabel?: string | null;
  },
): PaperclipConfig {
  const normalizedPortalBaseUrl = normalizeUrl(input.portalBaseUrl);

  return {
    ...config,
    $meta: {
      ...config.$meta,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    auth: {
      ...config.auth,
      token: input.token.trim(),
      growthubBaseUrl: normalizeUrl(config.auth.growthubBaseUrl) || undefined,
      growthubPortalBaseUrl: normalizedPortalBaseUrl || normalizeUrl(config.auth.growthubPortalBaseUrl) || undefined,
      growthubMachineLabel: input.machineLabel?.trim() || config.auth.growthubMachineLabel,
      growthubWorkspaceLabel: input.workspaceLabel?.trim() || config.auth.growthubWorkspaceLabel,
    },
  };
}

export function clearGrowthubConnectionAuth(config: PaperclipConfig): PaperclipConfig {
  return {
    ...config,
    $meta: {
      ...config.$meta,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    auth: {
      ...config.auth,
      growthubBaseUrl: resolveGrowthubBaseUrl({
        configuredBaseUrl: config.auth.growthubBaseUrl,
        portalBaseUrl: config.auth.growthubPortalBaseUrl,
      }) || undefined,
      token: undefined,
      growthubPortalBaseUrl: undefined,
      growthubMachineLabel: undefined,
      growthubWorkspaceLabel: undefined,
    },
  };
}
