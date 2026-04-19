import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaperclipHomeDir } from "../config/home.js";
import { readHostedOverlay, type HostedProfileOverlay } from "../auth/overlay-store.js";
import { track } from "./posthog-client.js";
import { CliEvents } from "./events.js";

/**
 * Capability envelopes — the mechanism by which the hosted Growthub issuer
 * grants an internal/enterprise customer a scoped set of capability axes
 * to exercise locally.
 *
 * The envelope is a signed-by-hosted-issuer bundle of capability axes. For
 * the v1 local registry, we only persist the resolved envelope and measure
 * which axes the operator actually exercises — that telemetry answers
 * "which axis of the capability enum is most-valued".
 */

export type CapabilityAxis =
  | "video-gen"
  | "image-gen"
  | "audio-gen"
  | "text-gen"
  | "code-gen"
  | "research"
  | "data-analytics"
  | "workflow-orchestration"
  | "fork-sync"
  | "source-import";

export type EnvelopeTier = "free" | "growth" | "scale" | "enterprise";

export interface CapabilityEnvelope {
  version: 1;
  envelopeId: string;
  tier: EnvelopeTier;
  issuedAt: string;
  expiresAt?: string;
  issuer: string;
  userId?: string;
  orgId?: string;
  axes: CapabilityAxis[];
  /** Upper-bound per-axis quotas, when the issuer supplies them. */
  quotas?: Partial<Record<CapabilityAxis, number>>;
  /** Opaque server-signed tag so the hosted issuer can verify later. */
  issuerTag?: string;
}

const TIER_DEFAULTS: Record<EnvelopeTier, CapabilityAxis[]> = {
  free: ["text-gen", "research"],
  growth: ["text-gen", "research", "image-gen", "code-gen", "workflow-orchestration"],
  scale: [
    "text-gen",
    "research",
    "image-gen",
    "code-gen",
    "workflow-orchestration",
    "data-analytics",
    "fork-sync",
    "source-import",
  ],
  enterprise: [
    "text-gen",
    "research",
    "image-gen",
    "code-gen",
    "workflow-orchestration",
    "data-analytics",
    "fork-sync",
    "source-import",
    "video-gen",
    "audio-gen",
  ],
};

function resolveEnvelopeDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "envelopes");
}

export function resolveActiveEnvelopePath(): string {
  return path.resolve(resolveEnvelopeDir(), "active.json");
}

export function resolveExerciseLogPath(): string {
  return path.resolve(resolveEnvelopeDir(), "exercise.log.ndjson");
}

/**
 * Tier → axes fallback used when the hosted issuer returns no bespoke
 * envelope. Keeps local operation sane while the CLI is offline.
 */
export function defaultEnvelopeForTier(tier: EnvelopeTier): CapabilityAxis[] {
  return [...TIER_DEFAULTS[tier]];
}

/**
 * Derive an envelope tier from a hosted overlay's entitlement keys. The
 * hosted app owns the source of truth; this function is the CLI's best-
 * effort shim used when the hosted envelope feed is unavailable.
 */
export function tierFromOverlay(overlay: HostedProfileOverlay | null): EnvelopeTier {
  if (!overlay) return "free";
  const entitlements = new Set(overlay.entitlements.map((key) => key.toLowerCase()));
  if (entitlements.has("enterprise") || entitlements.has("enterprise-tier")) return "enterprise";
  if (entitlements.has("scale") || entitlements.has("scale-tier")) return "scale";
  if (entitlements.has("growth") || entitlements.has("growth-tier") || entitlements.has("premium")) return "growth";
  return "free";
}

interface GrantOptions {
  tier: EnvelopeTier;
  issuer?: string;
  userId?: string;
  orgId?: string;
  axes?: CapabilityAxis[];
  quotas?: Partial<Record<CapabilityAxis, number>>;
  expiresAt?: string;
  issuerTag?: string;
}

