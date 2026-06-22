/**
 * `growthub workspace status` — Unified workspace health snapshot.
 *
 * The primary agent bootstrap command: combines all deployment-relevant
 * signals into a single machine-readable envelope.
 *
 *   growthub workspace status [--json]
 *   growthub workspace status --fork ./my-workspace [--json]
 *
 * Reads (no side effects):
 *   - CLI package version
 *   - growthub.config.json validity
 *   - Bridge / hosted session
 *   - GitHub token state
 *   - Fork registration + remote binding + sync policy
 *   - Agent bindings count
 *   - Integration count (from integrations status cache when available)
 *   - App paths detected under the fork root
 *   - Self-improving capability proposals summary
 *
 * JSON shape is stable and additive — safe to rely on in agent scripts.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import { readGithubToken, isGithubTokenExpired, readGithubProfile } from "../github/token-store.js";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";
import { checkSelfImprovingHealth } from "../runtime/self-improving/health.js";
import { listKitForkRegistrations } from "../kits/fork-registry.js";

// ---------------------------------------------------------------------------
// CLI version helper
// ---------------------------------------------------------------------------

function resolveCliVersion(): string {
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(moduleDir, "../package.json"),
      path.resolve(moduleDir, "../../package.json"),
      path.resolve(moduleDir, "../../../package.json"),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as { name?: string; version?: string };
      if (parsed?.name === "@growthub/cli" && typeof parsed.version === "string") return parsed.version;
    }
  } catch { /* ignore */ }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Sub-check helpers
// ---------------------------------------------------------------------------

interface BridgeStatus {
  connected: boolean;
  email?: string;
  expired?: boolean;
}

interface GithubStatus {
  connected: boolean;
  login?: string;
  source: "direct" | "none";
  expired?: boolean;
}

interface ForkStatus {
  registered: boolean;
  forkId?: string;
  kitId?: string;
  label?: string;
  hasRemote: boolean;
  remoteUrl?: string;
  remoteSyncMode?: string;
}

interface AgentBindingsStatus {
  count: number;
  agents: string[];
}

interface ConfigStatus {
  found: boolean;
  configPath?: string;
  workspaceId?: string;
  persistenceMode?: string;
  valid: boolean;
  error?: string;
}

interface AppPathsStatus {
  detected: string[];
}

interface SelfImprovingStatus {
  detected: boolean;
  proposalCount: number;
  promotedCount: number;
}

export interface WorkspaceStatusResult {
  cliVersion: string;
  forkPath: string;
  config: ConfigStatus;
  bridge: BridgeStatus;
  github: GithubStatus;
  fork: ForkStatus;
  agentBindings: AgentBindingsStatus;
  apps: AppPathsStatus;
  selfImproving: SelfImprovingStatus;
  overall: "healthy" | "needs_action" | "degraded";
  issues: string[];
  recommendedCommands: string[];
}

function checkBridge(): BridgeStatus {
  const session = readSession();
  if (!session) return { connected: false };
  const expired = isSessionExpired(session);
  return { connected: !expired, email: session.email, expired };
}

function checkGithub(): GithubStatus {
  const token = readGithubToken();
  if (!token) return { connected: false, source: "none" };
  const profile = readGithubProfile();
  const expired = isGithubTokenExpired(token);
  return {
    connected: !expired,
    login: profile?.login ?? token.login,
    source: "direct",
    expired,
  };
}

function checkFork(forkPath: string): ForkStatus {
  const stateDir = resolveInForkStateDir(forkPath);
  const forkJsonPath = path.resolve(stateDir, "fork.json");
  if (!fs.existsSync(forkJsonPath)) return { registered: false, hasRemote: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(forkJsonPath, "utf8")) as {
      forkId?: string;
      kitId?: string;
      label?: string;
      remote?: { htmlUrl?: string; cloneUrl?: string };
    };
    const policyPath = path.resolve(stateDir, "policy.json");
    let remoteSyncMode = "off";
    if (fs.existsSync(policyPath)) {
      try {
        const policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as { remoteSyncMode?: string };
        remoteSyncMode = policy.remoteSyncMode ?? "off";
      } catch { /* ignore */ }
    }
    const forks = listKitForkRegistrations();
    const reg = forks.find((f) => f.forkId === parsed.forkId);
    return {
      registered: true,
      forkId: parsed.forkId,
      kitId: parsed.kitId,
      label: reg?.label ?? parsed.label,
      hasRemote: Boolean(parsed.remote),
      remoteUrl: parsed.remote?.htmlUrl ?? parsed.remote?.cloneUrl,
      remoteSyncMode,
    };
  } catch {
    return { registered: false, hasRemote: false };
  }
}

