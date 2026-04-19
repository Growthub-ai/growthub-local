import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveTelemetrySettings,
  writeTelemetrySettings,
  describeTelemetrySettingsPath,
} from "../telemetry/config.js";
import {
  readOrCreateAnonId,
  resolveAnonIdPath,
  clearAnonId,
} from "../telemetry/anon-id.js";
import {
  currentDistinctId,
  identify,
  inspectQueueForTests,
  isEnabled,
  resetForTests,
  track,
} from "../telemetry/posthog-client.js";

const ORIGINAL_ENV = { ...process.env };

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growthub-telemetry-test-"));
}

function setHome(dir: string): void {
  process.env = { ...ORIGINAL_ENV, PAPERCLIP_HOME: dir };
  // Ensure no inherited opt-out flag taints the test.
  delete process.env.GROWTHUB_TELEMETRY_DISABLED;
  delete process.env.GROWTHUB_TELEMETRY_OFF;
  delete process.env.DO_NOT_TRACK;
  delete process.env.GROWTHUB_POSTHOG_API_KEY;
  delete process.env.GROWTHUB_POSTHOG_HOST;
}

describe("telemetry config resolution", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    setHome(tempHome);
    resetForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
    resetForTests();
  });

  it("defaults to disabled when no api key is configured", () => {
    const settings = resolveTelemetrySettings();
    expect(settings.enabled).toBe(false);
    expect(settings.apiKey).toBeNull();
  });

  it("forces disabled when DO_NOT_TRACK=1 is set even with api key", () => {
    process.env.GROWTHUB_POSTHOG_API_KEY = "phc_test";
    process.env.DO_NOT_TRACK = "1";
    const settings = resolveTelemetrySettings();
    expect(settings.enabled).toBe(false);
    expect(settings.apiKey).toBeNull();
  });

  it("enables when env api key is present", () => {
    process.env.GROWTHUB_POSTHOG_API_KEY = "phc_from_env";
    const settings = resolveTelemetrySettings();
    expect(settings.enabled).toBe(true);
    expect(settings.apiKey).toBe("phc_from_env");
    expect(settings.host).toBe("https://us.i.posthog.com");
  });

  it("persists settings to the telemetry settings file", () => {
    writeTelemetrySettings({ enabled: true, apiKey: "phc_file", host: "https://eu.i.posthog.com" });
    const settings = resolveTelemetrySettings();
    expect(settings.enabled).toBe(true);
    expect(settings.apiKey).toBe("phc_file");
    expect(settings.host).toBe("https://eu.i.posthog.com");
    expect(describeTelemetrySettingsPath()).toMatch(/telemetry\/settings\.json$/);
  });

  it("enabled=false in file overrides presence of api key", () => {
    writeTelemetrySettings({ enabled: false, apiKey: "phc_file" });
    const settings = resolveTelemetrySettings();
    expect(settings.enabled).toBe(false);
  });
});

describe("anon id persistence", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    setHome(tempHome);
    resetForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
    resetForTests();
  });

  it("creates an anon id file on first read and returns the same id afterwards", () => {
    const id1 = readOrCreateAnonId();
    expect(id1).toMatch(/^[0-9a-f]{32}$/);
    expect(fs.existsSync(resolveAnonIdPath())).toBe(true);

    const id2 = readOrCreateAnonId();
    expect(id2).toBe(id1);
  });

  it("regenerates when the anon id file is malformed", () => {
    fs.mkdirSync(path.dirname(resolveAnonIdPath()), { recursive: true });
    fs.writeFileSync(resolveAnonIdPath(), "not-a-valid-id");
    const id = readOrCreateAnonId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("clearAnonId removes the file and returns presence state", () => {
    readOrCreateAnonId();
    expect(clearAnonId()).toBe(true);
    expect(fs.existsSync(resolveAnonIdPath())).toBe(false);
    expect(clearAnonId()).toBe(false);
  });
});

describe("posthog client queuing", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = createTempHome();
    setHome(tempHome);
    process.env.GROWTHUB_POSTHOG_API_KEY = "phc_queue_test";
    resetForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tempHome, { recursive: true, force: true });
    resetForTests();
  });

  it("queues track events when enabled", () => {
    expect(isEnabled()).toBe(true);
    track("cli.command.invoked", { command: "auth login" });
    const queue = inspectQueueForTests();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.event).toBe("cli.command.invoked");
    expect(queue[0]?.properties.command).toBe("auth login");
    expect(queue[0]?.distinctId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("identify enqueues $identify with the hosted user id as distinct id", () => {
    identify({
      distinctId: "user_123",
      userId: "user_123",
      email: "ops@growthub.example",
      orgId: "org_abc",
      tier: "enterprise",
    });
    expect(currentDistinctId()).toBe("user_123");

    const queue = inspectQueueForTests();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.event).toBe("$identify");
    const set = (queue[0]?.properties.$set ?? {}) as Record<string, unknown>;
    expect(set.email).toBe("ops@growthub.example");
    expect(set.tier).toBe("enterprise");
  });

  it("tracks are no-ops when telemetry is disabled", () => {
    delete process.env.GROWTHUB_POSTHOG_API_KEY;
    resetForTests();
    track("cli.command.invoked", {});
    expect(inspectQueueForTests()).toHaveLength(0);
  });

  it("respects DO_NOT_TRACK even if api key resolves", () => {
    process.env.DO_NOT_TRACK = "1";
    resetForTests();
    track("cli.command.invoked", {});
    expect(isEnabled()).toBe(false);
    expect(inspectQueueForTests()).toHaveLength(0);
  });
});
