import { NextResponse } from "next/server";
import {
  getMarketplaceProvider,
  UPSTASH_REGION_OPTIONS,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const provider = getMarketplaceProvider("upstash");
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId: "upstash" });

  const region = clean(body.region || "us-east-1");
  const plan = clean(body.plan || "free");
  const prodPack = Boolean(body.prodPack);
  const selectedRegion = UPSTASH_REGION_OPTIONS.find((option) => option.id === region) || UPSTASH_REGION_OPTIONS[0];
  const connectUrl = provider.consoleUrl;

  await appendOutcomeReceipt({
    kind: "workspace-add-on-provider-connect",
    lane: "governed-proposal",
    outcomeStatus: "pending",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
    policyVerdict: { ok: true },
    summary: `${provider.label} account setup started for ${selectedRegion.label} / ${plan}${prodPack ? " / prod pack" : ""}.`,
    nextActions: [`Complete ${provider.label} account login and product credential provisioning, then sync the provider from Workspace Add-ons.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    connectUrl,
    setup: {
      region: selectedRegion.id,
      regionLabel: selectedRegion.label,
      plan,
      prodPack,
    },
  });
}

export { POST };
