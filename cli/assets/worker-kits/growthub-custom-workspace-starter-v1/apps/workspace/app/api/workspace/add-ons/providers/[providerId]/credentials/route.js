import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  getMarketplaceProvider,
  providerAccountAuthMode,
  withMarketplaceProviderRegistry,
} from "@/lib/workspace-add-ons";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
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

function safeUrl(baseUrl, pathName) {
  const base = clean(baseUrl).replace(/\/+$/, "");
  const suffix = clean(pathName).startsWith("/") ? clean(pathName) : `/${clean(pathName)}`;
  return `${base}${suffix}`;
}

function normalizeSupabaseProjectUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.replace(/\.supabase\.com$/i, ".supabase.co");
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\.supabase\.com(\/)?$/i, ".supabase.co");
  }
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
          : payload?.user && typeof payload.user === "object"
            ? [payload.user]
            : [];
  const options = rawItems
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const id = clean(item.id || item.team_id || item.teamId || item.account_id || item.accountId || item.uid || item.slug || item.username || item.name || `account-${index + 1}`);
      const label = clean(item.name || item.team_name || item.teamName || item.username || item.email || item.slug || id);
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

function looksLikeSupabasePublishableKey(value) {
  return /^sb_publishable_/i.test(clean(value));
}

/** Bearer-token account verification (e.g. Vercel REST API, Supabase
 * Management API). Probe paths come from the provider's accountProbe
 * contract — no hardcoded provider endpoints here. */
async function verifyBearerProviderAccount(provider, token) {
  const probe = provider.accountProbe || {};
  const paths = Array.isArray(probe.paths) && probe.paths.length ? probe.paths : ["/v2/user"];
  const probeBaseUrl = (probe.baseUrlEnv ? clean(readEnvVar(probe.baseUrlEnv, process.env)?.value || "") : "") || provider.baseUrl;
  let last = null;
  for (const probePath of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(probeBaseUrl, probePath), {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      last = { path: probePath, status: response.status };
      if (!response.ok) continue;
      const payload = await readJsonSafe(response);
      const options = compactAccountOptions(payload, probePath, "");
      return { ok: true, path: probePath, status: response.status, options };
    } catch (error) {
      last = { path: probePath, status: 0, error: error?.message || "network error" };
    }
  }
  return { ok: false, last };
}

/**
 * Direct project probe fallback for bearer providers: no management token,
 * but the product base URL + secret verify the bound project itself
 * (accountProbe.fallback declares the header shape and paths).
 */
async function verifyProviderProjectFallback(provider, baseUrl, secret) {
  const fallback = provider.accountProbe?.fallback || {};
  const paths = Array.isArray(fallback.paths) && fallback.paths.length ? fallback.paths : ["/"];
  const headerName = clean(fallback.tokenHeaderName);
  let host = clean(baseUrl);
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* keep raw value */
  }
  let last = null;
  for (const probePath of paths) {
    try {
      const response = await fetchWithTimeout(safeUrl(baseUrl, probePath), {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          ...(headerName ? { [headerName]: secret } : {}),
          accept: "application/json",
        },
      });
      last = { path: probePath, status: response.status };
      if (!response.ok) continue;
      return { ok: true, path: probePath, status: response.status, options: [{ id: host, label: host, source: probePath }] };
    } catch (error) {
      last = { path: probePath, status: 0, error: error?.message || "network error" };
    }
  }
  return { ok: false, last };
}

async function verifySupabasePublicProject(baseUrl, key) {
  if (!key) return { ok: false, last: null };
  const projectUrl = normalizeSupabaseProjectUrl(baseUrl);
  try {
    const response = await fetchWithTimeout(safeUrl(projectUrl, "/auth/v1/health"), {
      method: "GET",
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        accept: "application/json",
      },
    });
    if (response.ok) {
      let host = projectUrl;
      try {
        host = new URL(projectUrl).host;
      } catch {
        /* keep raw value */
      }
      return { ok: true, path: "/auth/v1/health", status: response.status, options: [{ id: host, label: host, source: "/auth/v1/health" }] };
    }
    return { ok: false, last: { path: "/auth/v1/health", status: response.status } };
  } catch (error) {
    return { ok: false, last: { path: "/auth/v1/health", status: 0, error: error?.message || "network error" } };
  }
}

