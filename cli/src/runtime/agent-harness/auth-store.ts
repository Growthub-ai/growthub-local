import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";

type HarnessCredentialMap = Record<string, string>;

function resolveHarnessAuthDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "harness-auth");
}

function resolveHarnessAuthFile(harnessId: string): string {
  return path.resolve(resolveHarnessAuthDir(), `${harnessId}.json`);
}

function normalizeSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function ensureSecureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Best effort only; some filesystems may ignore chmod.
  }
}

function ensureSecureFile(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort only; some filesystems may ignore chmod.
  }
}

export function readHarnessCredentials(harnessId: string): HarnessCredentialMap {
  const filePath = resolveHarnessAuthFile(harnessId);
  if (!fs.existsSync(filePath)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    const creds: HarnessCredentialMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim().length > 0) {
        creds[key] = value;
      }
    }
    return creds;
  } catch {
    return {};
  }
}

export function getHarnessCredential(harnessId: string, key: string): string | undefined {
  const creds = readHarnessCredentials(harnessId);
  return creds[key];
}

export function setHarnessCredential(
  harnessId: string,
  key: string,
  value: string | undefined,
): void {
  const normalized = normalizeSecret(value);
  const creds = readHarnessCredentials(harnessId);

  if (normalized) {
    creds[key] = normalized;
  } else {
    delete creds[key];
  }

  const dirPath = resolveHarnessAuthDir();
  ensureSecureDir(dirPath);
  const filePath = resolveHarnessAuthFile(harnessId);
  fs.writeFileSync(filePath, `${JSON.stringify(creds, null, 2)}\n`, "utf-8");
  ensureSecureFile(filePath);
}

export function setHarnessCredentials(
  harnessId: string,
  updates: Record<string, string | undefined>,
): void {
  const creds = readHarnessCredentials(harnessId);
  for (const [key, rawValue] of Object.entries(updates)) {
    const normalized = normalizeSecret(rawValue);
    if (normalized) {
      creds[key] = normalized;
    } else {
      delete creds[key];
    }
  }

  const dirPath = resolveHarnessAuthDir();
  ensureSecureDir(dirPath);
  const filePath = resolveHarnessAuthFile(harnessId);
  fs.writeFileSync(filePath, `${JSON.stringify(creds, null, 2)}\n`, "utf-8");
  ensureSecureFile(filePath);
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}
