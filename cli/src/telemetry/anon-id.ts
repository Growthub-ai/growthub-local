import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaperclipHomeDir } from "../config/home.js";

/**
 * Machine-scoped anonymous distinct id for the CLI.
 *
 * Lives under `~/.paperclip/telemetry/anon-id` so it survives across CLI
 * upgrades but stays per-machine. Never includes PII. Rotating the file
 * rotates the identity — callers opting out of telemetry can delete it.
 */

function resolveTelemetryDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "telemetry");
}

export function resolveAnonIdPath(): string {
  return path.resolve(resolveTelemetryDir(), "anon-id");
}

function isValidAnonId(value: string): boolean {
  return /^[0-9a-f]{32,64}$/.test(value);
}

export function readOrCreateAnonId(): string {
  const filePath = resolveAnonIdPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (isValidAnonId(raw)) return raw;
    }
  } catch {
    // fall through and regenerate
  }

  const next = crypto.randomBytes(16).toString("hex");
  try {
    fs.mkdirSync(resolveTelemetryDir(), { recursive: true });
    fs.writeFileSync(filePath, `${next}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // non-posix best-effort
    }
  } catch {
    // best-effort — if the fs is read-only we still return a usable id for the run
  }
  return next;
}

export function clearAnonId(): boolean {
  const filePath = resolveAnonIdPath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}
