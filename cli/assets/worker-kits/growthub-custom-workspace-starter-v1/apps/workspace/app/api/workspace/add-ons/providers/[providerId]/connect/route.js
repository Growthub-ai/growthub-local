import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  withMarketplaceProviderRegistry,
  providerAccountEnvKeys,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function resolvedEnvKeys(keys) {
  return (Array.isArray(keys) ? keys : []).filter((key) => Boolean(readEnvVar(key, process.env)));
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const connectUrl = provider.accountSetupUrl || provider.consoleUrl;
  const requiredEnv = providerAccountEnvKeys(provider);
  const resolvedEnv = resolvedEnvKeys(requiredEnv);
  const now = new Date().toISOString();
  const syncResult = {
    ok: false,
    syncStatus: "setup-opened",
    status: "setup-opened",
    testedAt: now,
    missingEnv: requiredEnv.filter((key) => !resolvedEnv.includes(key)),
    resolvedEnv,
    proof: "",
    summary: `${provider.label} provider setup opened. Save account credentials to verify this provider before installing products.`,
  };
  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-provider-connect",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: syncResult.summary,
    nextActions: [`Save ${provider.label} account credentials, then sync the provider.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    connectUrl,
    accountState: "setup-opened",
    workspaceConfig: persisted,
    receiptId: receipt?.receiptId,
    setup: {
      account: provider.providerId,
      requiredEnv,
      missingEnv: requiredEnv.filter((key) => !resolvedEnv.includes(key)),
      resolvedEnv,
    },
  });
}

export { POST };
