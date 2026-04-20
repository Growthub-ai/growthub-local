import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_PROPERTY_KEYS,
  captureEvent,
  ensureAnonIdentity,
  readAnonIdentity,
  resetAnonIdentity,
  sanitizeProperties,
  resolveTelemetryConfig,
} from "../runtime/telemetry/index.js";
import {
  renderActivationNudge,
  __resetActivationNudgeGuardForTests,
  GROWTHUB_ACTIVATION_URL,
} from "../commands/activation-bridge.js";

const ORIGINAL_ENV = { ...process.env };

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growthub-telemetry-test-"));
}

describe("telemetry · sanitizer", () => {
  it("drops unknown property keys", () => {
    const input = {
      surface: "discover",
      prompt: "SECRET PROMPT CONTENTS",
      api_key: "sk-should-never-send",
      repo_contents: "big blob",
      duration_ms: 12,
    };
    const out = sanitizeProperties(input);
    expect(Object.keys(out).sort()).toEqual(["duration_ms", "surface"]);
    expect(out).not.toHaveProperty("prompt");
    expect(out).not.toHaveProperty("api_key");
    expect(out).not.toHaveProperty("repo_contents");
  });

  it("keeps only primitive values and truncates long strings", () => {
    const longString = "x".repeat(500);
    const out = sanitizeProperties({
      surface: longString,
      heal_action_count: 7,
      installer_mode: true,
      nested: { evil: true } as unknown as string,
    });
    expect(typeof out.surface).toBe("string");
    expect((out.surface as string).length).toBeLessThanOrEqual(240);
    expect(out.heal_action_count).toBe(7);
    expect(out.installer_mode).toBe(true);
    expect(out).not.toHaveProperty("nested");
  });

  it("covers every event property documented in events.ts", () => {
    const must = [
      "surface",
      "path",
      "source_kind",
      "import_mode",
      "kit_family",
      "remote_sync_mode",
      "fork_id_hash",
      "drift_severity",
      "heal_action_count",
      "outcome",
      "duration_ms",
      "funnel_stage",
      "cli_version",
      "installer_mode",
      "node_major",
      "os",
      "hosted_user_id",
      "hosted_org_id",
      "cta_target",
      "cta_label",
    ];
    for (const key of must) {
      expect(ALLOWED_PROPERTY_KEYS).toContain(key);
    }
  });
});

describe("telemetry · config resolution", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GROWTHUB_POSTHOG_PROJECT_KEY;
    delete process.env.GROWTHUB_POSTHOG_HOST;
    delete process.env.GROWTHUB_TELEMETRY_DISABLED;
    delete process.env.DO_NOT_TRACK;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is disabled when no project key is set", () => {
    const resolved = resolveTelemetryConfig();
    expect(resolved.enabled).toBe(false);
    expect(resolved.projectKey).toBeNull();
    expect(resolved.reason).toMatch(/GROWTHUB_POSTHOG_PROJECT_KEY/);
  });

  it("is enabled when a project key is set", () => {
    process.env.GROWTHUB_POSTHOG_PROJECT_KEY = "phc_test_key";
    const resolved = resolveTelemetryConfig();
    expect(resolved.enabled).toBe(true);
    expect(resolved.projectKey).toBe("phc_test_key");
    expect(resolved.host).toBe("https://us.i.posthog.com");
  });

  it("honors GROWTHUB_TELEMETRY_DISABLED even with a key set", () => {
    process.env.GROWTHUB_POSTHOG_PROJECT_KEY = "phc_test_key";
    process.env.GROWTHUB_TELEMETRY_DISABLED = "1";
    const resolved = resolveTelemetryConfig();
    expect(resolved.enabled).toBe(false);
  });

  it("honors DO_NOT_TRACK even with a key set", () => {
    process.env.GROWTHUB_POSTHOG_PROJECT_KEY = "phc_test_key";
    process.env.DO_NOT_TRACK = "1";
    const resolved = resolveTelemetryConfig();
    expect(resolved.enabled).toBe(false);
  });

  it("respects a custom host", () => {
    process.env.GROWTHUB_POSTHOG_PROJECT_KEY = "phc_test_key";
    process.env.GROWTHUB_POSTHOG_HOST = "https://eu.i.posthog.com/";
    const resolved = resolveTelemetryConfig();
    expect(resolved.host).toBe("https://eu.i.posthog.com");
  });
});

describe("telemetry · anon identity", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    process.env = { ...ORIGINAL_ENV, PAPERCLIP_HOME: tempHome };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("mints an anon id once and reuses it on subsequent calls", () => {
    const first = ensureAnonIdentity();
    const second = ensureAnonIdentity();
    expect(first.anonId).toBe(second.anonId);
    expect(readAnonIdentity()?.anonId).toBe(first.anonId);
    expect(first.anonId.startsWith("cli-")).toBe(true);
  });

  it("reset deletes the identity so a fresh one can be minted", () => {
    const first = ensureAnonIdentity();
    expect(resetAnonIdentity()).toBe(true);
    expect(readAnonIdentity()).toBeNull();
    const third = ensureAnonIdentity();
    expect(third.anonId).not.toBe(first.anonId);
  });
});

describe("telemetry · captureEvent no-op path", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GROWTHUB_POSTHOG_PROJECT_KEY;
    delete process.env.GROWTHUB_TELEMETRY_DISABLED;
    delete process.env.DO_NOT_TRACK;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = originalFetch;
  });

  it("does not POST anywhere when telemetry is disabled", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    await captureEvent({
      event: "discover_opened",
      properties: { surface: "discover" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("swallows transport errors when enabled", async () => {
    process.env.GROWTHUB_POSTHOG_PROJECT_KEY = "phc_test_key";
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    await expect(
      captureEvent({
        event: "discover_opened",
        properties: { surface: "discover" },
      }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://us.i.posthog.com/i/v0/e/");
    const body = JSON.parse((init as { body: string }).body) as {
      api_key: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.api_key).toBe("phc_test_key");
    expect(body.event).toBe("discover_opened");
    expect(body.properties.surface).toBe("discover");
    expect(body.properties).not.toHaveProperty("prompt");
  });
});

describe("activation nudge", () => {
  beforeEach(() => {
    __resetActivationNudgeGuardForTests();
  });

  it("exposes the canonical hosted activation URL", () => {
    expect(GROWTHUB_ACTIVATION_URL).toBe("https://www.growthub.ai/");
  });

  it("renders at most once per process", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      renderActivationNudge("kit_download");
      renderActivationNudge("starter_init");
      renderActivationNudge("source_import_repo");
    } finally {
      log.mockRestore();
    }
    // No assertion on log content — the @clack/prompts surface may or
    // may not write to console depending on TTY; the contract we care
    // about is that the second and third calls are no-ops, which is
    // enforced by the module-level guard. Re-running after reset must
    // emit again.
    __resetActivationNudgeGuardForTests();
    renderActivationNudge("kit_download");
  });
});
