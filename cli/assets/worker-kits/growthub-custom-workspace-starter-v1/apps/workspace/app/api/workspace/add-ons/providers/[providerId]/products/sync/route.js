import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  getProviderProductDiscovery,
  listProviderProductReadiness,
  makeDiscoveredMarketplaceProduct,
  resolveProviderAccountAuth,
  withDiscoveredMarketplaceProductRegistry,
  withMarketplaceProductRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { readEnvVar, resolveRequiredEnv } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// Canonical concrete-key read — same contract as readiness + schedule runtime.
function envValue(key) {
  return clean(readEnvVar(key, process.env)?.value || "");
}

function selectedRegion(product, region) {
  const regionOptions = Array.isArray(product?.regionOptions) ? product.regionOptions : [];
  return regionOptions.find((option) => option.id === region)
    || (region ? { id: region, label: region, baseUrl: `https://qstash-${region}.upstash.io` } : null)
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

function quoteEnv(value) {
  return JSON.stringify(String(value || ""));
}

async function writeLocalEnv(updates) {
  const envPath = path.join(process.cwd(), ".env.local");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const keys = Object.keys(updates).filter((key) => updates[key] && process.env[key] !== updates[key]);
  if (!keys.length) return [];
  const seen = new Set();
  const lines = raw.split(/\n/).map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !keys.includes(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${quoteEnv(updates[match[1]])}`;
  });
  for (const key of keys) {
    if (!seen.has(key)) lines.push(`${key}=${quoteEnv(updates[key])}`);
    process.env[key] = updates[key];
  }
  await fs.writeFile(envPath, `${lines.filter((line, index) => index < lines.length - 1 || line.trim()).join("\n")}\n`, "utf8");
  return keys;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["databases", "indexes", "indices", "schedules", "queues", "resources", "items", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function resourceId(item, index) {
  return clean(
    item?.database_id
      || item?.databaseId
      || item?.id
      || item?.uuid
      || item?.customer_id
      || item?.customerId
      || item?.created_by
      || item?.createdBy
      || item?.index_id
      || item?.indexId
      || item?.index_name
      || item?.indexName
      || item?.name
      || item?.endpoint
      || `resource-${index + 1}`
  );
}

function resourceFieldValue(row, mapping) {
  const candidates = Array.isArray(mapping.fieldCandidates) && mapping.fieldCandidates.length
    ? mapping.fieldCandidates
    : [mapping.field].filter(Boolean);
  for (const field of candidates) {
    const value = clean(row?.[field]);
    if (!value) continue;
    if (mapping.ensureHttps && !/^https?:\/\//i.test(value)) return `https://${value}`;
    return value;
  }
  return "";
}

async function resolveProviderResource({ provider, product, selectedResourceId }) {
  const discovery = product?.resourceDiscovery || {};
  const envFromResource = Array.isArray(discovery.envFromResource) ? discovery.envFromResource : [];
  if (!selectedResourceId || discovery.auth !== "provider-basic" || !envFromResource.length) return { writtenEnv: [] };
  const emailKey = provider.accountProbe?.emailEnv;
  const apiKey = provider.accountProbe?.keyEnv;
  const email = envValue(emailKey);
  const apiKeyValue = envValue(apiKey);
  if (!email || !apiKeyValue) return { writtenEnv: [], missingProviderEnv: [emailKey, apiKey].filter(Boolean) };

  const authHeader = `Basic ${Buffer.from(`${email}:${apiKeyValue}`).toString("base64")}`;
  const paths = Array.isArray(discovery.paths) ? discovery.paths : [];
  const candidates = [];
  const failures = [];
  for (const probePath of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(provider.baseUrl, probePath), {
        method: "GET",
        headers: { authorization: authHeader, accept: "application/json" },
      });
      if (!response.ok) {
        failures.push({ path: probePath, status: response.status });
        continue;
      }
      const rows = pickArray(await readJsonSafe(response));
      rows.forEach((row, index) => candidates.push({ row, id: resourceId(row, index), source: probePath }));
    } catch (error) {
      failures.push({ path: probePath, status: 0, error: error?.message || "network error" });
    }
  }
  const selected = candidates.find((candidate) => candidate.id === selectedResourceId) || candidates[0] || null;
  if (!selected) return { writtenEnv: [], failures };
  const updates = {};
  for (const mapping of envFromResource) {
    const envRef = clean(mapping.envRef);
    const value = resourceFieldValue(selected.row, mapping);
    if (envRef && value) updates[envRef] = value;
  }
  const writtenEnv = await writeLocalEnv(updates);
  return { writtenEnv, resource: selected, failures };
}

