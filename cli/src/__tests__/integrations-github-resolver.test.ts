/**
 * GitHub Resolver — Unit Tests
 *
 * Covers the composed preference order for GitHub access-token resolution:
 *   1. Direct CLI auth (readGithubToken) — when set and unexpired
 *   2. Growthub-hosted bridge (resolveIntegrationCredential)
 *   3. null when neither source is available
 *
 * The bridge is mocked; the direct store is driven by the real filesystem
 * via a GROWTHUB_GITHUB_HOME override so no network or hosted session is
 * touched during the test.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function makeTempHome(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function stubDirectToken(home: string, patch: { expired?: boolean; token?: string }): void {
  fs.mkdirSync(home, { recursive: true });
  const token = {
    version: 1,
    accessToken: patch.token ?? "direct-token-xyz",
    authMode: "pat",
    scopes: ["repo"],
    login: "direct-user",
    userId: 42,
    issuedAt: new Date().toISOString(),
    expiresAt: patch.expired
      ? new Date(Date.now() - 1000).toISOString()
      : new Date(Date.now() + 60_000).toISOString(),
  };
  fs.writeFileSync(path.resolve(home, "token.json"), JSON.stringify(token));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GROWTHUB_GITHUB_HOME = makeTempHome("gh-home-");
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("resolveGithubAccessToken", () => {
  it("returns source=direct when a fresh direct token exists", async () => {
    stubDirectToken(process.env.GROWTHUB_GITHUB_HOME!, { token: "fresh-direct-token" });
    vi.doMock("../integrations/bridge.js", () => ({
      resolveIntegrationCredential: vi.fn(async () => {
        throw new Error("bridge should not be called when direct token is fresh");
      }),
    }));
    const mod = await import("../integrations/github-resolver.js");
    const resolved = await mod.resolveGithubAccessToken();
    expect(resolved).not.toBeNull();
    expect(resolved!.source).toBe("direct");
    expect(resolved!.accessToken).toBe("fresh-direct-token");
  });

  it("falls back to growthub-bridge when direct token is expired", async () => {
    stubDirectToken(process.env.GROWTHUB_GITHUB_HOME!, { expired: true });
    vi.doMock("../integrations/bridge.js", () => ({
      resolveIntegrationCredential: vi.fn(async (providerId: string) => {
        expect(providerId).toBe("github");
        return {
          provider: "github",
          accessToken: "bridge-token-abc",
          handle: "bridge-user",
          scopes: ["repo"],
          source: "growthub-bridge" as const,
        };
      }),
    }));
    const mod = await import("../integrations/github-resolver.js");
    const resolved = await mod.resolveGithubAccessToken();
    expect(resolved).not.toBeNull();
    expect(resolved!.source).toBe("growthub-bridge");
    expect(resolved!.accessToken).toBe("bridge-token-abc");
    expect(resolved!.handle).toBe("bridge-user");
  });

  it("falls back to growthub-bridge when no direct token at all", async () => {
    vi.doMock("../integrations/bridge.js", () => ({
      resolveIntegrationCredential: vi.fn(async () => ({
        provider: "github",
        accessToken: "bridge-only-token",
        source: "growthub-bridge" as const,
      })),
    }));
    const mod = await import("../integrations/github-resolver.js");
    const resolved = await mod.resolveGithubAccessToken();
    expect(resolved!.source).toBe("growthub-bridge");
    expect(resolved!.accessToken).toBe("bridge-only-token");
  });

  it("returns null when neither source is available", async () => {
    vi.doMock("../integrations/bridge.js", () => ({
      resolveIntegrationCredential: vi.fn(async () => null),
    }));
    const mod = await import("../integrations/github-resolver.js");
    const resolved = await mod.resolveGithubAccessToken();
    expect(resolved).toBeNull();
  });
});
