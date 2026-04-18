/**
 * Kit Fork Authority
 *
 * Makes the hosted authority plane explicit as protocol.
 *
 * An AuthorityEnvelope is a signed, verifiable, replay-resistant attestation
 * issued by a trusted authority (typically the hosted Growthub plane) that
 * binds a specific fork state — kitId, forkId, optional policy hash — to a
 * declared set of grants (capabilities, policy approval). The envelope is
 * portable and inspectable: canonical JSON + ed25519 signature over a
 * deterministic subset of fields.
 *
 * Local fork state quad:
 *   .growthub-fork/fork.json       — identity          (fork-registry)
 *   .growthub-fork/policy.json     — contract          (fork-policy)
 *   .growthub-fork/trace.jsonl     — history           (fork-trace)
 *   .growthub-fork/authority.json  — attestation state (this module)
 *
 * Storage is additive: forks without an authority.json are "operator-local"
 * — they keep working exactly as before. An attached envelope promotes them
 * to "authority-attested" for downstream agents that care.
 *
 * Trust root:
 *   GROWTHUB_AUTHORITY_HOME/issuers.json  (default: ~/.growthub/authority/)
 *
 * No issuer is trusted by default. Operators pair issuers explicitly (in v1
 * by writing the registry file; future: via `growthub account connect`).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandHomePrefix } from "../config/home.js";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";
import type { KitForkPolicy } from "./fork-policy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthorityAlgorithm = "ed25519";

export type AuthorityCapability =
  | "remote-sync-enabled"
  | "remote-pr-open"
  | "script-execution"
  | "auto-approve-all"
  | "enterprise-managed";

export type AuthorityIssuerKind =
  | "growthub-hosted"
  | "self-signed"
  | "enterprise";

/** What the envelope is attesting over. */
export interface AuthoritySubject {
  kitId: string;
  forkId: string;
  /**
   * Optional absolute fork path. Omitted → envelope is path-portable (can be
   * attached to a moved fork by forkId alone).
   */
  forkPath?: string;
  /**
   * Optional canonical sha-256 of the policy at the moment of issuance.
   * When present, verification checks the current on-disk policy hash and
   * reports `policyHashMatches`. When absent, the envelope attests the fork
   * identity only, not a specific policy snapshot.
   */
  policyHash?: string;
}

export interface AuthorityGrants {
  /** Capabilities the authority has granted for this fork. */
  capabilities: AuthorityCapability[];
  /** True iff the policy at `subject.policyHash` has been blessed. */
  policyAttested: boolean;
  /** Human-readable label surfaced in CLI + trace. */
  note?: string;
}

export interface AuthorityEnvelope {
  version: 1;
  envelopeId: string;
  issuerId: string;
  algorithm: AuthorityAlgorithm;
  subject: AuthoritySubject;
  grants: AuthorityGrants;
  issuedAt: string;
  /** Optional ISO expiry. Absent → no expiry. */
  expiresAt?: string;
  /** Hex-random replay guard, part of the signed payload. */
  nonce: string;
  /** Base64-encoded ed25519 signature over the canonical payload. */
  signature: string;
}

export interface AuthorityIssuer {
  id: string;
  publicKeyPem: string;
  kind: AuthorityIssuerKind;
  label?: string;
  /** Optional ISO timestamp at which the issuer was added locally. */
  addedAt?: string;
}

export interface AuthorityIssuerRegistry {
  version: 1;
  issuers: AuthorityIssuer[];
}

/** Current in-fork authority state. */
export type AuthorityLocalState =
  | { state: "none"; version: 1; updatedAt: string }
  | {
      state: "attested";
      version: 1;
      envelope: AuthorityEnvelope;
      updatedAt: string;
    }
  | {
      state: "revoked";
      version: 1;
      envelope: AuthorityEnvelope;
      revocation: { reason?: string; revokedAt: string };
      updatedAt: string;
    };

export type AuthorityVerification =
  | {
      ok: true;
      issuer: AuthorityIssuer;
      policyHashMatches?: boolean;
    }
  | {
      ok: false;
      reason:
        | "unknown-issuer"
        | "bad-signature"
        | "expired"
        | "malformed"
        | "subject-mismatch";
      detail?: string;
    };

// ---------------------------------------------------------------------------
// Home resolution
// ---------------------------------------------------------------------------

