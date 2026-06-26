import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  listProviderProductReadiness,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const PROVIDER_ID = "upstash";

function configuredProviderProducts(providerId) {
  return listProviderProductReadiness(providerId, process.env).filter((item) => item.configured);
}

async function POST() {
  const provider = getMarketplaceProvider(PROVIDER_ID);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId: PROVIDER_ID });

  const configured = configuredProviderProducts(provider.providerId);
  if (!configured.length) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-provider-sync",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
      summary: `${provider.label} provider account setup has not completed yet.`,
      policyVerdict: { ok: false, violationCodes: ["provider_account_not_connected"] },
      nextActions: [`Continue through the ${provider.label} provider install flow, then return to Workspace Add-ons and sync the provider.`]
    });
    return jsonError(`${provider.label} provider account setup has not completed yet.`, 422, {
      providerId: provider.providerId,
    });
  }

  const now = new Date().toISOString();
  const connectedLabels = configured.map((item) => item.label);
  const syncResult = {
    ok: true,
    testedAt: now,
    proof: `${provider.label} provider account exposes ${connectedLabels.length} configured product credential set${connectedLabels.length === 1 ? "" : "s"}.`,
    summary: `${provider.label} provider account connected for ${connectedLabels.join(", ")}.`,
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
    nextActions: [`Install ${provider.label} products from the provider marketplace page.`]
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
    sync: syncResult,
    receiptId: receipt.receiptId,
  });
}

export { POST };
