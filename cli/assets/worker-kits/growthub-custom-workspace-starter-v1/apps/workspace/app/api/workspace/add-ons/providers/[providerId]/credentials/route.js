import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";
import { buildCapabilityProbeRequests } from "@/lib/capability-binding";

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

function safeUrl(baseUrl, pathName) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  const suffix = clean(pathName).startsWith("/") ? clean(pathName) : `/${clean(pathName)}`;
  return `${base}${suffix}`;
}

function compactAccountOptions(payload, source, fallbackEmail) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.teams)
      ? payload.teams
      : Array.isArray(payload?.accounts)
        ? payload.accounts
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  const options = rawItems
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
  if (options.length) return options;
  return fallbackEmail ? [{ id: fallbackEmail, label: fallbackEmail, source }] : [];
}

function getProviderSetupFields(provider) {
  const fields = Array.isArray(provider.accountSetupFields) ? provider.accountSetupFields.filter((field) => field?.id) : [];
  if (fields.length) return fields;
  const emailEnv = provider.accountProbe?.emailEnv;
  const keyEnv = provider.accountProbe?.keyEnv;
  if (!emailEnv || !keyEnv) return [];
  return [
    { id: "email", label: "Account email", required: true, envRef: emailEnv, credentialRole: "basicAuthUsername" },
    { id: "apiKey", label: "API key", required: true, envRef: keyEnv, credentialRole: "basicAuthPassword" },
  ];
}

function getCredentialValue(credentials, body, field) {
  return clean(credentials?.[field.id] ?? body?.[field.id]);
}

function deriveBasicAuthCredentials(provider, credentials, body) {
  const fields = getProviderSetupFields(provider);
  const usernameField = fields.find((field) => field.credentialRole === "basicAuthUsername");
  const passwordField = fields.find((field) => field.credentialRole === "basicAuthPassword");
  const username = clean(
    usernameField ? getCredentialValue(credentials, body, usernameField) : credentials?.email ?? body?.email,
  );
  const password = clean(
    passwordField ? getCredentialValue(credentials, body, passwordField) : credentials?.apiKey ?? body?.apiKey,
  );
  return { fields, usernameField, passwordField, username, password };
}

function deriveEnvUpdates(fields, credentials, body) {
  return Object.fromEntries(fields
    .filter((field) => field.envRef)
    .map((field) => [field.envRef, getCredentialValue(credentials, body, field)])
    .filter(([, value]) => value));
}

async function verifyProviderAccount(provider, email, apiKey) {
  const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
  const paths = ["/v2/teams", ...(Array.isArray(provider.accountProbe?.paths) ? provider.accountProbe.paths : [])];
  let last = null;
  for (const probePath of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(provider.baseUrl, probePath), {
        method: "GET",
        headers: { authorization: authHeader, accept: "application/json" },
      });
      last = { path: probePath, status: response.status };
      if (!response.ok) continue;
      const payload = await readJsonSafe(response);
      const options = compactAccountOptions(payload, probePath, email);
      return { ok: true, path: probePath, status: response.status, options };
    } catch (error) {
      last = { path: probePath, status: 0, error: error?.message || "network error" };
    }
  }
  return { ok: false, last };
}