export function resolveAuthorityHomeDir(): string {
  const env = process.env.GROWTHUB_AUTHORITY_HOME?.trim();
  if (env) return path.resolve(expandHomePrefix(env));
  return path.resolve(os.homedir(), ".growthub", "authority");
}

export function resolveAuthorityIssuersPath(): string {
  return path.resolve(resolveAuthorityHomeDir(), "issuers.json");
}

export function resolveInForkAuthorityPath(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "authority.json");
}

// ---------------------------------------------------------------------------
// Canonical serialization — stable, sorted-keys JSON
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return (
      "{" +
      entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v)).join(",") +
      "}"
    );
  }
  throw new Error(`Unsupported value type for canonicalize: ${typeof value}`);
}

/** Canonical string signed by the issuer. */
export function buildSigningPayload(
  envelope: Omit<AuthorityEnvelope, "signature">,
): string {
  return canonicalize({
    version: envelope.version,
    envelopeId: envelope.envelopeId,
    issuerId: envelope.issuerId,
    algorithm: envelope.algorithm,
    subject: envelope.subject,
    grants: envelope.grants,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    nonce: envelope.nonce,
  });
}

/**
 * Canonical sha-256 hex of a policy snapshot, suitable for binding into
 * `subject.policyHash`. Stable across reorderings of JSON keys.
 */
export function computePolicyHash(policy: KitForkPolicy): string {
  // Hash a version-tagged shape minus the mutable updatedAt field so
  // equivalent policies produce the same hash regardless of write timing.
  const shape = {
    version: policy.version,
    untouchablePaths: [...policy.untouchablePaths].sort(),
    confirmBeforeChange: [...policy.confirmBeforeChange].sort(),
    autoApprove: policy.autoApprove,
    autoApproveDepUpdates: policy.autoApproveDepUpdates,
    remoteSyncMode: policy.remoteSyncMode,
    interactiveConflicts: policy.interactiveConflicts,
    allowedScripts: [...policy.allowedScripts].sort(),
  };
  return crypto.createHash("sha256").update(canonicalize(shape), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Issuer registry
// ---------------------------------------------------------------------------

export function readIssuerRegistry(): AuthorityIssuerRegistry {
  const p = resolveAuthorityIssuersPath();
  if (!fs.existsSync(p)) return { version: 1, issuers: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<AuthorityIssuerRegistry>;
    if (!parsed || !Array.isArray(parsed.issuers)) return { version: 1, issuers: [] };
    return { version: 1, issuers: parsed.issuers.filter(isValidIssuer) };
  } catch {
    return { version: 1, issuers: [] };
  }
}

function isValidIssuer(x: unknown): x is AuthorityIssuer {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<AuthorityIssuer>;
  return (
    typeof o.id === "string" &&
    typeof o.publicKeyPem === "string" &&
    (o.kind === "growthub-hosted" || o.kind === "self-signed" || o.kind === "enterprise")
  );
}

export function writeIssuerRegistry(registry: AuthorityIssuerRegistry): void {
  const p = resolveAuthorityIssuersPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, issuers: registry.issuers }, null, 2) + "\n", "utf8");
}

export function upsertIssuer(issuer: AuthorityIssuer): AuthorityIssuerRegistry {
  if (!isValidIssuer(issuer)) {
    throw new Error("Invalid issuer: id, publicKeyPem, and kind are required.");
  }
  const reg = readIssuerRegistry();
  const idx = reg.issuers.findIndex((i) => i.id === issuer.id);
  const stamped: AuthorityIssuer = { ...issuer, addedAt: issuer.addedAt ?? new Date().toISOString() };
  if (idx >= 0) reg.issuers[idx] = stamped;
  else reg.issuers.push(stamped);
  writeIssuerRegistry(reg);
  return reg;
}

export function removeIssuer(issuerId: string): boolean {
  const reg = readIssuerRegistry();
  const next = reg.issuers.filter((i) => i.id !== issuerId);
  if (next.length === reg.issuers.length) return false;
  writeIssuerRegistry({ version: 1, issuers: next });
  return true;
}

export function findIssuer(issuerId: string): AuthorityIssuer | null {
  return readIssuerRegistry().issuers.find((i) => i.id === issuerId) ?? null;
}

// ---------------------------------------------------------------------------
// Sign / verify
// ---------------------------------------------------------------------------

export interface SignAuthorityEnvelopeInput {
  issuerId: string;
  privateKeyPem: string;
  subject: AuthoritySubject;
  grants: AuthorityGrants;
  ttlMs?: number;
  issuedAt?: string;
  envelopeId?: string;
  nonce?: string;
}

