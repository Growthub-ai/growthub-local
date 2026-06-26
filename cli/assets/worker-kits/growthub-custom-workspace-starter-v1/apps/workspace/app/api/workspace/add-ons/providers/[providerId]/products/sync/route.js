import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  listProviderProductReadiness,
  withMarketplaceProductRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";

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

function selectedRegion(product, region) {
  const regionOptions = Array.isArray(product?.regionOptions) ? product.regionOptions : [];
  return regionOptions.find((option) => option.id === region)
    || regionOptions[0]
    || { id: region, label: region, baseUrl: "" };
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function readProbeText(response) {
  try {
    return clean(await response.text()).slice(0, 240);
  } catch {
    return "";
  }
}

function safeUrl(baseUrl, path) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  const suffix = clean(path).startsWith("/") ? clean(path) : `/${clean(path)}`;
  return `${base}${suffix}`;
}

async function probeJsonPaths({ baseUrl, token, paths, label }) {
  let last = null;
  for (const path of paths) {
    const url = safeUrl(baseUrl, path);
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    const text = await readProbeText(response);
    last = { status: response.status, path, text };
    if (response.ok) {
      return {
        ok: true,
        baseUrl,
        testedAt: new Date().toISOString(),
        proof: `${label} probe ${path} returned HTTP ${response.status}`,
        summary: `${label} sync verified with a read-only REST probe (${path}).`,
      };
    }
  }
  const details = last ? `${last.path} returned HTTP ${last.status}` : "no endpoint returned";
  return {
    ok: false,
    baseUrl,
    testedAt: new Date().toISOString(),
    proof: `${label} probe failed: ${details}`,
    summary: `${label} REST probe failed: ${details}.`,
  };
}

async function probeProviderProduct({ providerId, productId, region }) {
  const product = getMarketplaceProduct(providerId, productId);
  if (!product) return { ok: false, status: 400, error: "unknown provider product" };

  const readiness = listProviderProductReadiness(providerId, process.env).find((item) => item.productId === product.productId);
  if (!readiness?.configured) {
    return {
      ok: false,
      status: 422,
      error: `${product.label} provider credentials are not connected`,
      missingEnv: readiness?.missingEnv || product.requiredEnv,
      summary: `${product.label} provider credentials are not connected. Complete provider setup, then sync again.`,
    };
  }

  const probe = product.probe || {};
  if (!probe.baseUrlEnv || !probe.tokenEnv || !Array.isArray(probe.paths) || !probe.paths.length) {
    return { ok: false, status: 400, error: "unsupported provider product probe" };
  }
  const regionOption = selectedRegion(product, region);
  const configuredUrl = envValue(probe.baseUrlEnv) || (probe.fallbackRegionBaseUrl ? regionOption.baseUrl : "");
  return probeJsonPaths({
    baseUrl: configuredUrl,
    token: envValue(probe.tokenEnv),
    paths: probe.paths,
    label: product.label,
  });
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const productId = clean(body.productId);
  const region = clean(body.region || "us-east-1");
  const plan = clean(body.plan || "free");
  const product = getMarketplaceProduct(provider.providerId, productId);
  if (!product) return jsonError("unknown provider product", 400, { providerId: provider.providerId, productId });

  const syncResult = await probeProviderProduct({ providerId: provider.providerId, productId: product.productId, region });
  if (!syncResult.ok) {
    await appendOutcomeReceipt({
      kind: "workspace-add-on-sync",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
      summary: syncResult.summary || syncResult.error || `${product.label} sync failed`,
      policyVerdict: { ok: false, violationCodes: syncResult.missingEnv?.length ? ["provider_product_not_connected"] : ["provider_probe_failed"] },
      nextActions: syncResult.missingEnv?.length
        ? [`Complete ${product.label} setup from the provider marketplace flow, then sync again.`]
        : [`Open the ${product.label} provider console, verify the product connection, then retry sync.`],
    });
    return jsonError(syncResult.error || syncResult.summary || "Provider product sync failed", syncResult.status || 502, {
      providerId: provider.providerId,
      productId: product.productId,
      missingEnv: syncResult.missingEnv || [],
      sync: {
        ok: false,
        proof: syncResult.proof || "",
        summary: syncResult.summary || "",
      },
    });
  }

  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withMarketplaceProductRegistry(currentConfig, {
    providerId: provider.providerId,
    productId: product.productId,
    region,
    plan,
    syncResult,
  });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-sync",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: product.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `${product.label} installed after provider sync probe.`,
    nextActions: product.capabilities?.includes("workflow")
      ? [`Workflow Canvas can now bind ${product.shortLabel || product.label} from the installed product card.`]
      : ["Use this workspace add-on from the relevant governed workspace surfaces."],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    productId: product.productId,
    workspaceConfig: persisted,
    sync: {
      ok: true,
      proof: syncResult.proof,
      summary: syncResult.summary,
      testedAt: syncResult.testedAt,
    },
    receiptId: receipt.receiptId,
  });
}

export { POST };
