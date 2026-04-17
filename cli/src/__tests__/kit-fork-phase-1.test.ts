/**
 * Kit Fork Phase 1 — UX Consolidation Tests
 *
 * Covers the new Phase 1 command surface:
 *   - `kit fork list` with --filter / --sort-by / --no-upstream-check / --json
 *   - `kit fork status` with --policy-only / --no-upstream-check
 *   - `kit fork heal` with --preview flag
 *   - `kit fork jobs` with --watch / --tail / --filter
 *   - `kit fork history` (new, audit timeline)
 *   - `kit fork policy` positional arg + --edit support in kit-fork-remote
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocks — declared at top so the Commander modules see them.
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
  log: { error: vi.fn(), info: vi.fn(), success: vi.fn(), message: vi.fn() },
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
  getBundledKitSourceInfo: vi.fn(),
  copyBundledKitSource: vi.fn(),
}));
vi.mock("../kits/fork-registry.js", () => ({
  registerKitFork: vi.fn(),
  loadKitForkRegistration: vi.fn(() => null),
  listKitForkRegistrations: vi.fn(() => []),
  updateKitForkRegistration: vi.fn(),
  deregisterKitFork: vi.fn(() => true),
  lookupKitForkPath: vi.fn(() => null),
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
  confirmAndResumeJob: vi.fn(),
}));
vi.mock("../kits/fork-policy.js", () => ({
  readKitForkPolicy: vi.fn(() => ({
    version: 1,
    untouchablePaths: [],
    confirmBeforeChange: [],
    autoApprove: "additive",
    autoApproveDepUpdates: "additive",
    remoteSyncMode: "off",
    interactiveConflicts: true,
    allowedScripts: [],
    updatedAt: new Date().toISOString(),
  })),
  writeKitForkPolicy: vi.fn(),
  updateKitForkPolicy: vi.fn(),
  makeDefaultKitForkPolicy: vi.fn(),
  isUntouchable: vi.fn(() => false),
  requiresConfirmation: vi.fn(() => false),
  canAutoApplyAddition: vi.fn(() => true),
  canAutoApplyModification: vi.fn(() => false),
  canAutoApplyDepAddition: vi.fn(() => true),
  canAutoApplyDepUpgrade: vi.fn(() => false),
}));
vi.mock("../kits/fork-trace.js", () => ({
  appendKitForkTraceEvent: vi.fn(),
  readKitForkTrace: vi.fn(() => []),
  tailKitForkTrace: vi.fn(() => []),
}));
vi.mock("../kits/fork-remote.js", () => ({
  gitAvailable: vi.fn(() => false),
  isGitRepo: vi.fn(() => false),
  initGitRepo: vi.fn(),
  setOrigin: vi.fn(),
  buildTokenCloneUrl: vi.fn(),
}));
vi.mock("../integrations/github-resolver.js", () => ({
  resolveGithubAccessToken: vi.fn(() => null),
}));
vi.mock("../github/client.js", () => ({
  createFork: vi.fn(),
  parseRepoRef: vi.fn(),
  openPullRequest: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSub(cmd: unknown, name: string) {
  return (cmd as { commands: Array<{ name(): string }> }).commands.find(
    (c) => c.name() === name,
  );
}

function findOption(cmd: unknown, long: string) {
  return (cmd as { options: Array<{ long?: string | null }> }).options.find(
    (o) => o.long === long,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("kit fork list (Phase 1)", () => {
  it("exposes --filter, --sort-by, --no-upstream-check, and --json flags", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const listCmd = findSub(forkCmd as never, "list")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listOptions = (listCmd as any).options;

    expect(findOption({ options: listOptions }, "--filter")).toBeDefined();
    expect(findOption({ options: listOptions }, "--sort-by")).toBeDefined();
    expect(findOption({ options: listOptions }, "--no-upstream-check")).toBeDefined();
    expect(findOption({ options: listOptions }, "--json")).toBeDefined();
  });
});

describe("kit fork status (Phase 1)", () => {
  it("exposes --policy-only and --no-upstream-check flags", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const statusCmd = findSub(forkCmd as never, "status")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusOptions = (statusCmd as any).options;

    expect(findOption({ options: statusOptions }, "--policy-only")).toBeDefined();
    expect(findOption({ options: statusOptions }, "--no-upstream-check")).toBeDefined();
  });
});

describe("kit fork heal (Phase 1)", () => {
  it("exposes a --preview flag in addition to --dry-run and --background", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const healCmd = findSub(forkCmd as never, "heal")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const healOptions = (healCmd as any).options;

    expect(findOption({ options: healOptions }, "--preview")).toBeDefined();
    expect(findOption({ options: healOptions }, "--dry-run")).toBeDefined();
    expect(findOption({ options: healOptions }, "--background")).toBeDefined();
  });
});

describe("kit fork jobs (Phase 1)", () => {
  it("exposes --watch, --tail, --filter, and --limit flags", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const jobsCmd = findSub(forkCmd as never, "jobs")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobsOptions = (jobsCmd as any).options;

    expect(findOption({ options: jobsOptions }, "--watch")).toBeDefined();
    expect(findOption({ options: jobsOptions }, "--tail")).toBeDefined();
    expect(findOption({ options: jobsOptions }, "--filter")).toBeDefined();
    expect(findOption({ options: jobsOptions }, "--limit")).toBeDefined();
  });
});

describe("kit fork history (Phase 1 — new)", () => {
  it("registers `history` with --since / --until / --event-type / --csv / --json flags", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const historyCmd = findSub(forkCmd as never, "history");
    expect(historyCmd).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const histOptions = (historyCmd as any).options;
    expect(findOption({ options: histOptions }, "--since")).toBeDefined();
    expect(findOption({ options: histOptions }, "--until")).toBeDefined();
    expect(findOption({ options: histOptions }, "--event-type")).toBeDefined();
    expect(findOption({ options: histOptions }, "--csv")).toBeDefined();
    expect(findOption({ options: histOptions }, "--json")).toBeDefined();
  });
});

describe("kit fork policy (Phase 1 enhancements)", () => {
  it("accepts a positional fork-id and exposes --edit / --dry-run flags", async () => {
    const { Command } = await import("commander");
    const { registerKitForkSubcommands } = await import("../commands/kit-fork.js");

    const kitCmd = new Command("kit");
    kitCmd.exitOverride();
    registerKitForkSubcommands(kitCmd);

    const forkCmd = findSub(kitCmd, "fork")!;
    const policyCmd = findSub(forkCmd as never, "policy")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyOptions = (policyCmd as any).options;

    expect(findOption({ options: policyOptions }, "--edit")).toBeDefined();
    expect(findOption({ options: policyOptions }, "--dry-run")).toBeDefined();
    // positional argument is registered
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (policyCmd as any).registeredArguments ?? (policyCmd as any)._args;
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBeGreaterThan(0);
  });
});
