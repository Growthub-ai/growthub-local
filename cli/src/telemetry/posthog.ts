import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

let _client: import("posthog-node").PostHog | null = null;
let _distinctId: string | null = null;
let _initialized = false;
let _cliVersion = "unknown";

export interface TelemetryProperties {
  [key: string]: string | number | boolean | null | undefined;
}

function isDisabled(): boolean {
  const v = process.env["GROWTHUB_TELEMETRY_DISABLED"];
  return v === "1" || v === "true";
}

function resolveApiKey(): string | null {
  return process.env["GROWTHUB_POSTHOG_KEY"] ?? null;
}

function resolveMachineId(): string {
  if (process.env["PAPERCLIP_INSTANCE_ID"]) {
    return process.env["PAPERCLIP_INSTANCE_ID"];
  }
  const idFile = path.join(os.homedir(), ".growthub", "machine-id");
  try {
    if (fs.existsSync(idFile)) {
      const existing = fs.readFileSync(idFile, "utf8").trim();
      if (existing.length > 0) return existing;
    }
    const newId = crypto.randomUUID();
    fs.mkdirSync(path.dirname(idFile), { recursive: true });
    fs.writeFileSync(idFile, newId, { encoding: "utf8", mode: 0o600 });
    return newId;
  } catch {
    return `ephemeral-${crypto.randomUUID()}`;
  }
}

export function initTelemetry(cliVersion: string): void {
  if (_initialized) return;
  _initialized = true;
  _cliVersion = cliVersion;

  if (isDisabled()) return;
  const apiKey = resolveApiKey();
  if (!apiKey) return;

  import("posthog-node")
    .then(({ PostHog }) => {
      _client = new PostHog(apiKey, {
        host: "https://us.i.posthog.com",
        flushAt: 5,
        flushInterval: 2000,
      });
      _distinctId = resolveMachineId();
    })
    .catch(() => {
      // posthog-node unavailable — telemetry silently disabled
    });
}

export function track(event: string, properties?: TelemetryProperties): void {
  if (!_client || !_distinctId) return;
  try {
    _client.capture({
      distinctId: _distinctId,
      event,
      properties: {
        cli_version: _cliVersion,
        platform: process.platform,
        node_version: process.version,
        ...properties,
      },
    });
  } catch {
    // Never let telemetry crash the CLI
  }
}

export async function shutdown(): Promise<void> {
  if (!_client) return;
  try {
    await _client.shutdown();
  } catch {
    // Best-effort flush
  }
}
