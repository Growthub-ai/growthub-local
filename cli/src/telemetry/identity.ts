import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaperclipHomeDir } from "../config/home.js";

const TELEMETRY_ID_FILENAME = "telemetry-id";

function resolveIdFilePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), TELEMETRY_ID_FILENAME);
}

function generateId(): string {
  return crypto.randomUUID();
}

export function resolveTelemetryDistinctId(): string {
  const filePath = resolveIdFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const stored = fs.readFileSync(filePath, "utf8").trim();
      if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
    }
    const id = generateId();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, id + "\n", { mode: 0o600 });
    return id;
  } catch {
    return generateId();
  }
}