function checkAgentBindings(forkPath: string): AgentBindingsStatus {
  const agentsDir = path.resolve(resolveInForkStateDir(forkPath), "agents");
  if (!fs.existsSync(agentsDir)) return { count: 0, agents: [] };
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".json"));
  const agents: string[] = [];
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(agentsDir, f), "utf8")) as { agentSlug?: string };
      if (parsed.agentSlug) agents.push(parsed.agentSlug);
    } catch { /* ignore */ }
  }
  return { count: agents.length, agents };
}

function checkConfig(forkPath: string): ConfigStatus {
  const candidates = [
    path.resolve(forkPath, "growthub.config.json"),
    path.resolve(forkPath, "apps/workspace/growthub.config.json"),
  ];
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        workspaceId?: string;
        persistence?: { mode?: string };
      };
      return {
        found: true,
        configPath,
        workspaceId: parsed.workspaceId,
        persistenceMode: parsed.persistence?.mode ?? "unknown",
        valid: true,
      };
    } catch (err) {
      return {
        found: true,
        configPath,
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { found: false, valid: false };
}

function detectAppPaths(forkPath: string): AppPathsStatus {
  const candidates = ["apps/workspace"];
  const detected = candidates.filter((rel) => fs.existsSync(path.resolve(forkPath, rel)));
  return { detected };
}

export function computeWorkspaceStatus(forkPath: string): WorkspaceStatusResult {
  const cliVersion = resolveCliVersion();
  const config = checkConfig(forkPath);
  const bridge = checkBridge();
  const github = checkGithub();
  const fork = checkFork(forkPath);
  const agentBindings = checkAgentBindings(forkPath);
  const apps = detectAppPaths(forkPath);
  const siHealth = checkSelfImprovingHealth(forkPath);

  const issues: string[] = [];
  const recommendedCommands: string[] = [];

  if (!bridge.connected && !github.connected) {
    issues.push("No auth: Growthub Bridge and GitHub are both disconnected");
    recommendedCommands.push("growthub auth login");
  }

  if (!config.found) {
    issues.push("No growthub.config.json found — run workspace init or starter init");
    recommendedCommands.push("growthub workspace init");
  } else if (!config.valid) {
    issues.push(`growthub.config.json parse error: ${config.error}`);
  }

  if (!fork.registered) {
    issues.push("Fork not registered — run: growthub kit fork register .");
    recommendedCommands.push("growthub kit fork register .");
  }

  const overall: WorkspaceStatusResult["overall"] =
    issues.length === 0
      ? "healthy"
      : (bridge.connected || github.connected) && fork.registered
        ? "needs_action"
        : "degraded";

  return {
    cliVersion,
    forkPath,
    config,
    bridge,
    github,
    fork,
    agentBindings,
    apps,
    selfImproving: {
      detected: siHealth.detected,
      proposalCount: siHealth.proposalCount,
      promotedCount: siHealth.promotedCount,
    },
    overall,
    issues,
    recommendedCommands,
  };
}

// ---------------------------------------------------------------------------
// Human-readable display
// ---------------------------------------------------------------------------

function printWorkspaceStatus(status: WorkspaceStatusResult): void {
  const tick = (ok: boolean) => (ok ? pc.green("✓") : pc.red("✗"));
  const info = (ok: boolean | undefined) => (ok ? pc.green("●") : pc.dim("○"));

  console.log("");
  console.log(pc.bold("Workspace Status"));
  console.log(pc.dim("─".repeat(60)));
  console.log(`  CLI version         ${pc.cyan(status.cliVersion)}`);
  console.log(`  Workspace path      ${pc.dim(status.forkPath)}`);
  console.log("");

  // Config
  const cfgLabel = status.config.found
    ? (status.config.valid
      ? pc.green("valid") + pc.dim(` · ${status.config.configPath?.replace(status.forkPath, ".")}`)
      : pc.red("invalid") + pc.dim(` · ${status.config.error}`))
    : pc.dim("not found");
  console.log(`  ${tick(status.config.found && status.config.valid)}  Config              ${cfgLabel}`);
  if (status.config.workspaceId) {
    console.log(`     ${pc.dim("workspace_id:")} ${pc.dim(status.config.workspaceId)}`);
  }
  if (status.config.persistenceMode) {
    console.log(`     ${pc.dim("persistence:")} ${pc.dim(status.config.persistenceMode)}`);
  }

  // Auth
  console.log(`  ${tick(status.bridge.connected)}  Growthub Bridge     ${status.bridge.connected ? pc.green("connected") + pc.dim(` · ${status.bridge.email ?? ""}`) : pc.dim("not connected — run: growthub auth login")}`);
  console.log(`  ${tick(status.github.connected)}  GitHub              ${status.github.connected ? pc.green("connected") + pc.dim(` · ${status.github.login ?? ""}`) : pc.dim("not connected — run: growthub github login")}`);

  // Fork
  console.log(`  ${tick(status.fork.registered)}  Fork registered     ${status.fork.registered ? pc.green("yes") + pc.dim(` · ${status.fork.forkId ?? ""}`) : pc.dim("no — run: growthub kit fork register .")}`);
  console.log(`  ${info(status.fork.hasRemote)}  GitHub remote       ${status.fork.hasRemote ? pc.green("connected") + pc.dim(` · ${status.fork.remoteUrl ?? ""}`) : pc.dim("none")}`);
  console.log(`  ${info(status.agentBindings.count > 0)}  Agent bindings      ${status.agentBindings.count > 0 ? pc.green(`${status.agentBindings.count} bound`) + pc.dim(` · ${status.agentBindings.agents.join(", ")}`) : pc.dim("none")}`);

  // Apps
  if (status.apps.detected.length > 0) {
    console.log(`  ${info(true)}  Apps detected       ${pc.dim(status.apps.detected.join(", "))}`);
  }

  // Self-improving
  console.log(`  ${info(status.selfImproving.detected)}  Self-improving      ${status.selfImproving.detected ? pc.cyan(`${status.selfImproving.proposalCount} proposals · ${status.selfImproving.promotedCount} promoted`) : pc.dim("not active")}`);

  console.log("");

  const overallColor: Record<WorkspaceStatusResult["overall"], (s: string) => string> = {
    healthy: pc.green,
    needs_action: pc.yellow,
    degraded: pc.red,
  };
  console.log(`  Overall: ${overallColor[status.overall](status.overall.replace("_", " "))}`);

  if (status.issues.length > 0) {
    console.log("");
    console.log(pc.yellow("  Issues:"));
    for (const issue of status.issues) {
      console.log(pc.dim(`    · ${issue}`));
    }
  }

  if (status.recommendedCommands.length > 0) {
    console.log("");
    console.log(pc.dim("  Recommended next:"));
    for (const cmd of status.recommendedCommands) {
      console.log(pc.dim(`    ${pc.cyan(cmd)}`));
    }
  }

  console.log("");
  console.log(pc.dim("  Agent output: growthub workspace status --json"));
  console.log(pc.dim("  Deploy check: growthub workspace deploy check --json"));
  console.log(pc.dim("  Full QA:      growthub workspace qa --json"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceStatusCommands(workspaceCmd: Command): void {
  workspaceCmd
    .command("status")
    .description("Unified workspace health snapshot — bridge, GitHub, fork, agents, config, apps")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .addHelpText("after", `
Examples:
  $ growthub workspace status
  $ growthub workspace status --json
  $ growthub workspace status --fork ./my-workspace --json

JSON shape:
  { cliVersion, forkPath, config, bridge, github, fork, agentBindings, apps, selfImproving, overall, issues, recommendedCommands }

Docs: docs/WORKSPACE_DEPLOY_FLOW.md
`)
    .action((opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      const status = computeWorkspaceStatus(forkPath);
      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      printWorkspaceStatus(status);
    });
}
