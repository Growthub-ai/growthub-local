import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "gh_ws_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function readEnv(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = process.env[key];
    if (value) return value;
  }
  return void 0;
}

function readGateFlag() {
  const raw = readEnv(["GROWTHUB_WORKSPACE_AUTH_GATE", "WORKSPACE_AUTH_GATE"]);
  if (!raw) return false;
  return raw === "enabled" || raw === "true" || raw === "1";
}

/**
 * Env-var workspace login gate. Disabled unless explicitly enabled and configured.
 */
export function isAuthGateEnabled() {
  if (!readGateFlag()) return false;
  const username = readGateUsername();
  const hasPassword = Boolean(readGatePassword()) || Boolean(readGatePasswordHash());
  const hasToken = Boolean(readGateToken());
  return Boolean(username && (hasPassword || hasToken));
}

export function readAuthGateConfig() {
  return {
    enabled: isAuthGateEnabled(),
    username: readGateUsername() || null,
    hasPassword: Boolean(readGatePassword()) || Boolean(readGatePasswordHash()),
    hasToken: Boolean(readGateToken()),
    sessionCookie: SESSION_COOKIE
  };
}

function readGateUsername() {
  return readEnv(["GROWTHUB_WORKSPACE_GATE_USERNAME", "AUTH_USERNAME"]);
}

function readGatePassword() {
  return readEnv(["GROWTHUB_WORKSPACE_GATE_PASSWORD", "AUTH_PASSWORD"]);
}

function readGatePasswordHash() {
  return readEnv(["GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH", "AUTH_PASSWORD_HASH"]);
}

function readGateToken() {
  return readEnv(["GROWTHUB_WORKSPACE_GATE_TOKEN", "AUTH_TOKEN"]);
}

function readGateSecret() {
  return (
    readEnv(["GROWTHUB_WORKSPACE_GATE_SECRET", "AUTH_SECRET"]) ||
    readGatePasswordHash() ||
    readGatePassword() ||
    "growthub-workspace-gate-dev-only"
  );
}

function normalizePasswordHash(value) {
  return String(value).trim().toLowerCase();
}

function hashPassword(password) {
  return createHmac("sha256", readGateSecret()).update(password, "utf8").digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyCredentials(username, password, token) {
  const expectedUser = readGateUsername();
  if (!expectedUser) return false;
  if (username !== expectedUser) return false;

  const expectedToken = readGateToken();
  if (expectedToken && token && safeEqual(token, expectedToken)) {
    return true;
  }

  if (!password) return false;

  const expectedHash = readGatePasswordHash();
  if (expectedHash) {
    const candidate = normalizePasswordHash(hashPassword(password));
    return safeEqual(candidate, normalizePasswordHash(expectedHash));
  }

  const plain = readGatePassword();
  if (plain) {
    return safeEqual(password, plain);
  }

  return false;
}

function signPayload(encodedPayload) {
  return createHmac("sha256", readGateSecret()).update(encodedPayload).digest("base64url");
}

function buildSessionValue() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    u: readGateUsername(),
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SEC,
    n: randomBytes(8).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function parseSessionValue(raw) {
  if (!raw || typeof raw !== "string") return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = signPayload(encoded);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (payload.u !== readGateUsername()) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function readSessionFromRequest(request) {
  const cookie = request.cookies?.get?.(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return parseSessionValue(cookie.value);
}

export function readSessionFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${SESSION_COOKIE}=`)) continue;
    const value = part.slice(SESSION_COOKIE.length + 1);
    try {
      return parseSessionValue(decodeURIComponent(value));
    } catch {
      return parseSessionValue(value);
    }
  }
  return null;
}

export function isAuthenticatedRequest(request) {
  if (!isAuthGateEnabled()) return true;
  return Boolean(readSessionFromRequest(request));
}

export function buildSessionSetCookie() {
  const value = buildSessionValue();
  const maxAge = SESSION_MAX_AGE_SEC;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildSessionClearCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function hashGatePasswordForEnv(password) {
  return hashPassword(password);
}

/** Constant-time gate check for proxy.js (cookie header only). */
export function hasValidSessionCookie(cookieHeader) {
  if (!isAuthGateEnabled()) return true;
  return Boolean(readSessionFromCookieHeader(cookieHeader));
}
