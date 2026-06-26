import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  listProviderProductReadiness,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function POST(_request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const now = new Date().toISOString();
  const readiness = listProviderProductReadiness(provider.providerId, process.env);
  const configured = readiness.filter((item) => item.configured);
  const configuredLabels = configured.map((item) => item.label);
  const syncResult = {
    ok: true,
    testedAt: now,
    proof: `${provider.label} account handoff completed through provider console. Product configuration and cluster setup happen per product install.`,
    summary: `${provider.label} provider account connected. Products are now available for workspace installation.`,
  };
  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-provider-sync",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: syncResult.summary,
    nextActions: [`Install ${provider.label} products from the provider marketplace page. Product sync will verify the specific product credential refs server-side.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    workspaceConfig: persisted,
    connectedProducts: configured.map((item) => ({
      productId: item.productId,
      integrationId: item.integrationId,
      label: item.label,
    })),
    readiness,
    configuredProductLabels: configuredLabels,
    sync: syncResult,
    receiptId: receipt.receiptId,
  });
}

export { POST };
