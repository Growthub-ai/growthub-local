import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSession,
  isSessionExpired,
  readSession,
  writeSession,
  describeSessionPath,
} from "../auth/session-store.js";
import {
  clearHostedOverlay,
  readHostedOverlay,
  seedHostedOverlayFromSession,
  writeHostedOverlay,
} from "../auth/overlay-store.js";

const ORIGINAL_ENV = { ...process.env };

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growthub-auth-test-"));
}

describe("cli auth session store", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    process.env = { ...ORIGINAL_ENV, PAPERCLIP_HOME: tempHome };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns null when no session file exists", () => {
    expect(readSession()).toBeNull();
  });

  it("persists and re-reads a session with minimum fields", () => {
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: "2026-04-13T00:00:00.000Z",
    });

    const session = readSession();
    expect(session).not.toBeNull();
    expect(session?.hostedBaseUrl).toBe("https://growthub.example");
    expect(session?.accessToken).toBe("tok_abc");
    expect(describeSessionPath()).toMatch(/auth\/session\.json$/);
  });

  it("ignores session files missing required fields", () => {
    const filePath = describeSessionPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, issuedAt: "2026-04-13" }));
    expect(readSession()).toBeNull();
  });

  it("detects expired sessions via expiresAt", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: new Date().toISOString(),
      expiresAt: past,
    });

    const session = readSession();
    expect(session).not.toBeNull();
    expect(isSessionExpired(session!)).toBe(true);
  });

  it("treats missing expiresAt as non-expired", () => {
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: new Date().toISOString(),
    });
    expect(isSessionExpired(readSession()!)).toBe(false);
  });

  it("clearSession removes the file and returns whether it existed", () => {
    expect(clearSession()).toBe(false);
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: new Date().toISOString(),
    });
    expect(clearSession()).toBe(true);
    expect(readSession()).toBeNull();
  });
});

describe("cli hosted overlay store", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    process.env = { ...ORIGINAL_ENV, PAPERCLIP_HOME: tempHome };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns null when overlay missing", () => {
    expect(readHostedOverlay()).toBeNull();
  });

  it("seeds a fresh overlay from session material", () => {
    const overlay = seedHostedOverlayFromSession({
      hostedBaseUrl: "https://growthub.example",
      userId: "u-1",
      email: "a@b.co",
      orgId: "o-1",
      orgName: "Acme",
      machineLabel: "mbp",
      linkedInstanceId: "default",
    });

    expect(overlay.hostedBaseUrl).toBe("https://growthub.example");
    expect(overlay.executionDefaults.preferredMode).toBe("local");
    expect(overlay.entitlements).toEqual([]);
    expect(overlay.gatedKitSlugs).toEqual([]);
    expect(overlay.linkedInstanceId).toBe("default");
  });

  it("roundtrips overlay JSON with normalization", () => {
    const overlay = seedHostedOverlayFromSession({
      hostedBaseUrl: "https://growthub.example",
      linkedInstanceId: "default",
    });
    writeHostedOverlay({
      ...overlay,
      entitlements: ["premium", "premium", " ", "gated-kit"],
      gatedKitSlugs: [],
    });

    const read = readHostedOverlay();
    expect(read).not.toBeNull();
    expect(read?.entitlements).toEqual(["premium", "gated-kit"]);
  });

  it("clearHostedOverlay wipes the file", () => {
    writeHostedOverlay(
      seedHostedOverlayFromSession({
        hostedBaseUrl: "https://growthub.example",
      }),
    );
    expect(clearHostedOverlay()).toBe(true);
    expect(readHostedOverlay()).toBeNull();
  });
});