/**
 * Produce a signed AuthorityEnvelope. Intended for tests and for the hosted
 * plane's reference signing implementation; local operators never hold issuer
 * private keys.
 */
export function signAuthorityEnvelope(input: SignAuthorityEnvelopeInput): AuthorityEnvelope {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const expiresAt =
    input.ttlMs != null ? new Date(Date.now() + input.ttlMs).toISOString() : undefined;
  const envelopeId = input.envelopeId ?? `ae-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const nonce = input.nonce ?? crypto.randomBytes(16).toString("hex");

  const unsigned: Omit<AuthorityEnvelope, "signature"> = {
    version: 1,
    envelopeId,
    issuerId: input.issuerId,
    algorithm: "ed25519",
    subject: input.subject,
    grants: input.grants,
    issuedAt,
    expiresAt,
    nonce,
  };

  const payload = buildSigningPayload(unsigned);
  const keyObject = crypto.createPrivateKey({ key: input.privateKeyPem, format: "pem" });
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), keyObject).toString("base64");

  return { ...unsigned, signature };
}

export interface VerifyAuthorityEnvelopeOptions {
  expectedForkId?: string;
  expectedKitId?: string;
  expectedForkPath?: string;
  now?: Date;
  issuerOverride?: AuthorityIssuer;
}

export function verifyAuthorityEnvelope(
  envelope: AuthorityEnvelope,
  options: VerifyAuthorityEnvelopeOptions = {},
): AuthorityVerification {
  if (!isWellFormedEnvelope(envelope)) {
    return { ok: false, reason: "malformed", detail: "envelope shape invalid" };
  }

  if (options.expectedKitId && envelope.subject.kitId !== options.expectedKitId) {
    return { ok: false, reason: "subject-mismatch", detail: `kitId expected ${options.expectedKitId}` };
  }
  if (options.expectedForkId && envelope.subject.forkId !== options.expectedForkId) {
    return { ok: false, reason: "subject-mismatch", detail: `forkId expected ${options.expectedForkId}` };
  }
  if (options.expectedForkPath && envelope.subject.forkPath && envelope.subject.forkPath !== options.expectedForkPath) {
    return { ok: false, reason: "subject-mismatch", detail: `forkPath expected ${options.expectedForkPath}` };
  }

  const now = options.now ?? new Date();
  if (envelope.expiresAt) {
    const exp = Date.parse(envelope.expiresAt);
    if (!Number.isFinite(exp) || exp <= now.getTime()) {
      return { ok: false, reason: "expired", detail: envelope.expiresAt };
    }
  }

  const issuer = options.issuerOverride ?? findIssuer(envelope.issuerId);
  if (!issuer) {
    return { ok: false, reason: "unknown-issuer", detail: envelope.issuerId };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(envelope.signature, "base64");
  } catch {
    return { ok: false, reason: "bad-signature", detail: "signature is not base64" };
  }

  let ok = false;
  try {
    const { signature: _omit, ...unsigned } = envelope;
    const payload = buildSigningPayload(unsigned);
    const pubKey = crypto.createPublicKey({ key: issuer.publicKeyPem, format: "pem" });
    ok = crypto.verify(null, Buffer.from(payload, "utf8"), pubKey, signatureBytes);
  } catch (err) {
    return { ok: false, reason: "bad-signature", detail: (err as Error).message };
  }
  if (!ok) return { ok: false, reason: "bad-signature" };

  return { ok: true, issuer };
}

function isWellFormedEnvelope(x: unknown): x is AuthorityEnvelope {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<AuthorityEnvelope>;
  return (
    e.version === 1 &&
    typeof e.envelopeId === "string" &&
    typeof e.issuerId === "string" &&
    e.algorithm === "ed25519" &&
    typeof e.signature === "string" &&
    typeof e.issuedAt === "string" &&
    typeof e.nonce === "string" &&
    !!e.subject &&
    typeof e.subject.kitId === "string" &&
    typeof e.subject.forkId === "string" &&
    !!e.grants &&
    Array.isArray(e.grants.capabilities) &&
    typeof e.grants.policyAttested === "boolean"
  );
}

// ---------------------------------------------------------------------------
// In-fork state read / write
// ---------------------------------------------------------------------------

export function readForkAuthorityState(forkPath: string): AuthorityLocalState {
  const p = resolveInForkAuthorityPath(forkPath);
  if (!fs.existsSync(p)) {
    return { state: "none", version: 1, updatedAt: new Date(0).toISOString() };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as AuthorityLocalState;
    if (!parsed || parsed.version !== 1) {
      return { state: "none", version: 1, updatedAt: new Date(0).toISOString() };
    }
    return parsed;
  } catch {
    return { state: "none", version: 1, updatedAt: new Date(0).toISOString() };
  }
}

function writeForkAuthorityState(forkPath: string, state: AuthorityLocalState): void {
  const p = resolveInForkAuthorityPath(forkPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// High-level API (composed by CLI + starter init + source-import)
// ---------------------------------------------------------------------------

export interface AttachAuthorityResult {
  state: AuthorityLocalState;
  verification: AuthorityVerification;
}

/**
 * Verify an envelope and persist it as the fork's attestation state.
 * Throws when verification fails — callers decide how to surface.
 */
export function attachAuthorityEnvelope(
  forkPath: string,
  envelope: AuthorityEnvelope,
  options: VerifyAuthorityEnvelopeOptions = {},
): AttachAuthorityResult {
  const verification = verifyAuthorityEnvelope(envelope, options);
  if (!verification.ok) {
    throw new Error(
      `Authority envelope rejected (${verification.reason}${verification.detail ? `: ${verification.detail}` : ""}).`,
    );
  }
  const state: AuthorityLocalState = {
    state: "attested",
    version: 1,
    envelope,
    updatedAt: new Date().toISOString(),
  };
  writeForkAuthorityState(forkPath, state);
  return { state, verification };
}

export function revokeForkAuthority(
  forkPath: string,
  reason?: string,
): AuthorityLocalState {
  const current = readForkAuthorityState(forkPath);
  if (current.state !== "attested") {
    throw new Error("No active authority envelope to revoke.");
  }
  const next: AuthorityLocalState = {
    state: "revoked",
    version: 1,
    envelope: current.envelope,
    revocation: { reason, revokedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  writeForkAuthorityState(forkPath, next);
  return next;
}

export function clearForkAuthority(forkPath: string): void {
  const p = resolveInForkAuthorityPath(forkPath);
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

// ---------------------------------------------------------------------------
// Policy origin resolution
// ---------------------------------------------------------------------------

export type PolicyOrigin =
  | "operator-local"
  | "authority-attested"
  | "authority-revoked";

export interface PolicyAttestationSummary {
  origin: PolicyOrigin;
  verification?: AuthorityVerification;
  envelope?: AuthorityEnvelope;
  policyHashMatches?: boolean;
  revokedReason?: string;
}

/**
 * Classify the current policy against any attached authority envelope.
 * Pure with respect to filesystem + registry at call time.
 */
export function describePolicyAttestation(
  forkPath: string,
  policy: KitForkPolicy,
  options: { expectedForkId?: string; expectedKitId?: string; now?: Date } = {},
): PolicyAttestationSummary {
  const stateRecord = readForkAuthorityState(forkPath);
  if (stateRecord.state === "none") {
    return { origin: "operator-local" };
  }
  if (stateRecord.state === "revoked") {
    return {
      origin: "authority-revoked",
      envelope: stateRecord.envelope,
      revokedReason: stateRecord.revocation.reason,
    };
  }
  const envelope = stateRecord.envelope;
  const verification = verifyAuthorityEnvelope(envelope, {
    expectedForkId: options.expectedForkId,
    expectedKitId: options.expectedKitId,
    now: options.now,
  });
  if (!verification.ok) {
    return { origin: "operator-local", envelope, verification };
  }
  const policyHashMatches = envelope.subject.policyHash
    ? envelope.subject.policyHash === computePolicyHash(policy)
    : undefined;
  return {
    origin: "authority-attested",
    envelope,
    verification,
    policyHashMatches,
  };
}

/**
 * Return true iff the authority currently grants the capability AND the
 * envelope verifies AND (if policy binding exists) the on-disk policy hash
 * still matches. This is the single gate downstream agents should consult.
 */
export function hasAuthorityCapability(
  summary: PolicyAttestationSummary,
  capability: AuthorityCapability,
): boolean {
  if (summary.origin !== "authority-attested") return false;
  if (!summary.envelope) return false;
  if (summary.envelope.subject.policyHash && summary.policyHashMatches === false) return false;
  return summary.envelope.grants.capabilities.includes(capability);
}
