/**
 * `growthub github` — first-party native GitHub integration.
 *
 * Mirrors the existing Growthub hosted auth primitive (session-store, overlay,
 * interactive login) but for GitHub. Used by the Fork Sync Agent for one-click
 * fork creation, remote branch push, and PR-based heal publication.
 *
 * Verbs:
 *   growthub github login             device-flow OAuth (browser-less fallback: --token <pat>)
 *   growthub github whoami            show authenticated identity
 *   growthub github logout            clear local credentials
 *   growthub github status            summary for Discovery Hub surfacing
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import open from "open";
import {
  readGithubToken,
  writeGithubToken,
  clearGithubToken,
  readGithubProfile,
  writeGithubProfile,
  clearGithubProfile,
  isGithubTokenExpired,
  describeGithubTokenPath,
} from "../github/token-store.js";
import {
  startDeviceFlow,
  pollDeviceFlow,
  fetchAuthenticatedUser,
  resolveGithubClientId,
} from "../github/client.js";
import { describeIntegrationBridge } from "../integrations/bridge.js";
import type { CliGithubToken } from "../github/types.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface GithubLoginOptions {
  token?: string;
  noBrowser?: boolean;
  json?: boolean;
  timeoutMs?: number;
}

export async function githubLogin(opts: GithubLoginOptions): Promise<void> {
  if (opts.token?.trim()) {
    const accessToken = opts.token.trim();
    const profile = await fetchAuthenticatedUser(accessToken);
    const token: CliGithubToken = {
      version: 1,
      accessToken,
      authMode: "pat",
      scopes: [],
      login: profile.login,
      userId: profile.userId,
      issuedAt: new Date().toISOString(),
    };
    writeGithubToken(token);
    writeGithubProfile(profile);
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", mode: "pat", login: profile.login }, null, 2));
    } else {
      p.log.success(`Connected to GitHub as ${pc.cyan(profile.login)} (PAT).`);
    }
    return;
  }

  p.intro(pc.cyan("GitHub device flow login"));
  const start = await startDeviceFlow();
  p.log.step(
    `Open ${pc.cyan(start.verificationUri)} and enter code ${pc.yellow(start.userCode)}`,
  );

  if (!opts.noBrowser) {
    try {
      await open(start.verificationUri);
    } catch {
      /* best-effort; user can open manually */
    }
  }

  const startedAt = Date.now();
  const maxMs = opts.timeoutMs ?? start.expiresInSec * 1000;
  let interval = start.pollIntervalSec;
  const spinner = p.spinner();
  spinner.start("Waiting for GitHub authorization...");

  while (Date.now() - startedAt < maxMs) {
    await sleep(interval * 1000);
    const poll = await pollDeviceFlow(start.deviceCode);
    if (poll.status === "authorized" && poll.token) {
      spinner.stop("Authorization received.");
      const profile = await fetchAuthenticatedUser(poll.token.accessToken);
      const token: CliGithubToken = {
        ...poll.token,
        login: profile.login,
        userId: profile.userId,
      };
      writeGithubToken(token);
      writeGithubProfile(profile);
      if (opts.json) {
        console.log(JSON.stringify({ status: "ok", mode: "device-flow", login: profile.login }));
      } else {
        p.outro(`Connected to GitHub as ${pc.cyan(profile.login)}.`);
      }
      return;
    }
    if (poll.status === "slow_down" && poll.nextPollIntervalSec) {
      interval = poll.nextPollIntervalSec;
      continue;
    }
    if (poll.status === "expired") {
      spinner.stop("Device code expired.");
      throw new Error("GitHub device code expired — run `growthub github login` again.");
    }
    if (poll.status === "denied") {
      spinner.stop("Authorization denied.");
      throw new Error("GitHub authorization was denied.");
    }
  }
  spinner.stop("Timed out.");
  throw new Error("GitHub login timed out. Re-run `growthub github login` to retry.");
}

