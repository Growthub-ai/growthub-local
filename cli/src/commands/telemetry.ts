/**
 * `growthub telemetry` — inspect + manage the PostHog CLI observability
 * layer, and `growthub envelope` — pair / inspect capability envelopes
 * granted by the hosted Growthub issuer.
 *
 * These commands are intentionally side-effect-light so CI, operators and
 * enterprise admins can audit telemetry state without mutating it.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import {
  describeTelemetrySettingsPath,
  resolveTelemetrySettings,
  writeTelemetrySettings,
} from "../telemetry/config.js";
import {
  clearAnonId,
  resolveAnonIdPath,
  readOrCreateAnonId,
} from "../telemetry/anon-id.js";
import {
  CliEvents,
  currentDistinctId,
  telemetryEnabled,
  telemetryIdentity,
  trackEvent,
  shutdownTelemetry,
} from "../telemetry/index.js";
import {
  defaultEnvelopeForTier,
  grantEnvelope,
  isEnvelopeExpired,
  pairEnvelopeFromOverlay,
  readActiveEnvelope,
  resolveActiveEnvelopePath,
  resolveExerciseLogPath,
  revokeEnvelope,
  tierFromOverlay,
  type CapabilityAxis,
  type EnvelopeTier,
} from "../telemetry/envelope.js";
import { readHostedOverlay } from "../auth/overlay-store.js";

const TIERS: EnvelopeTier[] = ["free", "growth", "scale", "enterprise"];

function yesNo(value: boolean): string {
  return value ? pc.green("yes") : pc.dim("no");
}

export async function telemetryStatus(opts: { json?: boolean }): Promise<void> {
  const settings = resolveTelemetrySettings();
  const identity = telemetryIdentity();
  const anonIdPath = resolveAnonIdPath();
  const hasAnonId = fs.existsSync(anonIdPath);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          enabled: settings.enabled,
          host: settings.host,
          apiKeyConfigured: settings.apiKey !== null,
          apiKeyHint: settings.apiKey ? `${settings.apiKey.slice(0, 6)}…` : null,
          debug: settings.debug,
          anonIdPath,
          anonIdPresent: hasAnonId,
          distinctId: currentDistinctId(),
          identified: identity?.userId ?? null,
          settingsPath: describeTelemetrySettingsPath(),
        },
        null,
        2,
      ),
    );
    return;
  }

  p.note(
    [
      `Enabled: ${yesNo(settings.enabled)}`,
      `API key configured: ${yesNo(settings.apiKey !== null)}`,
      `PostHog host: ${settings.host}`,
      `Debug logging: ${yesNo(settings.debug)}`,
      `Anon id file: ${anonIdPath} ${hasAnonId ? pc.dim("(present)") : pc.dim("(not yet created)")}`,
      `Distinct id: ${currentDistinctId()}`,
      `Identified user: ${identity?.userId ?? pc.dim("(anonymous)")}`,
      `Settings file: ${describeTelemetrySettingsPath()}`,
    ].join("\n"),
    "Growthub CLI telemetry",
  );
}

export async function telemetryEnable(opts: { apiKey?: string; host?: string }): Promise<void> {
  const patch: Parameters<typeof writeTelemetrySettings>[0] = { enabled: true };
  if (opts.apiKey) patch.apiKey = opts.apiKey;
  if (opts.host) patch.host = opts.host;
  writeTelemetrySettings(patch);
  // Touch the anon id so the operator sees a stable distinct id.
  readOrCreateAnonId();
  p.note(
    [
      "Telemetry is now enabled for this machine.",
      opts.apiKey ? "API key: (updated)" : "API key: (unchanged)",
      "Override temporarily with GROWTHUB_TELEMETRY_DISABLED=1.",
    ].join("\n"),
    "Enabled",
  );
}

export async function telemetryDisable(opts: { purgeAnonId?: boolean }): Promise<void> {
  writeTelemetrySettings({ enabled: false });
  if (opts.purgeAnonId) {
    clearAnonId();
  }
  p.note(
    [
      "Telemetry is now disabled locally.",
      opts.purgeAnonId ? "Anon id purged." : "Anon id file preserved — re-enable without re-identifying.",
    ].join("\n"),
    "Disabled",
  );
}

export async function telemetryIdentifyOverlay(): Promise<void> {
  const overlay = readHostedOverlay();
  if (!overlay) {
    p.note("No hosted overlay found. Run `growthub auth login` first.", "Telemetry");
    return;
  }
  trackEvent(CliEvents.AuthHostedBridgeOpened, {
    source: "telemetry.identify",
    tier: tierFromOverlay(overlay),
  });
  await shutdownTelemetry();
  p.note("Re-identified against hosted overlay and flushed events.", "Telemetry");
}

export async function envelopeStatus(opts: { json?: boolean }): Promise<void> {
  const envelope = readActiveEnvelope();
  const overlay = readHostedOverlay();
  const overlayTier = tierFromOverlay(overlay);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          active: envelope,
          overlayTier,
          expired: envelope ? isEnvelopeExpired(envelope) : null,
          path: resolveActiveEnvelopePath(),
          exerciseLogPath: resolveExerciseLogPath(),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!envelope) {
    p.note(
      [
        "No active envelope. The CLI falls back to local-only capabilities.",
        `Hosted overlay tier (best-effort): ${overlayTier}`,
        `Pair with: growthub envelope pair${overlay ? "" : " (requires hosted session)"}`,
      ].join("\n"),
      "Envelope",
    );
    return;
  }

  p.note(
    [
      `Envelope id: ${envelope.envelopeId}`,
      `Tier: ${envelope.tier}`,
      `Issuer: ${envelope.issuer}`,
      `Issued at: ${envelope.issuedAt}`,
      `Expires at: ${envelope.expiresAt ?? pc.dim("(no expiry)")}`,
      `Expired: ${yesNo(isEnvelopeExpired(envelope))}`,
      `Axes (${envelope.axes.length}): ${envelope.axes.join(", ")}`,
      `Active overlay tier: ${overlayTier}`,
      `Path: ${resolveActiveEnvelopePath()}`,
    ].join("\n"),
    "Envelope",
  );
}

export async function envelopePair(opts: {
  tier?: string;
  axes?: string;
  expiresAt?: string;
  issuer?: string;
}): Promise<void> {
  const overlay = readHostedOverlay();
  if (!overlay) {
    p.note(
      "No hosted overlay found. Run `growthub auth login` first so the hosted issuer can attach this machine.",
      "Pair failed",
    );
    process.exitCode = 1;
    return;
  }

  const tier = normalizeTier(opts.tier) ?? tierFromOverlay(overlay);
  const axes = opts.axes ? parseAxesList(opts.axes) : defaultEnvelopeForTier(tier);

  const envelope = pairEnvelopeFromOverlay({
    tier,
    axes,
    expiresAt: opts.expiresAt,
    issuer: opts.issuer,
  });

  if (!envelope) {
    p.note("Unable to pair envelope (hosted overlay missing).", "Pair failed");
    process.exitCode = 1;
    return;
  }

  p.note(
    [
      `Paired envelope ${envelope.envelopeId}`,
      `Tier: ${envelope.tier}`,
      `Axes: ${envelope.axes.join(", ")}`,
      opts.expiresAt ? `Expires: ${opts.expiresAt}` : "No expiry set",
    ].join("\n"),
    "Envelope paired",
  );
}

export async function envelopeGrant(opts: {
  tier?: string;
  axes?: string;
  expiresAt?: string;
  issuer?: string;
  userId?: string;
  orgId?: string;
}): Promise<void> {
  const tier = normalizeTier(opts.tier);
  if (!tier) {
    p.note(`Unknown tier. Allowed: ${TIERS.join(", ")}`, "Grant failed");
    process.exitCode = 1;
    return;
  }
  const axes = opts.axes ? parseAxesList(opts.axes) : defaultEnvelopeForTier(tier);
  const envelope = grantEnvelope({
    tier,
    axes,
    expiresAt: opts.expiresAt,
    issuer: opts.issuer,
    userId: opts.userId,
    orgId: opts.orgId,
  });

  p.note(
    [
      `Granted envelope ${envelope.envelopeId}`,
      `Tier: ${envelope.tier}`,
      `Axes: ${envelope.axes.join(", ")}`,
    ].join("\n"),
    "Envelope granted",
  );
}

export async function envelopeRevoke(): Promise<void> {
  const ok = revokeEnvelope();
  p.note(
    ok ? "Active envelope revoked." : "No active envelope to revoke.",
    "Envelope",
  );
}

function normalizeTier(raw?: string): EnvelopeTier | null {
  if (!raw) return null;
  const lower = raw.toLowerCase() as EnvelopeTier;
  return TIERS.includes(lower) ? lower : null;
}

function parseAxesList(raw: string): CapabilityAxis[] {
  return raw
    .split(",")
    .map((axis) => axis.trim())
    .filter((axis) => axis.length > 0) as CapabilityAxis[];
}

export function registerTelemetryCommands(target: Command): void {
  const telemetry = target
    .command("telemetry")
    .description("Inspect or configure the CLI PostHog observability layer");

  telemetry
    .command("status")
    .description("Show telemetry enabled state, api key config, and distinct id")
    .option("--json", "Emit JSON")
    .action(async (opts) => { await telemetryStatus(opts); });

  telemetry
    .command("enable")
    .description("Enable telemetry for this machine")
    .option("--api-key <key>", "PostHog project write key (overrides env)")
    .option("--host <url>", "PostHog ingestion host (defaults to us.i.posthog.com)")
    .action(async (opts) => { await telemetryEnable(opts); });

  telemetry
    .command("disable")
    .description("Disable telemetry for this machine")
    .option("--purge-anon-id", "Also delete the persisted anon id file")
    .action(async (opts) => { await telemetryDisable(opts); });

  telemetry
    .command("identify")
    .description("Re-identify against the hosted overlay and flush queued events")
    .action(async () => { await telemetryIdentifyOverlay(); });
}

export function registerEnvelopeCommands(target: Command): void {
  const envelope = target
    .command("envelope")
    .description("Capability envelope issuance + observability (hosted issuer ↔ local registry)");

  envelope
    .command("status")
    .description("Inspect the active capability envelope")
    .option("--json", "Emit JSON")
    .action(async (opts) => { await envelopeStatus(opts); });

  envelope
    .command("pair")
    .description("Pair this machine with the hosted Growthub issuer and accept an envelope")
    .option("--tier <tier>", `Override tier (${TIERS.join(" | ")})`)
    .option("--axes <list>", "Comma-separated capability axes (overrides default tier bundle)")
    .option("--expires-at <iso>", "Absolute expiry timestamp")
    .option("--issuer <name>", "Issuer identifier (default: growthub-hosted)")
    .action(async (opts) => { await envelopePair(opts); });

  envelope
    .command("grant")
    .description("Issue a local capability envelope (offline / enterprise-admin flow)")
    .option("--tier <tier>", `Tier to issue (${TIERS.join(" | ")})`)
    .option("--axes <list>", "Comma-separated capability axes")
    .option("--expires-at <iso>", "Absolute expiry timestamp")
    .option("--issuer <name>", "Issuer identifier")
    .option("--user-id <id>", "Attach a user id to the envelope")
    .option("--org-id <id>", "Attach an org id to the envelope")
    .action(async (opts) => { await envelopeGrant(opts); });

  envelope
    .command("revoke")
    .description("Revoke the active envelope")
    .action(async () => { await envelopeRevoke(); });
}
