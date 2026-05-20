/**
 * growthhub-local-awac-auth-proxy-v1 — env-var gate auth unit probes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const AUTH_MODULE = new URL(
  "../../assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/auth.js",
  import.meta.url,
).href;

describe("workspace gate auth", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.GROWTHUB_WORKSPACE_GATE_ENABLED;
    delete process.env.GROWTHUB_WORKSPACE_GATE_USERNAME;
    delete process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD;
    delete process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH;
    delete process.env.GROWTHUB_WORKSPACE_GATE_SECRET;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  async function loadAuth() {
    return import(`${AUTH_MODULE}?t=${Date.now()}`) as Promise<typeof import("../../assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/auth.js")>;
  }

  it("gate is off when env vars are unset", async () => {
    const auth = await loadAuth();
    expect(auth.isGateEnabled()).toBe(false);
  });

  it("gate is on when enabled flag and credentials are set", async () => {
    process.env.GROWTHUB_WORKSPACE_GATE_ENABLED = "1";
    process.env.GROWTHUB_WORKSPACE_GATE_USERNAME = "ops";
    process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD = "local-only";
    process.env.GROWTHUB_WORKSPACE_GATE_SECRET = "test-secret-with-enough-entropy-32";
    const auth = await loadAuth();
    expect(auth.isGateEnabled()).toBe(true);
    expect(auth.verifyGateCredentials("ops", "local-only")).toBe(true);
    expect(auth.verifyGateCredentials("ops", "wrong")).toBe(false);
  });

  it("session token round-trips with HMAC verification", async () => {
    process.env.GROWTHUB_WORKSPACE_GATE_ENABLED = "1";
    process.env.GROWTHUB_WORKSPACE_GATE_USERNAME = "ops";
    process.env.GROWTHUB_WORKSPACE_GATE_PASSWORD = "local-only";
    process.env.GROWTHUB_WORKSPACE_GATE_SECRET = "test-secret-with-enough-entropy-32";
    const auth = await loadAuth();
    const token = auth.createSessionToken("ops");
    expect(auth.verifySessionToken(token)?.sub).toBe("ops");
    expect(auth.verifySessionToken(`${token}x`)).toBeNull();
  });
});
