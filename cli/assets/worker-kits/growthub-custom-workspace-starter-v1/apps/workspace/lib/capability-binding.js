/**
 * Governed Capability Binding — the pure request/auth layer that lets the whole
 * real provider universe flow through the SAME governed lanes the QStash
 * serverless scheduler proved (GOVERNED_CAPABILITY_BINDING_V1).
 *
 * QStash forged the atoms but hardcoded ONE assumption: the provider account
 * lane was HTTP-Basic `email:key` (`verifyProviderAccount` built
 * `Basic base64(email:key)` and prepended `/v2/teams`). The real universe is
 * bearer (Resend, Stripe, Vercel, Slack, GitHub, Notion, OpenAI, Cohere,
 * Cloudflare), basic (Twilio, Upstash), and custom-header (Postmark, Anthropic,
 * Pinecone, Supabase, Linear-raw). This module is the single downward-push that
 * generalizes that atom without touching the QStash wire path.
 *
 * Everything here is PURE and env-injectable (no fetch, no fs, no config
 * writes) so the whole auth/probe/action contract is deterministically testable
 * offline with `node --test`.
 *
 * SECRET RULE (unchanged): a token/key VALUE only ever appears inside the
 * returned `headers` (for a server-side fetch). `resolvedEnv` / `missingEnv`
 * carry KEY NAMES only — never a value — so the same result is safe to persist
 * in a row, a receipt, or a browser payload.
 */

import { readEnvVar } from "./server-secrets.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

const CAPABILITY_AUTH_SCHEMES = Object.freeze(["bearer", "basic", "header"]);

/**
 * Build the auth (and any required extra) headers for a provider/product from
 * its `auth` atom, resolving env KEYS to values server-side.
 *
 * @param {object} auth  the descriptor `auth` atom:
 *   { scheme: "bearer"|"basic"|"header", headerName, prefix?, tokenEnv?,
 *     userEnv?, passEnv?, extraHeaders? }
 * @param {object} env   injectable environment (defaults to process.env)
 * @returns {{ ok: boolean, headers: object, missingEnv: string[], resolvedEnv: string[], scheme: string }}
 *   `headers` includes the secret VALUE and is for server-side use only.
 *   `resolvedEnv`/`missingEnv` are KEY NAMES only.
 */
function buildProviderAuthHeaders(auth, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const scheme = clean(auth?.scheme).toLowerCase();
  const headers = {};
  const resolvedEnv = [];
  const missingEnv = [];

  // Extra, non-secret headers a provider requires (version pins, content-type,
  // accept). These are literal descriptor values — never secrets.
  if (auth?.extraHeaders && typeof auth.extraHeaders === "object") {
    for (const [name, value] of Object.entries(auth.extraHeaders)) {
      if (clean(name) && clean(value)) headers[clean(name).toLowerCase()] = clean(value);
    }
  }

  if (scheme === "basic") {
    const userHit = readEnvVar(auth?.userEnv, source);
    const passHit = readEnvVar(auth?.passEnv, source);
    if (userHit) resolvedEnv.push(userHit.key); else missingEnv.push(clean(auth?.userEnv));
    if (passHit) resolvedEnv.push(passHit.key); else missingEnv.push(clean(auth?.passEnv));
    if (userHit && passHit) {
      const headerName = clean(auth?.headerName || "Authorization").toLowerCase();
      headers[headerName] = `Basic ${Buffer.from(`${userHit.value}:${passHit.value}`).toString("base64")}`;
    }
  } else if (scheme === "bearer" || scheme === "header") {
    const tokenHit = readEnvVar(auth?.tokenEnv, source);
    if (tokenHit) resolvedEnv.push(tokenHit.key); else missingEnv.push(clean(auth?.tokenEnv));
    if (tokenHit) {
      const headerName = clean(auth?.headerName || (scheme === "bearer" ? "Authorization" : "")).toLowerCase();
      // `prefix` defaults to "Bearer " for the bearer scheme, "" for header
      // (custom-header providers and Linear's raw Authorization key).
      const prefix = auth?.prefix != null ? String(auth.prefix) : (scheme === "bearer" ? "Bearer " : "");
      if (headerName) headers[headerName] = `${prefix}${tokenHit.value}`;
    }
  } else {
    return { ok: false, headers, missingEnv: ["<unknown-auth-scheme>"], resolvedEnv, scheme };
  }

  const ok = missingEnv.filter(Boolean).length === 0 && Object.keys(headers).some((h) => h === clean(auth?.headerName).toLowerCase() || h === "authorization");
  return { ok, headers, missingEnv: missingEnv.filter(Boolean), resolvedEnv, scheme };
}