export function grantEnvelope(options: GrantOptions): CapabilityEnvelope {
  const envelope: CapabilityEnvelope = {
    version: 1,
    envelopeId: `env_${crypto.randomBytes(8).toString("hex")}`,
    tier: options.tier,
    issuedAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    issuer: options.issuer ?? "growthub-hosted",
    userId: options.userId,
    orgId: options.orgId,
    axes: options.axes ?? defaultEnvelopeForTier(options.tier),
    quotas: options.quotas,
    issuerTag: options.issuerTag,
  };

  writeEnvelope(envelope);

  track(CliEvents.EnvelopeGranted, {
    envelope_id: envelope.envelopeId,
    tier: envelope.tier,
    axes: envelope.axes,
    axis_count: envelope.axes.length,
    issuer: envelope.issuer,
    issued_at: envelope.issuedAt,
    expires_at: envelope.expiresAt ?? null,
  });

  return envelope;
}

export function revokeEnvelope(): boolean {
  const active = readActiveEnvelope();
  const filePath = resolveActiveEnvelopePath();
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  if (active) {
    track(CliEvents.EnvelopeRevoked, {
      envelope_id: active.envelopeId,
      tier: active.tier,
    });
  }
  return true;
}

export function writeEnvelope(envelope: CapabilityEnvelope): void {
  const filePath = resolveActiveEnvelopePath();
  fs.mkdirSync(resolveEnvelopeDir(), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-posix best-effort
  }
}

export function readActiveEnvelope(): CapabilityEnvelope | null {
  const filePath = resolveActiveEnvelopePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CapabilityEnvelope;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.axes)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function isEnvelopeExpired(envelope: CapabilityEnvelope, now: Date = new Date()): boolean {
  if (!envelope.expiresAt) return false;
  const expires = Date.parse(envelope.expiresAt);
  if (Number.isNaN(expires)) return false;
  return expires <= now.getTime();
}

export function envelopeGrantsAxis(envelope: CapabilityEnvelope | null, axis: CapabilityAxis): boolean {
  if (!envelope) return false;
  if (isEnvelopeExpired(envelope)) return false;
  return envelope.axes.includes(axis);
}

export interface ExerciseRecord {
  envelopeId: string;
  axis: CapabilityAxis;
  at: string;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record a single capability-axis exercise against the active envelope.
 *
 * This is the telemetry signal that powers "which axis of the capability
 * enum is most-valued" dashboards. Writes to both PostHog (for aggregation)
 * and a local ndjson log (for on-machine review + enterprise export).
 */
export function recordAxisExercise(
  axis: CapabilityAxis,
  source: string,
  metadata?: Record<string, unknown>,
): ExerciseRecord | null {
  const envelope = readActiveEnvelope();
  if (!envelope) return null;

  const record: ExerciseRecord = {
    envelopeId: envelope.envelopeId,
    axis,
    at: new Date().toISOString(),
    source,
    metadata,
  };

  try {
    fs.mkdirSync(resolveEnvelopeDir(), { recursive: true });
    fs.appendFileSync(resolveExerciseLogPath(), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    // fs failures must never break a command
  }

  track(CliEvents.EnvelopeExercised, {
    envelope_id: envelope.envelopeId,
    tier: envelope.tier,
    axis,
    source,
    ...(metadata ? { metadata } : {}),
  });

  return record;
}

/**
 * Derive an envelope from the current hosted overlay and persist it as the
 * active envelope. The hosted app is the authoritative issuer; this helper
 * is what `auth login` or `envelope pair` call to pair a local registry
 * with the hosted issuer.
 */
export function pairEnvelopeFromOverlay(overrides: Partial<GrantOptions> = {}): CapabilityEnvelope | null {
  const overlay = readHostedOverlay();
  if (!overlay) return null;

  const tier = overrides.tier ?? tierFromOverlay(overlay);
  return grantEnvelope({
    tier,
    issuer: overrides.issuer ?? "growthub-hosted",
    userId: overrides.userId ?? overlay.userId,
    orgId: overrides.orgId ?? overlay.orgId,
    axes: overrides.axes ?? defaultEnvelopeForTier(tier),
    quotas: overrides.quotas,
    expiresAt: overrides.expiresAt,
    issuerTag: overrides.issuerTag,
  });
}
