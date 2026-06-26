import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getUpstashProduct,
  listUpstashProductReadiness,
  UPSTASH_REGION_OPTIONS,
  withUpstashProductRegistry
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar } from "@/lib/server-secrets";

const PROBE_TIMEOUT_MS = 8000;

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

// Canonical concrete-key read — same contract as readiness + schedule runtime.
function envValue(key) {
  return clean(readEnvVar(key, process.env)?.value || "");
}

function selectedQstashRegion(region) {
  return UPSTASH_REGION_OPTIONS.find((option) => option.id === region) || UPSTASH_REGION_OPTIONS[0];
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

async function probeUpstashProduct(productId, region) {
  const product = getUpstashProduct(productId);
  if (!product) {
    return { ok: false, status: 400, error: "unknown Upstash product" };
  }
  const readiness = listUpstashProductReadiness(process.env).find((item) => item.productId === product.productId);
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
    return { ok: false, status: 400, error: "unsupported Upstash product probe" };
  }
  const regionOption = selectedQstashRegion(region);
  const configuredUrl = envValue(probe.baseUrlEnv) || (probe.fallbackRegionBaseUrl ? regionOption.baseUrl : "");
  return probeJsonPaths({
    baseUrl: configuredUrl,
    token: envValue(probe.tokenEnv),
    paths: probe.paths,
    label: product.label,
  });
}

async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const productId = clean(body.productId || "upstash-qstash");
  const region = clean(body.region || "us-east-1");
  const plan = clean(body.plan || "free");
  const product = getUpstashProduct(productId);
  if (!product) return jsonError("unknown Upstash product", 400, { productId });

  const syncResult = await probeUpstashProduct(product.productId, region);
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
        : [`Open the ${product.label} provider console, verify the product connection, then retry sync.`]
    });
    return jsonError(syncResult.error || syncResult.summary || "Upstash sync failed", syncResult.status || 502, {
      productId: product.productId,
      missingEnv: syncResult.missingEnv || [],
      sync: {
        ok: false,
        proof: syncResult.proof || "",
        summary: syncResult.summary || "",
      }
    });
  }

  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withUpstashProductRegistry(currentConfig, {
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
    nextActions: product.productId === "upstash-qstash"
      ? ["Workflow Canvas can now bind QStash/Workflow from the installed product card."]
      : ["Use this workspace add-on from the relevant data/retrieval surfaces."]
  });

  return NextResponse.json({
    ok: true,
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