/**
 * Resolve the base URL to probe/act against. Most providers carry a fixed
 * `baseUrl`; per-project providers (Supabase) resolve it from a `baseUrlEnv`
 * (the same pattern Upstash's `probe.baseUrlEnv` uses). Returns "" when a
 * declared baseUrlEnv is not present in the runtime.
 */
function resolveCapabilityBaseUrl({ baseUrl, baseUrlEnv } = {}, env = process.env) {
  if (clean(baseUrlEnv)) {
    const hit = readEnvVar(baseUrlEnv, env);
    return hit ? clean(hit.value).replace(/\/+$/, "") : "";
  }
  return clean(baseUrl).replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = clean(base).replace(/\/+$/, "");
  const p = clean(path);
  if (!p) return b;
  return `${b}${p.startsWith("/") ? p : `/${p}`}`;
}

/**
 * Interpolate `{ENV_KEY}` / `{token}` placeholders in a path from env values
 * (e.g. Twilio's `/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json`). Only resolves
 * placeholders whose key is present in env; leaves others untouched so callers
 * can detect an unbound template.
 */
function interpolatePath(path, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  return clean(path).replace(/\{([A-Z0-9_]+)\}/g, (match, key) => (source[key] != null ? String(source[key]) : match));
}

/**
 * Build a read-only readiness probe request for a provider account OR a product
 * from its `probe` (or `accountProbe`) descriptor + `auth` atom. Provider-
 * agnostic: the route just fetches `{ url, method, headers, body }` and treats a
 * 2xx as verified. Returns `{ ok:false, missingEnv }` when creds/host are absent
 * so the route blocks BEFORE any network call.
 *
 * @param {object} probe    the `probe`/`accountProbe` descriptor
 *   { authScheme?, headerName?, tokenEnv?, userEnv?, passEnv?, baseUrlEnv?,
 *     method?, paths[], body?, extraHeaders? }
 * @param {object} descriptor  the provider/product (for `baseUrl` + `auth`)
 * @param {object} env
 * @returns {{ ok, requests?: Array<{url,method,headers,body?}>, missingEnv?, resolvedEnv?, baseUrl? }}
 */
function buildCapabilityProbeRequests(probe, descriptor, env = process.env) {
  // Reuse the descriptor's `auth` atom; a probe may narrow it via its own
  // authScheme/headerName/tokenEnv (they agree by construction in the catalog).
  const auth = {
    scheme: clean(probe?.authScheme) || clean(descriptor?.auth?.scheme),
    headerName: probe?.headerName || descriptor?.auth?.headerName,
    prefix: probe?.prefix != null ? probe.prefix : descriptor?.auth?.prefix,
    tokenEnv: probe?.tokenEnv || descriptor?.auth?.tokenEnv,
    userEnv: probe?.userEnv || descriptor?.auth?.userEnv,
    passEnv: probe?.passEnv || descriptor?.auth?.passEnv,
    extraHeaders: { ...(descriptor?.auth?.extraHeaders || {}), ...(probe?.extraHeaders || {}) },
  };
  const authResult = buildProviderAuthHeaders(auth, env);
  const baseUrl = resolveCapabilityBaseUrl({ baseUrl: descriptor?.baseUrl, baseUrlEnv: probe?.baseUrlEnv }, env);

  const missingEnv = [...authResult.missingEnv];
  if (clean(probe?.baseUrlEnv) && !baseUrl) missingEnv.push(clean(probe.baseUrlEnv));
  if (missingEnv.length || !baseUrl) {
    return { ok: false, missingEnv, resolvedEnv: authResult.resolvedEnv, baseUrl };
  }

  const method = clean(probe?.method || "GET").toUpperCase();
  const paths = Array.isArray(probe?.paths) && probe.paths.length ? probe.paths : ["/"];
  const bodyString = probe?.body != null ? JSON.stringify(probe.body) : undefined;
  const headers = { ...authResult.headers };
  if (bodyString && !headers["content-type"]) headers["content-type"] = "application/json";

  const requests = paths.map((path) => ({
    url: joinUrl(baseUrl, interpolatePath(path, env)),
    method,
    headers,
    ...(bodyString ? { body: bodyString } : {}),
  }));
  return { ok: true, requests, resolvedEnv: authResult.resolvedEnv, baseUrl };
}

