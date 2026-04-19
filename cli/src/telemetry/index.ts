import { PostHog } from "posthog-node";
import { resolveTelemetryDistinctId } from "./identity.js";

// Write-only project API key — not a secret. Override with POSTHOG_API_KEY for dev.
const DEFAULT_API_KEY = "phc_growthub_cli_placeholder";
const DEFAULT_HOST = "https://us.i.posthog.com";

let _client: PostHog | null = null;
let _distinctId: string | null = null;

function isOptedOut(): boolean {
  return (
    process.env.GROWTHUB_NO_TELEMETRY === "1" ||
    process.env.DO_NOT_TRACK === "1" ||
    Boolean(process.env.CI)
  );
}

function getClient(): PostHog | null {
  if (isOptedOut()) return null;
  if (_client) return _client;
  const apiKey = process.env.POSTHOG_API_KEY?.trim() || DEFAULT_API_KEY;
  if (apiKey === DEFAULT_API_KEY) return null; // no-op until key is configured
  _client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST?.trim() || DEFAULT_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return _client;
}

function getDistinctId(): string {
  if (!_distinctId) _distinctId = resolveTelemetryDistinctId();
  return _distinctId;
}

export type TelemetryProperties = Record<string, string | number | boolean | undefined>;

export function track(event: string, properties?: TelemetryProperties): void {
  const client = getClient();
  if (!client) return;
  try {
    client.capture({
      distinctId: getDistinctId(),
      event,
      properties: {
        $lib: "growthub-cli",
        ...properties,
      },
    });
  } catch {
    // telemetry must never affect CLI operation
  }
}

export function identifyAccount(hostedUserId: string, properties?: TelemetryProperties): void {
  const client = getClient();
  if (!client) return;
  try {
    client.identify({
      distinctId: getDistinctId(),
      properties: {
        linked_hosted_user_id: hostedUserId,
        ...properties,
      },
    });
    // Alias anonymous ID to hosted user so events join in PostHog
    client.alias({ distinctId: getDistinctId(), alias: hostedUserId });
  } catch {
    // telemetry must never affect CLI operation
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!_client) return;
  try {
    await _client.shutdown();
  } catch {
    // ignore flush errors on exit
  }
}
