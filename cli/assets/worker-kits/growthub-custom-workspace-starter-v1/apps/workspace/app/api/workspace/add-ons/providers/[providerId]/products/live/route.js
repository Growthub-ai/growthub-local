/**
 * GET /api/workspace/add-ons/providers/[providerId]/products/live
 *
 * Live install-product discovery for providers that declare a
 * `productDiscovery` contract (e.g. Nango: one install product per available
 * integration on the connected account). Read-only and provider-agnostic —
 * the payload/field mapping comes entirely from the declared contract keys,
 * so a second dynamic provider joins with zero route changes. The browser
 * never calls the provider API; discovery runs server-side with the account
 * env refs and the response carries only non-secret product metadata.
 */

import { NextResponse } from "next/server";
import {
  getMarketplaceProvider,
  getProviderProductDiscovery,
  makeDiscoveredMarketplaceProduct,
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

function pickPayloadArray(payload, payloadKeys) {
  if (Array.isArray(payload)) return payload;
  for (const key of Array.isArray(payloadKeys) && payloadKeys.length ? payloadKeys : ["data", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function GET(request, context) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });
  const discovery = getProviderProductDiscovery(provider);
  if (!discovery) return jsonError("provider does not declare live product discovery", 404, { providerId, products: [] });

  const account = resolveProviderAccountAuth(provider, process.env);
  if (!account.ready) {
    return jsonError(`${provider.label} account auth is not connected`, 422, {
      providerId,
      missingEnv: account.missingEnv,
      resolvedEnv: account.resolvedEnv,
      products: [],
    });
  }

  // Honor the provider's account-probe base override (self-hosted deployments,
  // offline QA smokes) — same contract as the resources route.
  const discoveryBaseUrl = (provider.accountProbe?.baseUrlEnv
    ? clean(readEnvVar(provider.accountProbe.baseUrlEnv, process.env)?.value || "")
    : "") || provider.baseUrl;

  const products = [];
  const seen = new Set();
  const failures = [];
  for (const path of discovery.paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(discoveryBaseUrl, path), {
        headers: { authorization: account.header, accept: "application/json" },
      });
      if (!response.ok) {
        failures.push({ path, status: response.status });
        continue;
      }
      const items = pickPayloadArray(await readJsonSafe(response), discovery.payloadKeys);
      for (const item of items) {
        const product = makeDiscoveredMarketplaceProduct(provider, item);
        if (product && !seen.has(product.productId)) {
          seen.add(product.productId);
          products.push(product);
        }
      }
      if (products.length) break;
    } catch (error) {
      failures.push({ path, status: 0, error: error?.message || "network error" });
    }
  }

  return NextResponse.json({
    ok: true,
    providerId,
    products,
    failures,
    emptyLabel: discovery.emptyLabel || "No live products returned for this provider account.",
    resolvedEnv: account.resolvedEnv,
  });
}

export { GET };