async function handleBearerCredentials(request, provider, credentials, body) {
  const fields = getProviderSetupFields(provider);
  const tokenField = fields.find((field) => field.credentialRole === "bearerToken");
  const teamField = fields.find((field) => field.credentialRole === "teamScope");
  const baseUrlField = fields.find((field) => field.credentialRole === "baseUrl");
  const secretField = fields.find((field) => field.credentialRole === "secret");
  const tokenEnv = tokenField?.envRef || provider.accountProbe?.tokenEnv;
  if (!tokenField || !tokenEnv) return jsonError("provider does not support account credential setup", 400);
  const token = getCredentialValue(credentials, body, tokenField);
  const teamId = teamField ? getCredentialValue(credentials, body, teamField) : "";
  const projectUrl = baseUrlField ? normalizeSupabaseProjectUrl(getCredentialValue(credentials, body, baseUrlField)) : "";
  const projectSecret = secretField ? getCredentialValue(credentials, body, secretField) : "";
  const publishableField = fields.find((field) => field.credentialRole === "publishableKey");
  const publishableKey = publishableField ? getCredentialValue(credentials, body, publishableField) : "";
  if (token && looksLikeSupabasePublishableKey(token)) {
    return jsonError(
      `${provider.label} publishable key was entered as a personal access token. Use an sbp_ personal access token for account discovery, or bind directly with the project URL plus service role key.`,
      422,
      {
        providerId: provider.providerId,
        code: "publishable_key_in_access_token",
        repairPlan: [
          "Move the sb_publishable_ key to the optional publishable key field.",
          "Enter a Supabase personal access token that starts with sbp_, or enter the project URL and service role key.",
        ],
      },
    );
  }
  // Providers that declare accountProbe.fallback (e.g. Supabase) can verify a
  // single bound project with its URL + secret when no management token is
  // supplied — same persistence tail either way.
  const hasProjectFallback = Boolean(provider.accountProbe?.fallback && baseUrlField && secretField);
  if (!token && !(hasProjectFallback && projectUrl && projectSecret)) {
    return jsonError(
      hasProjectFallback
        ? `${provider.label} needs a personal access token, or a project URL plus its service key`
        : `${provider.label} account credentials are required`,
      400,
      {
        providerId: provider.providerId,
        missingFields: hasProjectFallback
          ? [tokenField.id, baseUrlField.id, secretField.id]
          : [tokenField.id],
      },
    );
  }

  let verified = token ? await verifyBearerProviderAccount(provider, token) : null;
  let accountSource = verified?.ok ? "management-api" : "";
  if (!verified?.ok && hasProjectFallback && projectUrl && projectSecret) {
    const fallbackVerified = await verifyProviderProjectFallback(provider, projectUrl, projectSecret);
    if (fallbackVerified.ok || !verified) verified = fallbackVerified;
    if (fallbackVerified.ok) accountSource = "project-probe";
  }
  if (!verified?.ok && provider.providerId === "supabase" && projectUrl && (publishableKey || projectSecret)) {
    const publicVerified = await verifySupabasePublicProject(projectUrl, publishableKey || projectSecret);
    if (publicVerified.ok || !verified) verified = publicVerified;
    if (publicVerified.ok) accountSource = "project-probe";
  }
  if (!verified?.ok) {
    return jsonError(`${provider.label} ${token ? "access token" : "project binding"} could not be verified`, 422, {
      providerId: provider.providerId,
      checked: verified?.last ? { path: verified.last.path, status: verified.last.status } : null,
    });
  }

  const envToWrite = deriveEnvUpdates(fields, credentials, body);
  if (accountSource === "project-probe" && provider.providerId === "supabase" && (publishableKey || projectSecret)) {
    envToWrite.SUPABASE_URL = projectUrl;
    envToWrite.SUPABASE_ANON_KEY = publishableKey || projectSecret;
    if (!publishableKey && envToWrite.SUPABASE_SERVICE_ROLE_KEY === projectSecret) delete envToWrite.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (token) envToWrite[tokenEnv] = token;
  if (teamField?.envRef && teamId) envToWrite[teamField.envRef] = teamId;
  // Declared alias writes (e.g. SUPABASE_API_KEY ← SUPABASE_SERVICE_ROLE_KEY)
  // so the canonical authRef candidate expansion resolves the product key.
  for (const [alias, source] of Object.entries(provider.accountProbe?.aliasEnv || {})) {
    if (!envToWrite[alias] && envToWrite[source]) envToWrite[alias] = envToWrite[source];
  }
  await writeLocalEnv(envToWrite);

  const selected = verified.options.find((option) => teamId && option.id === teamId) || verified.options[0] || null;
  const now = new Date().toISOString();
  const syncResult = {
    ok: true,
    syncStatus: "verified",
    status: "connected",
    testedAt: now,
    proof: accountSource === "project-probe"
      ? `${provider.label} project verified (GET ${verified.path} -> HTTP ${verified.status}).`
      : `${provider.label} REST API account verified (GET ${verified.path} -> HTTP ${verified.status}).`,
    summary: accountSource === "project-probe"
      ? `${provider.label} provider project binding verified and stored as local runtime env refs.`
      : `${provider.label} provider account verified and stored as local runtime env refs.`,
    resolvedEnv: Object.keys(envToWrite),
    providerAccountOptions: verified.options,
    selectedProviderAccountId: selected?.id || teamId || "",
    selectedProviderAccountLabel: selected?.label || "",
    providerAccountSource: accountSource === "project-probe" ? "project-probe" : verified.path,
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
    resolvedEnv: Object.keys(envToWrite),
    receiptId: receipt.receiptId,
  });
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
  if (providerAccountAuthMode(provider) === "bearer") {
    return handleBearerCredentials(request, provider, credentials, body);
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
