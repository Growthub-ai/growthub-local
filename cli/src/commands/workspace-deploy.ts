/**
 * `growthub workspace deploy` — Full deployment status + readiness check.
 *
 * Composes existing primitives to show the full deployment state of a
 * governed workspace in one command:
 *
 *   growthub workspace deploy status [--json]       ← agent-friendly readiness report
 *   growthub workspace deploy checklist              ← human interactive step-by-step
 *
 * Does NOT execute deployment (Vercel deploy, npm run build, etc.) — those
 * are out-of-scope for the CLI. It reads, validates, and reports the state
 * of all deployment-relevant primitives:
 *
 *   - Growthub Bridge connection (auth/session-store)
 *   - GitHub connection (integrations/github-resolver)
 *   - Kit fork registration (.growthub-fork/fork.json)
 *   - GitHub remote binding (.growthub-fork/fork.json::remote)
 *   - Hosted agent bindings (.growthub-fork/agents/)
 *   - Kit health (runtime/kit-health)
 *   - Integration bridge status (integrations/bridge)
 *   - Self-improving capability proposals (runtime/self-improving/health)
 *
 * Execution stays hosted. This command inspects and reports only.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import { readGithubToken, isGithubTokenExpired, readGithubProfile } from "../github/token-store.js";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";
import { checkSelfImprovingHealth } from "../runtime/self-improving/health.js";
import { listKitForkRegistrations } from "../kits/fork-registry.js";

// ---------------------------------------------------------------------------
// Check primitives (all read-only, no side effects)
// ---------------------------------------------------------------------------

interface BridgeStatus {
  connected: boolean;
  login?: string;
  source: "session" | "none";
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
  forkPath?: string;
  hasRemote: boolean;
  remoteUrl?: string;
  remoteSyncMode?: string;
}

interface AgentBindingsStatus {
  count: number;
  agents: string[];
}

interface SelfImprovingStatus {
  detected: boolean;
  proposalCount: number;
  promotedCount: number;
}

export interface WorkspaceDeployStatus {
  forkPath: string;
  bridge: BridgeStatus;
  github: GithubStatus;
  fork: ForkStatus;
  agentBindings: AgentBindingsStatus;
  selfImproving: SelfImprovingStatus;
  ready: boolean;
  missingSteps: string[];
  nextCommand?: string;
}

function checkBridge(): BridgeStatus {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    return { connected: false, source: "none" };
  }
  return { connected: true, login: session.email, source: "session" };
}

function checkGithub(): GithubStatus {
  const token = readGithubToken();
  const profile = readGithubProfile();
  if (!token) return { connected: false, source: "none" };
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
  if (!fs.existsSync(forkJsonPath)) {
    return { registered: false, hasRemote: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(forkJsonPath, "utf8")) as {
      forkId?: string;
      kitId?: string;
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
    return {
      registered: true,
      forkId: parsed.forkId,
      kitId: parsed.kitId,
      forkPath,
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
      const parsed = JSON.parse(
        fs.readFileSync(path.resolve(agentsDir, f), "utf8"),
      ) as { agentSlug?: string };
      if (parsed.agentSlug) agents.push(parsed.agentSlug);
    } catch { /* ignore */ }
  }
  return { count: agents.length, agents };
}

