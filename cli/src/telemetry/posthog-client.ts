import os from "node:os";
import { resolveTelemetrySettings, type TelemetrySettings } from "./config.js";
import { readOrCreateAnonId } from "./anon-id.js";
import type { CliEventName, EventProperties } from "./events.js";

/**
 * Zero-dependency PostHog `/capture/` client for the CLI.
 *
 * The CLI is a bundled-esbuild binary, so we deliberately avoid adding the
 * `posthog-node` dep and its transitive graph. We speak PostHog's documented
 * batch capture endpoint directly with `fetch`. This keeps the install
 * surface small and makes the telemetry layer trivially mockable in tests.
 *
 * Contract:
 *   - Events are queued in-memory and batch-flushed on `flush()`.
 *   - `flush()` is invoked from the CLI exit hook so short-lived commands
 *     still deliver their batch.
 *   - Network failures are swallowed silently — telemetry must never break
 *     a user's workflow.
 *   - When no API key resolves (`enabled=false`), every operation is a
 *     no-op, including anon-id read. This respects DO_NOT_TRACK.
 */

interface QueuedEvent {
  event: CliEventName | string;
  distinctId: string;
  properties: EventProperties;
  timestamp: string;
}

interface Identity {
  distinctId: string;
  userId?: string;
  orgId?: string;
  email?: string;
  tier?: string;
  properties?: EventProperties;
}

let settingsCache: TelemetrySettings | null = null;
let anonIdCache: string | null = null;
let identity: Identity | null = null;
let queue: QueuedEvent[] = [];
let pendingFlush: Promise<void> | null = null;
let sessionProperties: EventProperties = {};

function getSettings(): TelemetrySettings {
  if (settingsCache) return settingsCache;
  settingsCache = resolveTelemetrySettings();
  return settingsCache;
}

function getAnonId(): string {
  if (anonIdCache) return anonIdCache;
  anonIdCache = readOrCreateAnonId();
  return anonIdCache;
}

function resolveDistinctId(): string {
  return identity?.userId ?? identity?.distinctId ?? getAnonId();
}

function baseProperties(): EventProperties {
  return {
    $lib: "growthub-cli",
    cli_platform: process.platform,
    cli_arch: process.arch,
    node_version: process.versions.node,
    cli_hostname_hash: hashString(os.hostname()),
    ...sessionProperties,
  };
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function debugLog(...args: unknown[]): void {
  if (!getSettings().debug) return;
  // eslint-disable-next-line no-console
  console.error("[telemetry]", ...args);
}

export function setSessionProperties(props: EventProperties): void {
  sessionProperties = { ...sessionProperties, ...props };
}

export function identify(next: Identity): void {
  const settings = getSettings();
  if (!settings.enabled) return;

  identity = {
    ...next,
    distinctId: next.distinctId || getAnonId(),
  };

  enqueue({
    event: "$identify",
    distinctId: identity.distinctId,
    properties: {
      ...baseProperties(),
      $set: {
        ...(next.email ? { email: next.email } : {}),
        ...(next.orgId ? { org_id: next.orgId } : {}),
        ...(next.tier ? { tier: next.tier } : {}),
        ...(next.properties ?? {}),
      },
      ...(identity.userId ? { $anon_distinct_id: getAnonId() } : {}),
    },
    timestamp: new Date().toISOString(),
  });
}

export function track(event: CliEventName | string, properties: EventProperties = {}): void {
  const settings = getSettings();
  if (!settings.enabled) return;

  const merged: EventProperties = {
    ...baseProperties(),
    ...(identity?.userId ? { user_id: identity.userId } : {}),
    ...(identity?.orgId ? { org_id: identity.orgId } : {}),
    ...(identity?.tier ? { tier: identity.tier } : {}),
    ...properties,
  };

  enqueue({
    event,
    distinctId: resolveDistinctId(),
    properties: merged,
    timestamp: new Date().toISOString(),
  });
}

function enqueue(event: QueuedEvent): void {
  queue.push(event);
  debugLog("enqueue", event.event, { queueSize: queue.length });
  if (queue.length >= 20) {
    void flush().catch(() => { /* swallow */ });
  }
}

export async function flush(options: { timeoutMs?: number } = {}): Promise<void> {
  const settings = getSettings();
  if (!settings.enabled || !settings.apiKey) {
    queue = [];
    return;
  }
  if (queue.length === 0) return;
  if (pendingFlush) return pendingFlush;

  const batch = queue;
  queue = [];

  const timeoutMs = options.timeoutMs ?? 1500;
  pendingFlush = (async () => {
    try {
      const body = {
        api_key: settings.apiKey,
        batch: batch.map((item) => ({
          event: item.event,
          distinct_id: item.distinctId,
          properties: item.properties,
          timestamp: item.timestamp,
        })),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${settings.host}/batch/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          debugLog("flush.non_2xx", { status: response.status });
        } else {
          debugLog("flush.ok", { count: batch.length });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      debugLog("flush.error", err instanceof Error ? err.message : String(err));
    } finally {
      pendingFlush = null;
    }
  })();

  return pendingFlush;
}

export function resetForTests(): void {
  settingsCache = null;
  anonIdCache = null;
  identity = null;
  queue = [];
  pendingFlush = null;
  sessionProperties = {};
}

export function inspectQueueForTests(): QueuedEvent[] {
  return [...queue];
}

export function isEnabled(): boolean {
  return getSettings().enabled;
}

export function currentDistinctId(): string {
  return resolveDistinctId();
}

export function currentIdentity(): Identity | null {
  return identity;
}
