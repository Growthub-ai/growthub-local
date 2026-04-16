import fs from "node:fs";
import path from "node:path";
import { resolveGithubHomeDir, resolveGithubTokenPath, resolveGithubProfilePath } from "../config/github-home.js";
import type { CliGithubToken, CliGithubProfile } from "./types.js";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, body: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* best-effort on platforms where chmod is unavailable */
  }
}

export function readGithubToken(): CliGithubToken | null {
  const p = resolveGithubTokenPath();
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as CliGithubToken;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGithubToken(token: CliGithubToken): void {
  ensureDir(resolveGithubHomeDir());
  atomicWrite(resolveGithubTokenPath(), JSON.stringify(token, null, 2) + "\n");
}

export function clearGithubToken(): void {
  const p = resolveGithubTokenPath();
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

export function isGithubTokenExpired(token: CliGithubToken | null): boolean {
  if (!token) return true;
  if (!token.expiresAt) return false;
  const expiresAtMs = new Date(token.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  return Date.now() >= expiresAtMs;
}

export function readGithubProfile(): CliGithubProfile | null {
  const p = resolveGithubProfilePath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CliGithubProfile;
  } catch {
    return null;
  }
}

export function writeGithubProfile(profile: CliGithubProfile): void {
  ensureDir(resolveGithubHomeDir());
  atomicWrite(resolveGithubProfilePath(), JSON.stringify(profile, null, 2) + "\n");
}

export function clearGithubProfile(): void {
  const p = resolveGithubProfilePath();
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

/** Describe where the token is persisted on disk (for whoami / status output). */
export function describeGithubTokenPath(): string {
  return resolveGithubTokenPath();
}
