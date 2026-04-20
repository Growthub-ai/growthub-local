/**
 * Anonymous machine/session id for PostHog `distinct_id`.
 *
 * Generated the first time telemetry is enabled and persisted to
 * `<PAPERCLIP_HOME>/telemetry/anon-id.json`. The id is a random UUID —
 * not derived from the hostname, user, working directory, or any
 * identifying system property — so it cannot be reversed into a
 * machine or operator identity.
 *
 * The anon id can be rotated or deleted at any time by the operator
 * without affecting any local workspace state; the telemetry client
 * treats a missing file as "create a fresh id on next capture".
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePaperclipHomeDir } from "../../config/home.js";

export interface AnonIdentity {
  anonId: string;
  createdAt: string;
}

function resolveAnonIdFilePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "telemetry", "anon-id.json");
}

function parseIdentity(raw: unknown): AnonIdentity | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const anonId = typeof record.anonId === "string" ? record.anonId.trim() : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  if (anonId.length === 0) return null;
  return { anonId, createdAt: createdAt || new Date().toISOString() };
}

export function readAnonIdentity(): AnonIdentity | null {
  const filePath = resolveAnonIdFilePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return parseIdentity(parsed);
  } catch {
    return null;
  }
}

export function writeAnonIdentity(identity: AnonIdentity): void {
  const filePath = resolveAnonIdFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(identity, null, 2)}\n`,
    { mode: 0o600 },
  );
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-posix filesystems — best effort
  }
}

export function ensureAnonIdentity(): AnonIdentity {
  const existing = readAnonIdentity();
  if (existing) return existing;
  const next: AnonIdentity = {
    anonId: `cli-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  writeAnonIdentity(next);
  return next;
}

/** Returns true when the anon id file was present and was successfully removed. */
export function resetAnonIdentity(): boolean {
  const filePath = resolveAnonIdFilePath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

export function describeAnonIdentityPath(): string {
  return resolveAnonIdFilePath();
}