/** A 2xx from any probe path proves the capability's credential/host resolves. */
function summarizeProbeOutcome({ label, path, status } = {}) {
  const ok = Number.isFinite(status) && status >= 200 && status < 300;
  return {
    ok,
    testedAt: new Date().toISOString(),
    proof: ok
      ? `${label} probe ${path} returned HTTP ${status}`
      : `${label} probe failed: ${path} returned HTTP ${status}`,
    summary: ok
      ? `${label} verified with a read-only probe (${path}).`
      : `${label} probe failed: ${path} returned HTTP ${status}.`,
  };
}

/**
 * Build a governed capability ACTION request (the analog of the scheduler
 * adapter's buildRunRequest, for synchronous/poll lanes). A product declares
 * `action` steps ({ method, path }); the route picks one (send / create / infer
 * / read / trigger) and calls this. Auth rides in headers only; the run pointer
 * body carries no secret. Returns `{ ok:false, missingEnv }` when creds/host are
 * absent so the route blocks before any network call.
 *
 * @param {object} args
 * @param {object} args.auth      the product `auth` atom
 * @param {string} args.baseUrl   resolved provider/product base URL
 * @param {object} args.step      the action step { method, path }
 * @param {object} [args.body]    request body (object → JSON, string → verbatim)
 * @param {object} [args.pathVars] values for `{var}` placeholders in the path
 * @param {object} [args.env]
 */
function buildCapabilityActionRequest({ auth, baseUrl, step, body = null, pathVars = {}, env = process.env } = {}) {
  const authResult = buildProviderAuthHeaders(auth, env);
  if (!authResult.ok) return { ok: false, missingEnv: authResult.missingEnv };
  const base = clean(baseUrl).replace(/\/+$/, "");
  if (!base) return { ok: false, missingEnv: ["<base-url>"] };
  if (!step || !clean(step.path)) return { ok: false, missingEnv: ["<action-step>"] };
  const source = env && typeof env === "object" ? env : {};
  const vars = { ...source, ...pathVars };
  const resolvedPath = clean(step.path).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match));
  const headers = { ...authResult.headers };
  const bodyString = body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body));
  if (bodyString && !headers["content-type"]) headers["content-type"] = "application/json";
  return {
    ok: true,
    request: {
      url: joinUrl(base, resolvedPath),
      method: clean(step.method || "POST").toUpperCase(),
      headers,
      ...(bodyString ? { body: bodyString } : {}),
    },
    resolvedEnv: authResult.resolvedEnv,
  };
}

/** Map an action HTTP response into NON-SECRET proof (the receipt reward). */
function parseCapabilityActionResponse({ label, status, body } = {}) {
  const ok = Number.isFinite(status) && status >= 200 && status < 300;
  const preview = clean(typeof body === "string" ? body : JSON.stringify(body || "")).slice(0, 240);
  return {
    ok,
    testedAt: new Date().toISOString(),
    proof: ok ? `${label} action returned HTTP ${status}` : `${label} action failed: HTTP ${status}`,
    summary: ok ? `${label} action completed (HTTP ${status}).` : `${label} action failed (HTTP ${status}).`,
    responsePreview: preview,
  };
}

export {
  CAPABILITY_AUTH_SCHEMES,
  buildProviderAuthHeaders,
  resolveCapabilityBaseUrl,
  interpolatePath,
  joinUrl,
  buildCapabilityProbeRequests,
  summarizeProbeOutcome,
  buildCapabilityActionRequest,
  parseCapabilityActionResponse,
};
