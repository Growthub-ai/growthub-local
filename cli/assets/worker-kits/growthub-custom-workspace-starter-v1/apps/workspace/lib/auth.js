import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** @typedef {{ sub: string; exp: number; iat: number }} WorkspaceSessionPayload */

export const WORKSPACE_SESSION_COOKIE = "gh_workspace_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/**
 * Env-var workspace login gate (module growthhub-local-awac-auth-proxy-v1).
 * Off by default — set username, secret, and password (or hash) to enable.
 */
export function readGateConfig() {
  const enabledFlag = (process.env.GROWTHUB_WORKSPACE_GATE_ENABLED ?? "").trim().toLowerCase();
  const explicitlyOff = enabledFlag === "0" || enabledFlag === "false" || enabledFlag === "off";
  const username = (process.env.GROWTHUB_WORKSPACE_GATE_USERNAME ?? "").trim();
  const secret = (process.env.GROWTHUB_WORKSPACE_GATE_SECRET ?? "").trim();
  const password = process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD ?? "";
  const passwordHash = (process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH ?? "").trim().toLowerCase();
  const hasCredential = Boolean(password) || Boolean(passwordHash);
  const explicitlyOn = enabledFlag === "1" || enabledFlag === "true" || enabledFlag === "on";
  const enabled = !explicitlyOff && explicitlyOn && Boolean(username) && Boolean(secret) && hasCredential;
  return {
    enabled,
    username,
    secret,
    hasPlainPassword: Boolean(password),
    hasPasswordHash: Boolean(passwordHash)
  };
}

export function isGateEnabled() {
  return readGateConfig().enabled;
}

/**
 * @param {string} username
 * @param {string} password
 */
export function verifyGateCredentials(username, password) {
  const config = readGateConfig();
  if (!config.enabled) return false;
  if (!username || !password) return false;
  if (username !== config.username) return false;

  const plain = process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD ?? "";
  if (plain) {
    return safeEqualString(password, plain);
  }

  const expectedHash = (process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH ?? "").trim().toLowerCase();
  if (!expectedHash) return false;
  const actualHash = createHash("sha256").update(password, "utf8").digest("hex");
  return safeEqualString(actualHash, expectedHash);
}

/**
 * @param {string} username
 */
export function createSessionToken(username) {
  const { secret } = readGateConfig();
  if (!secret) throw new Error("GROWTHUB_WORKSPACE_GATE_SECRET is required when the login gate is enabled.");
  const now = Math.floor(Date.now() / 1000);
  /** @type {WorkspaceSessionPayload} */
  const payload = {
    sub: username,
    iat: now,
    exp: now + SESSION_MAX_AGE_SEC
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * @param {string | undefined | null} token
 * @returns {WorkspaceSessionPayload | null}
 */
export function verifySessionToken(token) {
  if (!token) return null;
  const config = readGateConfig();
  if (!config.enabled || !config.secret) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", config.secret).update(body).digest("base64url");
  if (!safeEqualString(sig, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (payload.sub !== config.username) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * @param {import('next/server').NextRequest} request
 */
export function getSessionFromRequest(request) {
  const raw = request.cookies.get(WORKSPACE_SESSION_COOKIE)?.value;
  return verifySessionToken(raw);
}

/**
 * @param {string} token
 */
export function buildSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${WORKSPACE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie() {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${WORKSPACE_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * @param {string} a
 * @param {string} b
 */
function safeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
