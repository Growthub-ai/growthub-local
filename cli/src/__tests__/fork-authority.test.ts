/**
 * Kit Fork Authority — Unit Tests
 *
 * Covers the authority protocol end-to-end without touching the network:
 *
 *   - canonical serialization is stable across key ordering
 *   - computePolicyHash is deterministic + shape-sensitive
 *   - sign + verify round-trip with an ed25519 keypair
 *   - tampered signature, tampered subject, tampered grants all fail
 *   - expired envelopes fail verification
 *   - unknown issuer fails verification
 *   - attach + read + describePolicyAttestation across states
 *   - revoke transitions through authority-revoked origin
 *   - hasAuthorityCapability gate is correct wrt policyHash drift
 *   - issuer registry round-trip at GROWTHUB_AUTHORITY_HOME
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDefaultKitForkPolicy, writeKitForkPolicy, type KitForkPolicy } from "../kits/fork-policy.js";
import {
  attachAuthorityEnvelope,
  buildSigningPayload,
  clearForkAuthority,
  computePolicyHash,
  describePolicyAttestation,
  findIssuer,
  hasAuthorityCapability,
  readForkAuthorityState,
  readIssuerRegistry,
  removeIssuer,
  resolveAuthorityIssuersPath,
  resolveInForkAuthorityPath,
  revokeForkAuthority,
  signAuthorityEnvelope,
  upsertIssuer,
  verifyAuthorityEnvelope,
  type AuthorityEnvelope,
  type AuthorityIssuer,
} from "../kits/fork-authority.js";

const ORIGINAL_ENV = { ...process.env };

function makeAuthorityHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growthub-authority-"));
}

function makeForkDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fork-authority-"));
}

interface KeyMaterial {
  publicKeyPem: string;
  privateKeyPem: string;
}

function newEd25519Key(): KeyMaterial {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

function registerIssuer(id: string, publicKeyPem: string): AuthorityIssuer {
  const reg = upsertIssuer({ id, publicKeyPem, kind: "self-signed", label: `test ${id}` });
  const found = reg.issuers.find((i) => i.id === id);
  if (!found) throw new Error("issuer not registered");
  return found;
}

function mintEnvelope(
  key: KeyMaterial,
  overrides: Partial<Parameters<typeof signAuthorityEnvelope>[0]> = {},
): AuthorityEnvelope {
  return signAuthorityEnvelope({
    issuerId: "test-hosted",
    privateKeyPem: key.privateKeyPem,
    subject: { kitId: "creative-strategist-v1", forkId: "fork-a", ...(overrides.subject ?? {}) },
    grants: {
      capabilities: ["remote-sync-enabled"],
      policyAttested: true,
      note: "Hosted approval for fork-a",
      ...(overrides.grants ?? {}),
    },
    ttlMs: overrides.ttlMs,
    issuedAt: overrides.issuedAt,
    envelopeId: overrides.envelopeId,
    nonce: overrides.nonce,
    ...(overrides.issuerId ? { issuerId: overrides.issuerId } : {}),
  });
}

beforeEach(() => {
  const home = makeAuthorityHome();
  process.env = { ...ORIGINAL_ENV, GROWTHUB_AUTHORITY_HOME: home };
});

afterEach(() => {
  const home = process.env.GROWTHUB_AUTHORITY_HOME;
  if (home && fs.existsSync(home)) fs.rmSync(home, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

describe("buildSigningPayload canonicalization", () => {
  it("produces the same string regardless of key insertion order", () => {
    const key = newEd25519Key();
    const envA = mintEnvelope(key, { nonce: "n1", issuedAt: "2026-01-01T00:00:00Z", envelopeId: "ae-x" });
    const { signature: _s1, ...unsignedA } = envA;
    const reordered: Omit<AuthorityEnvelope, "signature"> = {
      nonce: envA.nonce,
      grants: envA.grants,
      subject: envA.subject,
      version: envA.version,
      envelopeId: envA.envelopeId,
      issuerId: envA.issuerId,
      algorithm: envA.algorithm,
      issuedAt: envA.issuedAt,
      expiresAt: envA.expiresAt,
    };
    expect(buildSigningPayload(unsignedA)).toBe(buildSigningPayload(reordered));
  });

  it("omits undefined expiresAt from the signed payload", () => {
    const key = newEd25519Key();
    const envA = mintEnvelope(key, { nonce: "same", issuedAt: "2026-01-01T00:00:00Z", envelopeId: "ae-x" });
    const payload = buildSigningPayload({ ...envA, expiresAt: undefined });
    expect(payload).not.toContain("expiresAt");
  });
});

// ---------------------------------------------------------------------------
// computePolicyHash
// ---------------------------------------------------------------------------

describe("computePolicyHash", () => {
  it("is deterministic and order-insensitive for array members", () => {
    const a: KitForkPolicy = {
      ...makeDefaultKitForkPolicy(),
      untouchablePaths: ["b", "a"],
      confirmBeforeChange: ["kit.json", "package.json"],
      allowedScripts: ["scripts/y.sh", "scripts/x.sh"],
    };
    const b: KitForkPolicy = {
      ...makeDefaultKitForkPolicy(),
      untouchablePaths: ["a", "b"],
      confirmBeforeChange: ["package.json", "kit.json"],
      allowedScripts: ["scripts/x.sh", "scripts/y.sh"],
    };
    expect(computePolicyHash(a)).toBe(computePolicyHash(b));
  });

  it("changes when any semantic field changes", () => {
    const base = makeDefaultKitForkPolicy();
    const h1 = computePolicyHash(base);
    const h2 = computePolicyHash({ ...base, autoApprove: "all" });
    expect(h1).not.toBe(h2);
  });

  it("ignores updatedAt drift", () => {
    const a = makeDefaultKitForkPolicy();
    const b = { ...a, updatedAt: "2100-01-01T00:00:00Z" };
    expect(computePolicyHash(a)).toBe(computePolicyHash(b));
  });
});

// ---------------------------------------------------------------------------
// Sign / verify
// ---------------------------------------------------------------------------

describe("signAuthorityEnvelope + verifyAuthorityEnvelope", () => {
  it("round-trips with a registered issuer", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key);
    const result = verifyAuthorityEnvelope(env);
    expect(result.ok).toBe(true);
  });

  it("rejects tampered signature", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key);
    const bad = { ...env, signature: Buffer.from("not-real").toString("base64") };
    const result = verifyAuthorityEnvelope(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("rejects tampered subject", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key);
    const bad: AuthorityEnvelope = { ...env, subject: { ...env.subject, forkId: "someone-else" } };
    const result = verifyAuthorityEnvelope(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("rejects tampered grants", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key);
    const bad: AuthorityEnvelope = {
      ...env,
      grants: { ...env.grants, capabilities: [...env.grants.capabilities, "auto-approve-all"] },
    };
    const result = verifyAuthorityEnvelope(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("fails when the issuer is not trusted", () => {
    const key = newEd25519Key();
    const env = mintEnvelope(key); // issuer not registered
    const result = verifyAuthorityEnvelope(env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown-issuer");
  });

  it("fails on expiry", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key, { ttlMs: 1000 });
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = verifyAuthorityEnvelope(env, { now: future });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("fails on subject mismatch when caller pins expected IDs", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const env = mintEnvelope(key);
    const result = verifyAuthorityEnvelope(env, { expectedForkId: "different-fork" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("subject-mismatch");
  });

  it("rejects malformed envelopes", () => {
    const result = verifyAuthorityEnvelope({} as unknown as AuthorityEnvelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("accepts issuerOverride for offline verification", () => {
    const key = newEd25519Key();
    const issuer: AuthorityIssuer = { id: "test-hosted", kind: "self-signed", publicKeyPem: key.publicKeyPem };
    const env = mintEnvelope(key);
    const result = verifyAuthorityEnvelope(env, { issuerOverride: issuer });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issuer registry
// ---------------------------------------------------------------------------

describe("issuer registry", () => {
  it("writes to GROWTHUB_AUTHORITY_HOME", () => {
    const key = newEd25519Key();
    upsertIssuer({ id: "test-hosted", publicKeyPem: key.publicKeyPem, kind: "growthub-hosted" });
    const expected = resolveAuthorityIssuersPath();
    expect(fs.existsSync(expected)).toBe(true);
    expect(expected.startsWith(process.env.GROWTHUB_AUTHORITY_HOME!)).toBe(true);
  });

  it("upsertIssuer replaces an existing issuer by id", () => {
    const k1 = newEd25519Key();
    const k2 = newEd25519Key();
    upsertIssuer({ id: "dup", publicKeyPem: k1.publicKeyPem, kind: "self-signed" });
    upsertIssuer({ id: "dup", publicKeyPem: k2.publicKeyPem, kind: "self-signed" });
    const reg = readIssuerRegistry();
    expect(reg.issuers.filter((i) => i.id === "dup")).toHaveLength(1);
    expect(findIssuer("dup")?.publicKeyPem).toBe(k2.publicKeyPem);
  });

  it("removeIssuer is idempotent", () => {
    const key = newEd25519Key();
    upsertIssuer({ id: "gone", publicKeyPem: key.publicKeyPem, kind: "self-signed" });
    expect(removeIssuer("gone")).toBe(true);
    expect(removeIssuer("gone")).toBe(false);
  });

  it("rejects invalid issuer shape", () => {
    expect(() => upsertIssuer({} as unknown as AuthorityIssuer)).toThrow();
  });

  it("tolerates a missing registry file", () => {
    const reg = readIssuerRegistry();
    expect(reg.issuers).toEqual([]);
  });

  it("tolerates a corrupt registry file", () => {
    fs.mkdirSync(path.dirname(resolveAuthorityIssuersPath()), { recursive: true });
    fs.writeFileSync(resolveAuthorityIssuersPath(), "{not json");
    const reg = readIssuerRegistry();
    expect(reg.issuers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// In-fork state transitions
// ---------------------------------------------------------------------------

describe("in-fork state transitions", () => {
  it("attachAuthorityEnvelope writes authority.json and verifies the envelope", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const env = mintEnvelope(key);

    const result = attachAuthorityEnvelope(forkDir, env, { expectedForkId: "fork-a" });
    expect(result.state.state).toBe("attested");
    const onDisk = resolveInForkAuthorityPath(forkDir);
    expect(fs.existsSync(onDisk)).toBe(true);
    const readBack = readForkAuthorityState(forkDir);
    expect(readBack.state).toBe("attested");
  });

  it("attach throws on verification failure", () => {
    const key = newEd25519Key();
    // issuer intentionally NOT registered
    const forkDir = makeForkDir();
    const env = mintEnvelope(key);
    expect(() => attachAuthorityEnvelope(forkDir, env)).toThrow(/unknown-issuer/);
  });

  it("revokeForkAuthority transitions attested → revoked", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const env = mintEnvelope(key);
    attachAuthorityEnvelope(forkDir, env, { expectedForkId: "fork-a" });
    const next = revokeForkAuthority(forkDir, "operator override");
    expect(next.state).toBe("revoked");
    if (next.state === "revoked") {
      expect(next.revocation.reason).toBe("operator override");
    }
  });

  it("revokeForkAuthority refuses when there is no active attestation", () => {
    const forkDir = makeForkDir();
    expect(() => revokeForkAuthority(forkDir)).toThrow();
  });

  it("clearForkAuthority deletes the state file", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    attachAuthorityEnvelope(forkDir, mintEnvelope(key), { expectedForkId: "fork-a" });
    clearForkAuthority(forkDir);
    expect(fs.existsSync(resolveInForkAuthorityPath(forkDir))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Policy origin + capability gate
// ---------------------------------------------------------------------------

describe("describePolicyAttestation + hasAuthorityCapability", () => {
  it("reports operator-local when no envelope is attached", () => {
    const forkDir = makeForkDir();
    const policy = makeDefaultKitForkPolicy();
    writeKitForkPolicy(forkDir, policy);
    const summary = describePolicyAttestation(forkDir, policy);
    expect(summary.origin).toBe("operator-local");
  });

  it("reports authority-attested and matches the policy hash", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const policy = makeDefaultKitForkPolicy();
    writeKitForkPolicy(forkDir, policy);
    const env = mintEnvelope(key, {
      subject: { kitId: "creative-strategist-v1", forkId: "fork-a", policyHash: computePolicyHash(policy) },
    });
    attachAuthorityEnvelope(forkDir, env, { expectedForkId: "fork-a" });
    const summary = describePolicyAttestation(forkDir, policy, {
      expectedForkId: "fork-a",
      expectedKitId: "creative-strategist-v1",
    });
    expect(summary.origin).toBe("authority-attested");
    expect(summary.policyHashMatches).toBe(true);
    expect(hasAuthorityCapability(summary, "remote-sync-enabled")).toBe(true);
    expect(hasAuthorityCapability(summary, "auto-approve-all")).toBe(false);
  });

  it("detects policy drift after attestation", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const policy = makeDefaultKitForkPolicy();
    writeKitForkPolicy(forkDir, policy);
    const env = mintEnvelope(key, {
      subject: { kitId: "creative-strategist-v1", forkId: "fork-a", policyHash: computePolicyHash(policy) },
    });
    attachAuthorityEnvelope(forkDir, env, { expectedForkId: "fork-a" });

    const drifted: KitForkPolicy = { ...policy, autoApprove: "all" };
    const summary = describePolicyAttestation(forkDir, drifted, { expectedForkId: "fork-a" });
    expect(summary.origin).toBe("authority-attested");
    expect(summary.policyHashMatches).toBe(false);
    // Capability gate closes once policy hash no longer matches
    expect(hasAuthorityCapability(summary, "remote-sync-enabled")).toBe(false);
  });

  it("falls back to operator-local when envelope expires", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const policy = makeDefaultKitForkPolicy();
    const env = mintEnvelope(key, { ttlMs: 1000 });
    attachAuthorityEnvelope(forkDir, env, { expectedForkId: "fork-a" });
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const summary = describePolicyAttestation(forkDir, policy, { now: future });
    expect(summary.origin).toBe("operator-local");
    expect(summary.verification?.ok).toBe(false);
  });

  it("reports authority-revoked after revoke", () => {
    const key = newEd25519Key();
    registerIssuer("test-hosted", key.publicKeyPem);
    const forkDir = makeForkDir();
    const policy = makeDefaultKitForkPolicy();
    attachAuthorityEnvelope(forkDir, mintEnvelope(key), { expectedForkId: "fork-a" });
    revokeForkAuthority(forkDir, "operator revoke");
    const summary = describePolicyAttestation(forkDir, policy);
    expect(summary.origin).toBe("authority-revoked");
    expect(summary.revokedReason).toBe("operator revoke");
    expect(hasAuthorityCapability(summary, "remote-sync-enabled")).toBe(false);
  });
});
