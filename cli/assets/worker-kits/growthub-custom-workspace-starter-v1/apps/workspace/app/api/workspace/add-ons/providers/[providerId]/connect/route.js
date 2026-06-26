import { NextResponse } from "next/server";
import {
  getMarketplaceProvider,
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

  const connectUrl = provider.consoleUrl;

  await appendOutcomeReceipt({
    kind: "workspace-add-on-provider-connect",
    lane: "governed-proposal",
    outcomeStatus: "pending",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
    policyVerdict: { ok: true },
    summary: `${provider.label} account setup started.`,
    nextActions: [`Complete ${provider.label} account login, then sync the provider from Workspace Add-ons.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    connectUrl,
    setup: { account: provider.providerId },
  });
}

export { POST };
