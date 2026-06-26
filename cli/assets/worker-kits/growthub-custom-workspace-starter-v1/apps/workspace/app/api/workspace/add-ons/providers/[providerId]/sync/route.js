/**
 * POST /api/workspace/add-ons/[providerId]/sync
 *
 * Provider-account (not product) sync. Provider-agnostic: if the provider
 * declares an `accountProbe`, this performs a real account-management-lane probe
 * (HTTP Basic) and only writes `verified` on a live success. A configured-but-
 * unprovable account (e.g. a third-party Upstash account with no Developer API)
 * is recorded as `account-linked` — a weaker, honest state — never `verified`.
 *
 * Products still prove themselves independently via the product sync route; a
 * verified provider account does not imply any product is installed.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  listProviderProductReadiness,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function envValue(key) {
  return clean(process.env[key]);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function safeUrl(baseUrl, path) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  const suffix = clean(path).startsWith("/") ? clean(path) : `/${clean(path)}`;
  return `${base}${suffix}`;
}

/**
 * Live account-management probe via HTTP Basic. Returns:
 *   { ok:true, ... }                  → verified (live success)
 *   { ok:false, syncStatus:"account-linked" } → creds absent / Developer API N/A
 *   { ok:false }                      → creds present but probe rejected
 */
async function probeProviderAccount(provider, now) {
  const probe = provider.accountProbe;
  if (!probe?.emailEnv || !probe?.keyEnv) {
    return { ok: false, syncStatus: "account-linked", testedAt: now };
  }
  const email = envValue(probe.emailEnv);
  const key = envValue(probe.keyEnv);
  if (!email || !key) {
    return {
      ok: false,
      syncStatus: "account-linked",
      status: "connected",
      testedAt: now,
      proof: `${provider.label} account linked via provider console (no ${probe.emailEnv}/${probe.keyEnv} for a live account-API probe).`,
      summary: `${provider.label} account linked. Products verify their own credentials on install.`,
    };
  }
  const authHeader = `Basic ${Buffer.from(`${email}:${key}`).toString("base64")}`;
  const paths = Array.isArray(probe.paths) && probe.paths.length ? probe.paths : ["/v2"];
  let last = null;
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(provider.baseUrl, path), {
        method: "GET",
        headers: { authorization: authHeader, accept: "application/json" },
      });
      last = { status: response.status, path };
      if (response.ok) {
        return {
          ok: true,
          testedAt: now,
          proof: `${provider.label} Developer API account verified (GET ${path} → HTTP ${response.status}).`,
          summary: `${provider.label} provider account verified via live account-API probe.`,
        };
      }
    } catch (err) {
      last = { status: 0, path, error: err?.message || "network error" };
    }
  }
  const detail = last ? `${last.path} → HTTP ${last.status}` : "no endpoint responded";
  return {
    ok: false,
    testedAt: now,
    proof: `${provider.label} account-API probe failed: ${detail}.`,
    summary: `${provider.label} account-API probe failed: ${detail}.`,
  };
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const now = new Date().toISOString();
  const readiness = listProviderProductReadiness(provider.providerId, process.env);
  const configured = readiness.filter((item) => item.configured);
  const syncResult = await probeProviderAccount(provider, now);

  // Hard failure (creds present but rejected) → blocked, do not write verified.
  if (!syncResult.ok && syncResult.syncStatus !== "account-linked") {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-provider-sync",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
      summary: syncResult.summary || `${provider.label} account probe failed`,
      policyVerdict: { ok: false, violationCodes: ["provider_account_probe_failed"] },
      nextActions: [`Verify the ${provider.label} account credentials, then retry provider sync.`],
    });
    return jsonError(syncResult.summary || "provider account probe failed", 502, { providerId: provider.providerId });
  }

  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const verified = syncResult.ok === true;
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
    nextActions: [`Install ${provider.label} products from the marketplace page. Product sync verifies each product's credential refs server-side.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    verified,
    accountState: verified ? "verified" : "account-linked",
    workspaceConfig: persisted,
    connectedProducts: configured.map((item) => ({ productId: item.productId, integrationId: item.integrationId, label: item.label })),
    readiness,
    sync: syncResult,
    receiptId: receipt.receiptId,
  });
}

export { POST };