export function computeDeployStatus(forkPath: string): WorkspaceDeployStatus {
  const bridge = checkBridge();
  const github = checkGithub();
  const fork = checkFork(forkPath);
  const agentBindings = checkAgentBindings(forkPath);
  const siHealth = checkSelfImprovingHealth(forkPath);

  const missingSteps: string[] = [];
  let nextCommand: string | undefined;

  if (!bridge.connected && !github.connected) {
    missingSteps.push("Connect Growthub Bridge OR GitHub: growthub auth login OR growthub github login");
    if (!nextCommand) nextCommand = "growthub auth login";
  }

  if (!fork.registered) {
    missingSteps.push("Register fork: growthub kit fork register .");
    if (!nextCommand) nextCommand = "growthub kit fork register .";
  }

  if (fork.registered && !fork.hasRemote && (bridge.connected || github.connected)) {
    missingSteps.push("Connect GitHub remote: growthub kit fork connect --fork-id <id> --remote <owner/repo>");
    if (!nextCommand) nextCommand = `growthub kit fork connect --fork-id ${fork.forkId ?? "<fork-id>"} --remote <owner/repo>`;
  }

  if (fork.registered && fork.remoteSyncMode === "off") {
    missingSteps.push("Set remote sync mode for deploy PRs: growthub kit fork policy <fork-id> --set remoteSyncMode=pr");
  }

  const ready = missingSteps.length === 0 && fork.registered;

  return {
    forkPath,
    bridge,
    github,
    fork,
    agentBindings,
    selfImproving: {
      detected: siHealth.detected,
      proposalCount: siHealth.proposalCount,
      promotedCount: siHealth.promotedCount,
    },
    ready,
    missingSteps,
    nextCommand,
  };
}

// ---------------------------------------------------------------------------
// status — machine-readable + human display
// ---------------------------------------------------------------------------

function runDeployStatus(opts: { fork?: string; json?: boolean }): void {
  const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
  const status = computeDeployStatus(forkPath);

  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const tick = (ok: boolean) => ok ? pc.green("✓") : pc.red("✗");
  const info = (ok: boolean | undefined) => ok ? pc.green("●") : pc.dim("○");

  console.log("");
  console.log(pc.bold("Workspace Deploy Status"));
  console.log(pc.dim("─".repeat(60)));
  console.log(`  ${tick(status.bridge.connected)}  Growthub Bridge  ${status.bridge.connected ? pc.green("connected") + pc.dim(" · " + (status.bridge.login ?? "")) : pc.dim("not connected")}`);
  console.log(`  ${tick(status.github.connected)}  GitHub           ${status.github.connected ? pc.green("connected") + pc.dim(" · " + (status.github.login ?? "")) + pc.dim(" (" + status.github.source + ")") : pc.dim("not connected — run: growthub github login")}`);
  console.log(`  ${tick(status.fork.registered)}  Fork registered  ${status.fork.registered ? pc.green("yes") + pc.dim(" · " + status.fork.forkId) : pc.dim("no — run: growthub kit fork register .")}`);
  console.log(`  ${info(status.fork.hasRemote)}  GitHub remote    ${status.fork.hasRemote ? pc.green("connected") + pc.dim(" · " + (status.fork.remoteUrl ?? "")) : pc.dim("none — run: growthub kit fork connect")}`);
  console.log(`  ${info(status.fork.remoteSyncMode === "pr")}  Remote sync mode ${status.fork.remoteSyncMode === "pr" ? pc.green("pr") : pc.dim(status.fork.remoteSyncMode ?? "off") + pc.dim(" — set to pr for deploy PRs")}`);
  console.log(`  ${info(status.agentBindings.count > 0)}  Agent bindings   ${status.agentBindings.count > 0 ? pc.green(String(status.agentBindings.count) + " bound") + pc.dim(" · " + status.agentBindings.agents.join(", ")) : pc.dim("none — growthub bridge agents bind <slug>")}`);
  console.log(`  ${info(status.selfImproving.detected)}  Self-improving   ${status.selfImproving.detected ? pc.cyan(status.selfImproving.proposalCount + " proposals · " + status.selfImproving.promotedCount + " promoted") : pc.dim("not active — run: growthub workspace improve propose --from-run demo")}`);

  console.log("");

  if (status.ready) {
    console.log(pc.green(pc.bold("  ✓ Workspace is deploy-ready.")));
    console.log("");
    console.log(pc.dim("  Vercel deploy (agency portal):"));
    console.log(pc.dim("    cd apps/agency-portal && vercel"));
    console.log(pc.dim("  Fork sync + PR:"));
    console.log(pc.dim(`    growthub kit fork heal ${status.fork.forkId ?? "<fork-id>"} --json`));
  } else {
    console.log(pc.yellow("  Missing steps:"));
    for (const step of status.missingSteps) {
      console.log(pc.dim(`    · ${step}`));
    }
    if (status.nextCommand) {
      console.log("");
      console.log(pc.dim(`  Next: ${pc.cyan(status.nextCommand)}`));
    }
  }

  console.log("");
  console.log(pc.dim("  Full reference: docs/WORKSPACE_DEPLOY_FLOW.md"));
  console.log(pc.dim("  Agent output:   growthub workspace deploy status --json"));
  console.log("");
}

