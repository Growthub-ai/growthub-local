import { NextResponse } from "next/server";
import {
  getMarketplaceProvider,
  getMarketplaceProduct,
  providerAccountAuthMode,
  resolveProbePaths,
  resolveProviderAccountAuth,
} from "@/lib/workspace-add-ons";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
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

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeUrl(baseUrl, path) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  const suffix = clean(path).startsWith("/") ? clean(path) : `/${clean(path)}`;
  return `${base}${suffix}`;
}

function resourcePaths(product) {
  if (Array.isArray(product?.resourceDiscovery?.paths) && product.resourceDiscovery.paths.length) {
    return product.resourceDiscovery.paths;
  }
  const productId = product?.productId;
  if (productId === "upstash-redis") return ["/v2/redis/databases"];
  if (productId === "upstash-vector") return ["/v2/vector/index"];
  if (productId === "upstash-search") return ["/v2/search"];
  if (productId === "upstash-qstash") return ["/v2/qstash/users", "/v2/qstash/user"];
  return [];
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["databases", "indexes", "indices", "schedules", "queues", "resources", "projects", "items", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function normalizeResource(item, index, source) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const id = clean(
    item.database_id
      || item.databaseId
      || item.id
      || item.uuid
      || item.customer_id
      || item.customerId
      || item.created_by
      || item.createdBy
      || item.index_id
      || item.indexId
      || item.index_name
      || item.indexName
      || item.unique_key
      || item.uniqueKey
      || item.name
      || item.endpoint
      || `resource-${index + 1}`
  );
  const label = clean(
    item.database_name
      || item.databaseName
      || item.name
      || item.database_id
      || item.databaseId
      || item.index_name
      || item.indexName
      || item.display_name
      || item.displayName
      || item.provider
      || item.slug
      || item.region
      || item.type
      || item.id
      || item.customer_id
      || item.endpoint
      || item.url
      || id
  );
  if (!id || !label) return null;
  return {
    id,
    label,
    source,
    region: clean(item.region || item.primary_region || item.primaryRegion || ""),
    type: clean(item.type || item.kind || item.framework || ""),
    endpoint: clean(item.endpoint || item.url || item.rest_url || item.restUrl || ""),
  };
}

async function GET(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const productId = clean(params?.productId);
  const provider = getMarketplaceProvider(providerId);
  const product = getMarketplaceProduct(providerId, productId);
  if (!provider || !product) return jsonError("unknown provider product", 404, { providerId, productId });

  // Mode-aware account lane: basic (Upstash Developer API) or bearer (Vercel
  // REST API) — resolved from the provider's single accountProbe contract.
  const account = resolveProviderAccountAuth(provider, process.env);
  if (!account.ready) {
    return jsonError(`${provider.label} account auth is not connected`, 422, {
      providerId,
      productId,
      missingEnv: account.missingEnv,
      resolvedEnv: account.resolvedEnv,
      resources: [],
    });
  }

  const authHeader = account.header;
  // Team-scoped bearer tokens (e.g. Vercel team tokens) require the teamId
  // query on resource listings.
  const teamQuery = providerAccountAuthMode(provider) === "bearer" && account.teamId
    ? `${encodeURIComponent("teamId")}=${encodeURIComponent(account.teamId)}`
    : "";
  // Honor the provider's account-probe base override (self-hosted proxies,
  // offline QA smokes) — same contract as the product probe's baseUrlEnv.
  const discoveryBaseUrl = (provider.accountProbe?.baseUrlEnv
    ? clean(readEnvVar(provider.accountProbe.baseUrlEnv, process.env)?.value || "")
    : "") || provider.baseUrl;
  // Declared path-template contract (pathEnv): `{placeholder}` segments
  // resolve from named env refs server-side — account-scoped listings
  // (Cloudflare R2) fail honestly on a missing ref instead of fetching a
  // literal `{placeholder}` URL.
  const discoveryPaths = resolveProbePaths(
    { paths: resourcePaths(product), pathEnv: product.resourceDiscovery?.pathEnv || product.probe?.pathEnv },
    process.env,
  );
  if (!discoveryPaths.ok) {
    return jsonError(`${provider.label} resource discovery path refs are not resolved`, 422, {
      providerId,
      productId,
      missingEnv: discoveryPaths.missingEnv,
      resources: [],
    });
  }
  const resources = [];
  const failures = [];
  for (const path of discoveryPaths.paths) {
    try {
      const url = safeUrl(discoveryBaseUrl, path);
      const response = await fetchWithTimeout(teamQuery ? `${url}${url.includes("?") ? "&" : "?"}${teamQuery}` : url, {
        headers: { authorization: authHeader, accept: "application/json" },
      });
      if (!response.ok) {
        failures.push({ path, status: response.status });
        continue;
      }
      const rows = pickArray(await readJsonSafe(response));
      for (const [index, row] of rows.entries()) {
        const resource = normalizeResource(row, index, path);
        if (resource) resources.push(resource);
      }
      if (resources.length) break;
    } catch (error) {
      failures.push({ path, status: 0, error: error?.message || "network error" });
    }
  }

  return NextResponse.json({
    ok: true,
    providerId,
    productId: product.productId,
    resources,
    failures,
    resolvedEnv: account.resolvedEnv,
  });
}

export { GET };