async function deriveUpstashQstashRuntimeEnv(provider, email, apiKey) {
  if (provider?.providerId !== "upstash") return { updates: {}, resolvedEnv: [] };
  const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
  const userResponse = await fetchWithTimeout(safeUrl(provider.baseUrl, "/v2/qstash/user"), {
    method: "GET",
    headers: { authorization: authHeader, accept: "application/json" },
  });
  if (!userResponse.ok) return { updates: {}, resolvedEnv: [] };
  const userPayload = await readJsonSafe(userResponse);
  const token = clean(userPayload?.token);
  if (!token) return { updates: {}, resolvedEnv: [] };

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
  return { updates, resolvedEnv: Object.keys(updates) };
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
  const keys = Object.keys(updates);
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

  const credentials = body && typeof body.credentials === "object" && !Array.isArray(body.credentials)
    ? body.credentials
    : {};

  // Scheme-aware credential save for the real provider universe (bearer / custom-
  // header / basic-via-auth-atom). Upstash (legacy HTTP-Basic Developer API with
  // emailEnv+keyEnv, no `auth` atom) falls through to the original path below.
  const useSchemeAware = Boolean(provider.auth) && !(provider.accountProbe?.emailEnv && provider.accountProbe?.keyEnv);
  if (useSchemeAware) {
    const schemeFields = getProviderSetupFields(provider);
    const missingSchemeFields = schemeFields
      .filter((field) => field.required && !getCredentialValue(credentials, body, field))
      .map((field) => field.id);
    if (!schemeFields.length || missingSchemeFields.length) {
      return jsonError(`${provider.label} account credentials are required`, 400, { providerId: provider.providerId, missingFields: missingSchemeFields });
    }
    // Persist the entered env refs first (server-side, never echoed), then verify
    // through the same shared, unit-tested probe builder the sync routes use.
    const schemeEnvUpdates = deriveEnvUpdates(schemeFields, credentials, body);
    await writeLocalEnv(schemeEnvUpdates);
    const built = buildCapabilityProbeRequests(provider.accountProbe || {}, provider, process.env);
    if (!built.ok) {
      return jsonError(`${provider.label} account credentials are incomplete`, 422, { providerId: provider.providerId, missingEnv: built.missingEnv });
    }
    let last = null;
    let verified = false;
    for (const req of built.requests) {
      try {
        const response = await fetchWithTimeout(req.url, { method: req.method, headers: req.headers, ...(req.body ? { body: req.body } : {}) });
        last = { path: req.url, status: response.status };
        if (response.ok) { verified = true; break; }
      } catch (error) {
        last = { path: req.url, status: 0, error: error?.message || "network error" };
      }
    }
    if (!verified) {
      return jsonError(`${provider.label} account API key could not be verified`, 422, {
        providerId: provider.providerId,
        checked: last ? { path: last.path, status: last.status } : null,
      });
    }
    const now = new Date().toISOString();
    const syncResult = {
      ok: true,
      syncStatus: "verified",
      status: "connected",
      testedAt: now,
      proof: `${provider.label} account verified (GET ${last.path} -> HTTP ${last.status}).`,
      summary: `${provider.label} provider account verified and stored as local runtime env refs.`,
      resolvedEnv: built.resolvedEnv || Object.keys(schemeEnvUpdates),
      providerAccountOptions: [],
      selectedProviderAccountId: "",
      selectedProviderAccountLabel: "",
      providerAccountSource: last.path,
    };
    const currentConfig = await readWorkspaceConfig();
    const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
    const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
    const { receipt } = await appendOutcomeReceipt({
      kind: "workspace-add-on-provider-credentials",
      lane: "server-authoritative",
      outcomeStatus: "published",
      actor: "workspace-marketplace",
      objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
      changedFields: ["dataModel.api-registry"],
      policyVerdict: { ok: true },
      schemaVerdict: { ok: true },
      summary: syncResult.summary,
      nextActions: [`Install ${provider.label} products from the marketplace page.`],
    });
    return NextResponse.json({
      ok: true,
      providerId: provider.providerId,
      accountState: "verified",
      workspaceConfig: persisted,
      resolvedEnv: syncResult.resolvedEnv,
      receiptId: receipt.receiptId,
    });
  }

  const { fields, usernameField, passwordField, username: email, password: apiKey } = deriveBasicAuthCredentials(provider, credentials, body);
  const missingFields = fields
    .filter((field) => field.required && !getCredentialValue(credentials, body, field))
    .map((field) => field.id);
  const envUpdates = deriveEnvUpdates(fields, credentials, body);
  const emailEnv = usernameField?.envRef || provider.accountProbe?.emailEnv;
  const keyEnv = passwordField?.envRef || provider.accountProbe?.keyEnv;
  if (!fields.length || !emailEnv || !keyEnv) return jsonError("provider does not support account credential setup", 400);
  if (missingFields.length || !email || !apiKey) {
    return jsonError(`${provider.label} account credentials are required`, 400, {
      providerId: provider.providerId,
      missingFields,
    });
  }

  const verified = await verifyProviderAccount(provider, email, apiKey);
  if (!verified.ok) {
    return jsonError(`${provider.label} account API key could not be verified`, 422, {
      providerId: provider.providerId,
      checked: verified.last ? { path: verified.last.path, status: verified.last.status } : null,
    });
  }

  const qstashRuntime = await deriveUpstashQstashRuntimeEnv(provider, email, apiKey);
  const envToWrite = {
    ...(Object.keys(envUpdates).length ? envUpdates : { [emailEnv]: email, [keyEnv]: apiKey }),
    ...qstashRuntime.updates,
  };
  await writeLocalEnv(envToWrite);

  const selected = verified.options[0] || { id: email, label: email };
  const now = new Date().toISOString();
  const syncResult = {
    ok: true,
    syncStatus: "verified",
    status: "connected",
    testedAt: now,
    proof: `${provider.label} Developer API account verified (GET ${verified.path} -> HTTP ${verified.status}).`,
    summary: `${provider.label} provider account verified and stored as local runtime env refs.`,
    resolvedEnv: Array.from(new Set([emailEnv, keyEnv, ...(qstashRuntime.resolvedEnv || [])])),
    providerAccountOptions: verified.options,
    selectedProviderAccountId: selected.id || "",
    selectedProviderAccountLabel: selected.label || "",
    providerAccountSource: verified.path,
  };
  const currentConfig = await readWorkspaceConfig();
  const nextConfig = withMarketplaceProviderRegistry(currentConfig, { providerId: provider.providerId, syncResult });
  const persisted = await writeWorkspaceConfig({ dataModel: nextConfig.dataModel });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-provider-credentials",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: provider.label }],
    changedFields: ["dataModel.api-registry"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: syncResult.summary,
    nextActions: [`Install ${provider.label} products from the marketplace page.`],
  });

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    accountState: "verified",
    workspaceConfig: persisted,
    accountOptions: verified.options,
    resolvedEnv: Array.from(new Set([emailEnv, keyEnv, ...(qstashRuntime.resolvedEnv || [])])),
    receiptId: receipt.receiptId,
  });
}

export { POST };