// ---------------------------------------------------------------------------
// checklist — human interactive walk-through
// ---------------------------------------------------------------------------

async function runDeployChecklist(opts: { fork?: string }): Promise<void> {
  const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
  const status = computeDeployStatus(forkPath);

  p.intro(pc.bold("Workspace Deploy Checklist"));

  const steps = [
    {
      label: "Growthub Bridge connected",
      ok: status.bridge.connected,
      fix: "growthub auth login",
      detail: status.bridge.login,
    },
    {
      label: "GitHub connected",
      ok: status.github.connected,
      fix: "growthub github login",
      detail: status.github.login ? `@${status.github.login} (${status.github.source})` : undefined,
    },
    {
      label: "Fork registered",
      ok: status.fork.registered,
      fix: "growthub kit fork register .",
      detail: status.fork.forkId,
    },
    {
      label: "GitHub remote connected",
      ok: status.fork.hasRemote,
      fix: `growthub kit fork connect --fork-id ${status.fork.forkId ?? "<id>"} --remote <owner/repo>`,
      detail: status.fork.remoteUrl,
    },
    {
      label: "Remote sync mode = pr",
      ok: status.fork.remoteSyncMode === "pr",
      fix: `growthub kit fork policy ${status.fork.forkId ?? "<id>"} --set remoteSyncMode=pr`,
      detail: status.fork.remoteSyncMode,
    },
    {
      label: "Hosted agents bound",
      ok: status.agentBindings.count > 0,
      fix: "growthub bridge agents list → growthub bridge agents bind <slug>",
      detail: status.agentBindings.count > 0 ? status.agentBindings.agents.join(", ") : undefined,
    },
  ];

  for (const step of steps) {
    if (step.ok) {
      p.log.success(`${step.label}${step.detail ? pc.dim(" · " + step.detail) : ""}`);
    } else {
      p.log.warn(`${step.label} — ${pc.cyan(step.fix)}`);
    }
  }

  console.log("");

  if (status.ready) {
    p.outro(
      pc.green("Workspace is deploy-ready.") + "\n\n" +
      "  Final steps (outside CLI scope):\n" +
      `  ${pc.dim("1.")} ${pc.cyan("node setup/verify-env.mjs")}         — check env vars\n` +
      `  ${pc.dim("2.")} ${pc.cyan("cd apps/agency-portal && vercel")}    — deploy to Vercel\n` +
      `  ${pc.dim("3.")} ${pc.cyan("growthub integrations status --json")} — verify integrations are live\n\n` +
      `  ${pc.dim("Docs: docs/WORKSPACE_DEPLOY_FLOW.md")}`,
    );
  } else {
    p.outro(
      pc.yellow(`${status.missingSteps.length} step(s) remaining.`) +
      (status.nextCommand ? `\n\n  Next: ${pc.cyan(status.nextCommand)}` : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceDeployCommands(workspaceCommand: Command): void {
  const deploy = workspaceCommand
    .command("deploy")
    .description("Deployment status and readiness check for a governed workspace")
    .addHelpText("after", `
Examples:
  $ growthub workspace deploy status
  $ growthub workspace deploy status --json
  $ growthub workspace deploy checklist
  $ growthub workspace deploy status --fork ./my-workspace --json

Docs: docs/WORKSPACE_DEPLOY_FLOW.md
`);

  deploy
    .command("status")
    .description("Show deployment readiness status — Bridge, GitHub, fork, agents, integrations")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .action((opts: { fork?: string; json?: boolean }) => {
      runDeployStatus(opts);
    });

  deploy
    .command("checklist")
    .description("Interactive step-by-step deployment checklist for humans")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .action(async (opts: { fork?: string }) => {
      await runDeployChecklist(opts);
    });
}
