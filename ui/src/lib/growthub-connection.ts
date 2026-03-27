import { authApi } from "@/api/auth";

export type GrowthubConnectionSurface = "dx" | "gtm";

export function getGrowthubAuthUserId(
  session: Awaited<ReturnType<typeof authApi.getSession>> | null,
): string | null {
  return session?.user.id ?? session?.session.userId ?? null;
}

export function buildGrowthubConfigurationUrl(input: {
  baseUrl: string;
  callbackUrl: string;
  userId: string;
  surface: GrowthubConnectionSurface;
  workspaceLabel: string;
  machineLabel?: string | null;
}) {
  const url = new URL(input.baseUrl);

  // Hand off to the hosted integrations page. The hosted app owns the real
  // authenticated user session and opens the Growthub Local modal from there.
  url.pathname = "/integrations";
  url.search = "";
  url.searchParams.set("return_url", input.callbackUrl);

  return url.toString();
}
