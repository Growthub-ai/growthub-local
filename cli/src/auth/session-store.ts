import fs from "node:fs";
import path from "node:path";
import { resolveAuthDir, resolveSessionPath } from "./paths.js";

/**
 * Minimal hosted session material persisted by the CLI.
 *
 * The CLI deliberately does NOT implement Supabase/BetterAuth semantics; it
 * only stores the short-lived token exchanged by the hosted app via the
 * browser-driven login flow. Server-side session semantics remain owned by
 * `gh-app` / the hosted Growthub Next.js app.
 */
export interface CliAuthSession {
  version: 1;
  /** Hosted base URL the token was issued against. */
  hostedBaseUrl: string;
  /** Short-lived bearer token from the hosted exchange. */
  accessToken: string;
  /** ISO timestamp when the token expires, if known. */
  expiresAt?: string;
  /** Authenticated user id (opaque string). */
  userId?: string;
  /** Human-readable email (optional, surfaced in whoami). */
  email?: string;
  /** Organization id, if hosted app scopes tokens to an org. */
  orgId?: string;
  /** Organization display name. */
  orgName?: string;
  /** Machine label the hosted app stamped the session with. */
  machineLabel?: string;
  /** ISO timestamp when the session was minted locally. */
  issuedAt: string;
}

function parseJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse auth session at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSession(raw: unknown): CliAuthSession | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const accessToken = toStringOrUndefined(record.accessToken);
  const hostedBaseUrl = toStringOrUndefined(record.hostedBaseUrl);
  if (!accessToken || !hostedBaseUrl) return null;

  const issuedAt = toStringOrUndefined(record.issuedAt) ?? new Date().toISOString();

  return {
    version: 1,
    hostedBaseUrl,
    accessToken,
    expiresAt: toStringOrUndefined(record.expiresAt),
    userId: toStringOrUndefined(record.userId),
    email: toStringOrUndefined(record.email),
    orgId: toStringOrUndefined(record.orgId),
    orgName: toStringOrUndefined(record.orgName),
    machineLabel: toStringOrUndefined(record.machineLabel),
    issuedAt,
  };
}

export function readSession(): CliAuthSession | null {
  const filePath = resolveSessionPath();
  if (!fs.existsSync(filePath)) return null;
  const raw = parseJson(filePath);
  return normalizeSession(raw);
}

export function writeSession(session: CliAuthSession): void {
  const filePath = resolveSessionPath();
  fs.mkdirSync(resolveAuthDir(), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-posix filesystems — best-effort
  }
}

export function clearSession(): boolean {
  const filePath = resolveSessionPath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

export function isSessionExpired(session: CliAuthSession, now: Date = new Date()): boolean {
  if (!session.expiresAt) return false;
  const expires = Date.parse(session.expiresAt);
  if (Number.isNaN(expires)) return false;
  return expires <= now.getTime();
}

export function describeSessionPath(): string {
  return path.resolve(resolveSessionPath());
}