export async function githubWhoami(opts: { json?: boolean } = {}): Promise<void> {
  const token = readGithubToken();
  const profile = readGithubProfile();
  const bridge = await describeIntegrationBridge();
  const bridgeGithub = bridge.integrations.find((i) => i.provider === "github");

  // No direct token + no bridge GitHub integration → fully unconnected.
  if (!token && !bridgeGithub) {
    if (opts.json) {
      console.log(JSON.stringify({
        connected: false,
        bridge: { growthubConnected: bridge.growthubConnected, bridgeAvailable: bridge.bridgeAvailable },
      }, null, 2));
    } else {
      p.log.warn(
        "Not connected to GitHub. Either run `growthub github login` or connect GitHub inside your Growthub account.",
      );
      if (bridge.notice) p.log.info(bridge.notice);
    }
    return;
  }

  const directExpired = token ? isGithubTokenExpired(token) : true;
  const effectiveSource: "direct" | "growthub-bridge" | "none" =
    token && !directExpired ? "direct" : bridgeGithub ? "growthub-bridge" : "none";

  if (opts.json) {
    console.log(JSON.stringify({
      connected: effectiveSource !== "none",
      effectiveSource,
      direct: token
        ? {
            expired: directExpired,
            authMode: token.authMode,
            login: profile?.login ?? token.login ?? null,
            userId: profile?.userId ?? token.userId ?? null,
            scopes: token.scopes,
            tokenPath: describeGithubTokenPath(),
            clientId: resolveGithubClientId(),
          }
        : null,
      bridge: {
        growthubConnected: bridge.growthubConnected,
        growthubLogin: bridge.growthubLogin ?? null,
        bridgeAvailable: bridge.bridgeAvailable,
        github: bridgeGithub ?? null,
      },
    }, null, 2));
    return;
  }

  if (token) {
    const status = directExpired ? pc.red("expired") : pc.green("active");
    p.log.message(
      `GitHub (direct): ${status}  login=${profile?.login ?? token.login ?? "?"}  ` +
      `mode=${token.authMode}  scopes=[${token.scopes.join(", ")}]`,
    );
  }
  if (bridge.growthubConnected) {
    if (bridgeGithub) {
      p.log.message(
        `GitHub (via Growthub bridge): ${pc.green("connected")}  ` +
        `handle=${bridgeGithub.handle ?? "?"}  growthub=${bridge.growthubLogin ?? "?"}  ` +
        `scopes=[${(bridgeGithub.scopes ?? []).join(", ")}]`,
      );
    } else if (bridge.bridgeAvailable) {
      p.log.info(
        `Growthub account connected (${bridge.growthubLogin ?? "?"}) but no GitHub integration attached in gh-app.`,
      );
    }
  }
  p.log.message(`Effective auth source: ${pc.cyan(effectiveSource)}`);
}

export function githubLogout(opts: { json?: boolean } = {}): void {
  clearGithubToken();
  clearGithubProfile();
  if (opts.json) console.log(JSON.stringify({ status: "ok" }));
  else p.log.success("Disconnected from GitHub.");
}

export function registerGithubCommands(program: Command): void {
  const github = program
    .command("github")
    .description("Manage first-party native GitHub authentication + fork operations.");

  github
    .command("login")
    .description("Authenticate with GitHub via OAuth device flow (or --token <pat>).")
    .option("--token <pat>", "Use a GitHub personal access token instead of device flow")
    .option("--no-browser", "Do not open the verification URL automatically")
    .option("--json", "Emit machine-readable output")
    .option("--timeout-ms <n>", "Override device-flow poll timeout", (v) => Number(v))
    .action(async (opts) => {
      await githubLogin(opts);
    });

  github
    .command("whoami")
    .description("Show the authenticated GitHub identity.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await githubWhoami(opts);
    });

  github
    .command("logout")
    .description("Remove local GitHub credentials.")
    .option("--json", "Emit machine-readable output")
    .action((opts) => {
      githubLogout(opts);
    });

  github
    .command("status")
    .description("Quick status for the Discovery Hub surface.")
    .action(async () => {
      await githubWhoami({});
    });
}
