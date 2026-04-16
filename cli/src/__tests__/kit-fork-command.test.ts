/**
 * Kit Fork Command — CLI Registration Tests
 *
 * Covers:
 *   - Commander subcommand registration (fork subcommands under kit)
 *   - Top-level fork-sync alias registration
 *   - runKitForkHub export shape
 *   - registerKitForkSubcommands registered by registerKitCommands
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (must be declared before import)
// ---------------------------------------------------------------------------

vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  log: { error: vi.fn(), info: vi.fn() },
  isCancel: () => false,
}));

vi.mock("../utils/banner.js", () => ({ printPaperclipCliBanner: vi.fn() }));
vi.mock("../kits/service.js", () => ({
  listBundledKits: vi.fn(() => []),
  inspectBundledKit: vi.fn(),
  downloadBundledKit: vi.fn(),
  validateKitDirectory: vi.fn(),
  resolveKitPath: vi.fn(),
  fuzzyResolveKitId: vi.fn((id: string) => id),
}));
vi.mock("../kits/fork-registry.js", () => ({
  registerKitFork: vi.fn(),
  loadKitForkRegistration: vi.fn(() => null),
  listKitForkRegistrations: vi.fn(() => []),
  updateKitForkRegistration: vi.fn(),
  deregisterKitFork: vi.fn(() => true),
  resolveKitForksRoot: vi.fn(() => "/tmp/test-forks"),
}));
vi.mock("../kits/fork-sync.js", () => ({
  detectKitForkDrift: vi.fn(),
  buildKitForkHealPlan: vi.fn(),
  applyKitForkHealPlan: vi.fn(),
}));
vi.mock("../kits/fork-sync-agent.js", () => ({
  runKitForkSyncJob: vi.fn(),
  dispatchKitForkSyncJobBackground: vi.fn(() => "kfj-test-job-id"),
  getKitForkSyncJob: vi.fn(() => null),
  listKitForkSyncJobs: vi.fn(() => []),
  cancelKitForkSyncJob: vi.fn(() => false),
  pruneKitForkSyncJobs: vi.fn(() => 0),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("kit-fork.ts exports", () => {
  it("exports registerKitForkCommands and runKitForkHub", async () => {
    const mod = await import("../commands/kit-fork.js");
    expect(typeof mod.registerKitForkCommands).toBe("function");
    expect(typeof mod.runKitForkHub).toBe("function");
    expect(typeof mod.registerKitForkSubcommands).toBe("function");
  });
});

describe("registerKitForkCommands — top-level fork-sync alias", () => {
  it("registers fork-sync command with all expected subcommands", async () => {
    const { Command } = await import("commander");
    const { registerKitForkCommands } = await import("../commands/kit-fork.js");

    const program = new Command();
    program.exitOverride();
    registerKitForkCommands(program);

    const forkSync = program.commands.find((c) => c.name() === "fork-sync");
    expect(forkSync).toBeDefined();

    const subNames = forkSync!.commands.map((c) => c.name());
    expect(subNames).toContain("register");
    expect(subNames).toContain("list");
    expect(subNames).toContain("status");
    expect(subNames).toContain("heal");
    expect(subNames).toContain("jobs");
    expect(subNames).toContain("deregister");
  });

  it("fork-sync has a default action (interactive hub)", async () => {
    const { Command } = await import("commander");
    const { registerKitForkCommands } = await import("../commands/kit-fork.js");

    const program = new Command();
    program.exitOverride();
    registerKitForkCommands(program);

    const forkSync = program.commands.find((c) => c.name() === "fork-sync");
    expect(forkSync).toBeDefined();
    // Commander stores the action — it will not be null
    expect(forkSync!._actionHandler).not.toBeNull();
  });
});

describe("registerKitForkSubcommands — kit fork sub-tree", () => {
  it("adds fork subcommand with all expected sub-subcommands under a kit Command", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = kitCmd.commands.find((c) => c.name() === "fork");
    expect(forkCmd).toBeDefined();

    const subNames = forkCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("register");
    expect(subNames).toContain("list");
    expect(subNames).toContain("status");
    expect(subNames).toContain("heal");
    expect(subNames).toContain("jobs");
    expect(subNames).toContain("deregister");
  });
});

describe("registerKitCommands — wires fork subcommands into kit tree", () => {
  it("kit command has a fork subcommand after registerKitCommands", async () => {
    // Reset module cache for kit.ts since it imports from kit-fork.ts
    vi.resetModules();

    // Re-apply mocks after reset
    vi.mock("@clack/prompts", () => ({
      select: vi.fn(),
      confirm: vi.fn(),
      text: vi.fn(),
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      note: vi.fn(),
      spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
      log: { error: vi.fn(), info: vi.fn() },
      isCancel: () => false,
    }));
    vi.mock("../utils/banner.js", () => ({ printPaperclipCliBanner: vi.fn() }));
    vi.mock("../kits/service.js", () => ({
      listBundledKits: vi.fn(() => []),
      inspectBundledKit: vi.fn(),
      downloadBundledKit: vi.fn(),
      validateKitDirectory: vi.fn(),
      resolveKitPath: vi.fn(),
      fuzzyResolveKitId: vi.fn((id: string) => id),
    }));
    vi.mock("../kits/fork-registry.js", () => ({
      registerKitFork: vi.fn(),
      loadKitForkRegistration: vi.fn(() => null),
      listKitForkRegistrations: vi.fn(() => []),
      updateKitForkRegistration: vi.fn(),
      deregisterKitFork: vi.fn(() => true),
      resolveKitForksRoot: vi.fn(() => "/tmp/test-forks"),
    }));
    vi.mock("../kits/fork-sync.js", () => ({
      detectKitForkDrift: vi.fn(),
      buildKitForkHealPlan: vi.fn(),
      applyKitForkHealPlan: vi.fn(),
    }));
    vi.mock("../kits/fork-sync-agent.js", () => ({
      runKitForkSyncJob: vi.fn(),
      dispatchKitForkSyncJobBackground: vi.fn(() => "kfj-test-job-id"),
      getKitForkSyncJob: vi.fn(() => null),
      listKitForkSyncJobs: vi.fn(() => []),
      cancelKitForkSyncJob: vi.fn(() => false),
      pruneKitForkSyncJobs: vi.fn(() => 0),
    }));

    const { Command } = await import("commander");
    const { registerKitCommands } = await import("../commands/kit.js");

    const program = new Command();
    program.exitOverride();
    registerKitCommands(program);

    const kitCmd = program.commands.find((c) => c.name() === "kit");
    expect(kitCmd).toBeDefined();

    const forkCmd = kitCmd!.commands.find((c) => c.name() === "fork");
    expect(forkCmd).toBeDefined();
  });
});

describe("kit fork subcommand help text", () => {
  it("fork command description mentions Fork Sync Agent", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = kitCmd.commands.find((c) => c.name() === "fork");
    expect(forkCmd!.description()).toMatch(/fork sync agent/i);
  });
});
