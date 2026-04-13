import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEffectiveProfile, writeEffectiveProfileSnapshot } from "../auth/effective-profile.js";
import { writeSession } from "../auth/session-store.js";
import { writeHostedOverlay, seedHostedOverlayFromSession } from "../auth/overlay-store.js";

const ORIGINAL_ENV = { ...process.env };

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growthub-effective-test-"));
}

describe("effective profile merge", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    process.env = { ...ORIGINAL_ENV, PAPERCLIP_HOME: tempHome, PAPERCLIP_CONFIG: path.join(tempHome, "missing-config.json") };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns a fully unauthenticated profile with no session/overlay/config", () => {
    const effective = computeEffectiveProfile();
    expect(effective.authenticated).toBe(false);
    expect(effective.session.present).toBe(false);
    expect(effective.hosted.present).toBe(false);
    expect(effective.local.hasConfiguredToken).toBe(false);
    expect(effective.executionDefaults.preferredMode).toBe("local");
    expect(effective.executionDefaults.allowServerlessFallback).toBe(false);
    expect(effective.executionDefaults.allowBrowserBridge).toBe(false);
  });

  it("reports authenticated when a non-expired session exists", () => {
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userId: "u-1",
      email: "a@b.co",
    });

    const effective = computeEffectiveProfile();
    expect(effective.authenticated).toBe(true);
    expect(effective.session.present).toBe(true);
    expect(effective.session.expired).toBe(false);
    expect(effective.session.userId).toBe("u-1");
  });

  it("reports not authenticated when session is expired", () => {
    writeSession({
      version: 1,
      hostedBaseUrl: "https://growthub.example",
      accessToken: "tok_abc",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const effective = computeEffectiveProfile();
    expect(effective.authenticated).toBe(false);
    expect(effective.session.present).toBe(true);
    expect(effective.session.expired).toBe(true);
  });

  it("surfaces hosted overlay execution defaults when overlay is present", () => {
    const seeded = seedHostedOverlayFromSession({
      hostedBaseUrl: "https://growthub.example",
    });
    writeHostedOverlay({
      ...seeded,
      executionDefaults: {
        preferredMode: "auto",
        allowServerlessFallback: true,
        allowBrowserBridge: true,
      },
      entitlements: ["enterprise"],
      gatedKitSlugs: ["growthub-enterprise-kit-v1"],
    });

    const effective = computeEffectiveProfile();
    expect(effective.hosted.present).toBe(true);
    expect(effective.hosted.entitlements).toEqual(["enterprise"]);
    expect(effective.executionDefaults.preferredMode).toBe("auto");
    expect(effective.executionDefaults.allowServerlessFallback).toBe(true);
    expect(effective.executionDefaults.allowBrowserBridge).toBe(true);
  });

  it("writes a snapshot file to the profiles directory", () => {
    const effective = computeEffectiveProfile();
    const snapshotPath = writeEffectiveProfileSnapshot(effective);
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    expect(parsed.version).toBe(1);
    expect(parsed.local.instanceId).toBe("default");
  });
});
