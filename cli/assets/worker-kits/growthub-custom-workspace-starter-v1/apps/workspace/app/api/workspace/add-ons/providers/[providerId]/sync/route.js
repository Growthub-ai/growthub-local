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

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  listProviderProductReadiness,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";
import { readEnvVar } from "@/lib/server-secrets";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function envValue(key) {
  return clean(readEnvVar(key, process.env)?.value || "");
}

function resolvedEnvKeys(keys) {
  return (Array.isArray(keys) ? keys : []).filter((key) => Boolean(readEnvVar(key, process.env)));
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

function compactAccountOptions(payload, source) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.teams)
      ? payload.teams
      : Array.isArray(payload?.accounts)
        ? payload.accounts
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  return rawItems
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const id = clean(item.id || item.team_id || item.teamId || item.account_id || item.accountId || item.slug || item.name || `account-${index + 1}`);
      const label = clean(item.name || item.team_name || item.teamName || item.email || item.slug || id);
      if (!id || !label) return null;
      return {
        id,
        label,
        source,
        role: clean(item.role || item.user_role || item.userRole || ""),
        plan: clean(item.plan || item.tier || ""),
      };
    })
    .filter(Boolean);
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

async function deriveUpstashQstashRuntimeEnv(provider, email, apiKey) {
  if (provider?.providerId !== "upstash") return { writtenEnv: [], resolvedEnv: [] };
  const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
  const userResponse = await fetchWithTimeout(safeUrl(provider.baseUrl, "/v2/qstash/user"), {
    method: "GET",
    headers: { authorization: authHeader, accept: "application/json" },
  });
  if (!userResponse.ok) return { writtenEnv: [], resolvedEnv: [] };
  const userPayload = await readJsonSafe(userResponse);
  const token = clean(userPayload?.token);
  if (!token) return { writtenEnv: [], resolvedEnv: [] };

  const updates = { QSTASH_TOKEN: token };
  const keysResponse = await fetchWithTimeout("https://qstash.upstash.io/v2/keys", {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (keysResponse.ok) {
    const keysPayload = await readJsonSafe(keysResponse);
    if (clean(keysPayload?.current)) updates.QSTASH_CURRENT_SIGNING_KEY = clean(keysPayload.current);
    if (clean(keysPayload?.next)) updates.QSTASH_NEXT_SIGNING_KEY = clean(keysPayload.next);
  }
  const writtenEnv = await writeLocalEnv(updates);
  return { writtenEnv, resolvedEnv: Object.keys(updates) };
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
    const required = [probe.emailEnv, probe.keyEnv];
    return {
      ok: false,
      syncStatus: "setup-required",
      status: "draft",
      missingEnv: required.filter((envKey) => !readEnvVar(envKey, process.env)),
      resolvedEnv: resolvedEnvKeys(required),
      testedAt: now,
      proof: "",
      summary: `${provider.label} account API credentials are required to show connected account details.`,
    };
  }
  const authHeader = `Basic ${Buffer.from(`${email}:${key}`).toString("base64")}`;
  const paths = ["/v2/teams", ...(Array.isArray(probe.paths) && probe.paths.length ? probe.paths : ["/v2"])];
  let last = null;
  let accountOptions = [];
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(provider.baseUrl, path), {
        method: "GET",
        headers: { authorization: authHeader, accept: "application/json" },
      });
      last = { status: response.status, path };
      if (response.ok) {
        const payload = await readJsonSafe(response);
        const options = compactAccountOptions(payload, path);
        if (options.length) accountOptions = options;
        const selected = accountOptions[0] || null;
        const runtimeCredentials = await deriveUpstashQstashRuntimeEnv(provider, email, key);
        return {
          ok: true,
          testedAt: now,
          proof: `${provider.label} Developer API account verified (GET ${path} → HTTP ${response.status}).`,
          summary: `${provider.label} provider account verified via live account-API probe.`,
          resolvedEnv: Array.from(new Set([...resolvedEnvKeys([probe.emailEnv, probe.keyEnv]), ...(runtimeCredentials.resolvedEnv || [])])),
          runtimeCredentials,
          providerAccountOptions: accountOptions,
          selectedProviderAccountId: selected?.id || "",
          selectedProviderAccountLabel: selected?.label || "",
          providerAccountSource: selected?.source || path,
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

  // Hard failure or missing account API credentials → blocked, do not write a
  // connected provider row. Product install may validate product credentials,
  // but provider-account setup is not complete without account details.
  if (!syncResult.ok) {
    const currentConfig = await readWorkspaceConfig();
    const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
    const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
    await appendOutcomeReceipt({
      kind: "workspace-add-on-provider-sync",
      lane: "server-authoritative",
      outcomeStatus: "blocked",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
      summary: syncResult.summary || `${provider.label} account probe failed`,
      policyVerdict: { ok: false, violationCodes: [syncResult.missingEnv?.length ? "provider_account_credentials_missing" : "provider_account_probe_failed"] },
      nextActions: [`Configure ${provider.label} account API credentials, then retry provider sync.`],
    });
    return jsonError(syncResult.summary || "provider account probe failed", syncResult.missingEnv?.length ? 422 : 502, {
      providerId: provider.providerId,
      missingEnv: syncResult.missingEnv || [],
      sync: {
        ok: false,
        summary: syncResult.summary || "",
        resolvedEnv: syncResult.resolvedEnv || [],
      },
      workspaceConfig: persisted,
    });
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