async function probeJsonPaths({ baseUrl, token, paths, label, query = "" }) {
  let last = null;
  for (const path of paths) {
    const base = safeUrl(baseUrl, path);
    const url = query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
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
  const requiredEnv = resolveRequiredEnv(product.requiredEnv, process.env);
  if (!readiness?.configured || !requiredEnv.ok) {
    return {
      ok: false,
      status: 422,
      error: `${product.label} provider credentials are not connected`,
      missingEnv: requiredEnv.missing.length ? requiredEnv.missing : (readiness?.missingEnv || product.requiredEnv),
      resolvedEnv: requiredEnv.resolvedKeys,
      summary: `${product.label} provider credentials are not connected. Complete provider setup, then sync again.`,
    };
  }

  const probe = product.probe || {};
  if (!probe.baseUrlEnv || !probe.tokenEnv || !Array.isArray(probe.paths) || !probe.paths.length) {
    return { ok: false, status: 400, error: "unsupported provider product probe" };
  }
  const regionOption = selectedRegion(product, region);
  const configuredUrl = envValue(probe.baseUrlEnv)
    || (probe.fallbackRegionBaseUrl ? regionOption.baseUrl : "")
    || clean(probe.fallbackBaseUrl || "");
  // Team-scoped bearer tokens (e.g. Vercel team tokens) need the teamId query
  // on read probes; probe.teamEnv names the optional env ref.
  const teamId = probe.teamEnv ? envValue(probe.teamEnv) : "";
  const result = await probeJsonPaths({
    baseUrl: configuredUrl,
    token: envValue(probe.tokenEnv),
    paths: probe.paths,
    label: product.label,
    query: teamId ? `teamId=${encodeURIComponent(teamId)}` : "",
  });
  return {
    ...result,
    resolvedEnv: requiredEnv.resolvedKeys,
  };
}

function pickDiscoveryPayloadArray(payload, payloadKeys) {
  if (Array.isArray(payload)) return payload;
  for (const key of Array.isArray(payloadKeys) && payloadKeys.length ? payloadKeys : ["data", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

/**
 * Server-authoritative resolution of a DISCOVERED product (providers with a
 * declared `productDiscovery` contract, e.g. Nango integrations). The install
 * re-fetches the live account listing and only matches products that really
 * exist on the connected account — the browser payload is never trusted.
 */
async function resolveDiscoveredProduct(provider, productId) {
  const discovery = getProviderProductDiscovery(provider);
  if (!discovery) return { ok: false, status: 400, error: "unknown provider product" };
  const prefix = discovery.productDefaults?.productIdPrefix || `${provider.providerId}-`;
  if (!productId.startsWith(prefix)) return { ok: false, status: 400, error: "unknown provider product" };
  const account = resolveProviderAccountAuth(provider, process.env);
  if (!account.ready) {
    return {
      ok: false,
      status: 422,
      error: `${provider.label} provider credentials are not connected`,
      missingEnv: account.missingEnv,
      summary: `${provider.label} provider credentials are not connected. Complete provider setup, then sync again.`,
    };
  }
  const discoveryBaseUrl = (provider.accountProbe?.baseUrlEnv ? envValue(provider.accountProbe.baseUrlEnv) : "") || provider.baseUrl;
  let last = null;
  for (const path of discovery.paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(discoveryBaseUrl, path), {
        headers: { authorization: account.header, accept: "application/json" },
      });
      last = { path, status: response.status };
      if (!response.ok) continue;
      const items = pickDiscoveryPayloadArray(await readJsonSafe(response), discovery.payloadKeys);
      for (const item of items) {
        const product = makeDiscoveredMarketplaceProduct(provider, item);
        if (product?.productId === productId) return { ok: true, product, account };
      }
      return {
        ok: false,
        status: 404,
        error: `${provider.label} live discovery did not return ${productId} for the connected account`,
        summary: `${productId} is not available on the connected ${provider.label} account. Refresh the provider page and install an available integration.`,
      };
    } catch (error) {
      last = { path, status: 0, error: error?.message || "network error" };
    }
  }
  const detail = last ? `${last.path} returned HTTP ${last.status}` : "no discovery endpoint responded";
  return {
    ok: false,
    status: 502,
    error: `${provider.label} live product discovery failed`,
    summary: `${provider.label} live product discovery failed: ${detail}.`,
  };
}

async function probeDiscoveredProduct(product) {
  const requiredEnv = resolveRequiredEnv(product.requiredEnv, process.env);
  if (!requiredEnv.ok) {
    return {
      ok: false,
      status: 422,
      error: `${product.label} provider credentials are not connected`,
      missingEnv: requiredEnv.missing,
      resolvedEnv: requiredEnv.resolvedKeys,
      summary: `${product.label} provider credentials are not connected. Complete provider setup, then sync again.`,
    };
  }
  const probe = product.probe || {};
  if (!probe.tokenEnv || !Array.isArray(probe.paths) || !probe.paths.length) {
    return { ok: false, status: 400, error: "unsupported provider product probe" };
  }
  const configuredUrl = (probe.baseUrlEnv ? envValue(probe.baseUrlEnv) : "") || clean(probe.fallbackBaseUrl || "");
  const result = await probeJsonPaths({
    baseUrl: configuredUrl,
    token: envValue(probe.tokenEnv),
    paths: probe.paths,
    label: product.label,
  });
  return {
    ...result,
    resolvedEnv: requiredEnv.resolvedKeys,
  };
}

async function POST(request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }

  const productId = clean(body.productId);
  const region = clean(body.region || "us-east-1");
  const plan = clean(body.plan || "free");
  const selectedResourceId = clean(body.selectedResourceId);
  const selectedResourceLabel = clean(body.selectedResourceLabel);
  const selectedResourceSource = clean(body.selectedResourceSource);
  let product = getMarketplaceProduct(provider.providerId, productId);
  if (!product && getProviderProductDiscovery(provider)) {
    // Discovered-product install lane (live `productDiscovery` providers):
    // resolve the product from a real-time account fetch, probe it, then land
    // the governed row through the shared discovered-product upsert.
    const resolution = await resolveDiscoveredProduct(provider, productId);
    const discoveredSync = resolution.ok ? await probeDiscoveredProduct(resolution.product) : resolution;
    if (clean(body.selectedResourceLabel) && discoveredSync.ok) {
      discoveredSync.selectedResourceLabel = clean(body.selectedResourceLabel);
    }
    const discoveredLabel = resolution.product?.label || productId;
    if (!discoveredSync.ok) {
      await appendOutcomeReceipt({
        kind: "workspace-add-on-sync",
        lane: "server-authoritative",
        outcomeStatus: "blocked",
        actor: "workspace-marketplace",
        objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: discoveredLabel }],
        summary: discoveredSync.summary || discoveredSync.error || `${discoveredLabel} sync failed`,
        policyVerdict: { ok: false, violationCodes: [discoveredSync.missingEnv?.length ? "provider_product_not_connected" : "provider_probe_failed"] },
        nextActions: discoveredSync.missingEnv?.length
          ? [`Complete ${provider.label} provider setup from the marketplace flow, then sync again.`]
          : [`Open the ${provider.label} dashboard, verify the integration exists on the connected account, then retry sync.`],
      });
      return jsonError(discoveredSync.error || discoveredSync.summary || "Provider product sync failed", discoveredSync.status || 502, {
        providerId: provider.providerId,
        productId,
        missingEnv: discoveredSync.missingEnv || [],
        sync: { ok: false, proof: discoveredSync.proof || "", summary: discoveredSync.summary || "" },
      });
    }
    const currentConfig = await readWorkspaceConfig();
    const nextConfig = withDiscoveredMarketplaceProductRegistry(currentConfig, {
      providerId: provider.providerId,
      product: resolution.product,
      plan,
      syncResult: discoveredSync,
    });
    const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
    const { receipt } = await appendOutcomeReceipt({
      kind: "workspace-add-on-sync",
      lane: "server-authoritative",
      outcomeStatus: "published",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: discoveredLabel }],
      changedFields: ["dataModel.api-registry"],
      policyVerdict: { ok: true },
      schemaVerdict: { ok: true },
      summary: `${discoveredLabel} installed from live ${provider.label} discovery after provider sync probe.`,
      nextActions: [`Bind a connection to the ${discoveredLabel} registry row from the Data Model connection panel, then run governed API requests through it.`],
    });
    return NextResponse.json({
      ok: true,
      providerId: provider.providerId,
      productId,
      workspaceConfig: persisted,
      sync: {
        ok: true,
        proof: discoveredSync.proof,
        summary: discoveredSync.summary,
        testedAt: discoveredSync.testedAt,
      },
      receiptId: receipt.receiptId,
    });
  }
  if (!product) return jsonError("unknown provider product", 400, { providerId: provider.providerId, productId });

  const resourceResolution = await resolveProviderResource({ provider, product, selectedResourceId });
  const syncResult = await probeProviderProduct({ providerId: provider.providerId, productId: product.productId, region });
  if (selectedResourceId) {
    syncResult.selectedResourceId = selectedResourceId;
    syncResult.selectedResourceLabel = selectedResourceLabel || selectedResourceId;
    syncResult.selectedResourceSource = selectedResourceSource || "provider-account";
  }
  if (resourceResolution.writtenEnv?.length) {
    syncResult.resolvedEnv = Array.from(new Set([...(syncResult.resolvedEnv || []), ...resourceResolution.writtenEnv]));
  }
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
