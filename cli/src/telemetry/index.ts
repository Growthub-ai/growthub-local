import { readHostedOverlay } from "../auth/overlay-store.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import {
  flush as flushClient,
  identify,
  isEnabled,
  setSessionProperties,
  track,
  currentDistinctId,
  currentIdentity,
} from "./posthog-client.js";
import { readActiveEnvelope, tierFromOverlay } from "./envelope.js";
import { CliEvents, type CliEventName, type EventProperties } from "./events.js";

/**
 * CLI-facing telemetry surface.
 *
 * Callers should only import from this module. It wraps the PostHog client
 * so we can swap the transport later without touching call sites, and
 * attaches the CLI-wide session properties (version, tier, identified user)
 * that every event should carry.
 */

interface InitOptions {
  cliVersion: string;
  invocation?: string;
  extraProperties?: EventProperties;
}

let initialized = false;
let shutdownHooksRegistered = false;

export function initTelemetry(options: InitOptions): void {
  if (initialized) return;
  initialized = true;

  const overlay = readHostedOverlay();
  const session = readSession();
  const hasSession = session !== null && !isSessionExpired(session);
  const envelope = readActiveEnvelope();
  const tier = envelope?.tier ?? tierFromOverlay(overlay);

  setSessionProperties({
    cli_version: options.cliVersion,
    invocation: options.invocation ?? "cli",
    has_hosted_session: hasSession,
    has_envelope: envelope !== null,
    envelope_tier: tier,
    ...(options.extraProperties ?? {}),
  });

  if (overlay?.userId || session?.userId) {
    identify({
      distinctId: overlay?.userId ?? session?.userId ?? currentDistinctId(),
      userId: overlay?.userId ?? session?.userId,
      email: overlay?.email ?? session?.email,
      orgId: overlay?.orgId ?? session?.orgId,
      tier,
      properties: {
        hosted_base_url: overlay?.hostedBaseUrl ?? session?.hostedBaseUrl,
        entitlements: overlay?.entitlements ?? [],
      },
    });
  }

  track(CliEvents.CliStart, {
    cli_version: options.cliVersion,
    invocation: options.invocation ?? "cli",
    has_hosted_session: hasSession,
    has_envelope: envelope !== null,
    envelope_tier: tier,
  });

  registerShutdownHooks();
}

function registerShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;

  const flushOnExit = () => {
    void flushClient({ timeoutMs: 1500 }).catch(() => { /* swallow */ });
  };

  process.once("beforeExit", flushOnExit);
  process.on("exit", flushOnExit);
  process.once("SIGINT", () => {
    flushOnExit();
  });
  process.once("SIGTERM", () => {
    flushOnExit();
  });
}

export function trackCommandInvoked(commandPath: string, properties: EventProperties = {}): void {
  track(CliEvents.CliCommandInvoked, {
    command: commandPath,
    ...properties,
  });
}

export function trackCommandError(commandPath: string, err: unknown): void {
  track(CliEvents.CliCommandError, {
    command: commandPath,
    error_message: err instanceof Error ? err.message : String(err),
    error_name: err instanceof Error ? err.name : "UnknownError",
  });
}

export function trackEvent(event: CliEventName | string, properties: EventProperties = {}): void {
  track(event, properties);
}

export function identifyFromSession(userId: string, extra: { email?: string; orgId?: string; tier?: string; properties?: EventProperties } = {}): void {
  identify({
    distinctId: userId,
    userId,
    ...extra,
  });
}

export async function shutdownTelemetry(): Promise<void> {
  await flushClient({ timeoutMs: 1500 }).catch(() => { /* swallow */ });
}

export function telemetryEnabled(): boolean {
  return isEnabled();
}

export function telemetryIdentity(): ReturnType<typeof currentIdentity> {
  return currentIdentity();
}

export function telemetryDistinctId(): string {
  return currentDistinctId();
}

export { currentDistinctId };

export { CliEvents } from "./events.js";
export type { CliEventName, EventProperties } from "./events.js";
