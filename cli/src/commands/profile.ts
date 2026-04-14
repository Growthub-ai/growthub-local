import type { Command } from "commander";
import pc from "picocolors";
import { resolveConfigPath } from "../config/store.js";
import { loadPaperclipEnvFile } from "../config/env.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import {
  readHostedOverlay,
  writeHostedOverlay,
  seedHostedOverlayFromSession,
  type ExecutionPreferences,
} from "../auth/overlay-store.js";
import {
  computeEffectiveProfile,
  writeEffectiveProfileSnapshot,
  type EffectiveProfile,
} from "../auth/effective-profile.js";
import {
  fetchHostedProfile,
  fetchHostedCredits,
  pushHostedProfile,
  HostedEndpointUnavailableError,
  type PullProfileResponse,
} from "../auth/hosted-client.js";
import { resolvePaperclipInstanceId } from "../config/home.js";

interface BaseProfileOptions {
  config?: string;
  dataDir?: string;
  json?: boolean;
}

function printEffectiveProfileHuman(effective: EffectiveProfile): void {
  console.log(pc.bold("Effective profile"));
  console.log(
    `  Authenticated: ${effective.authenticated ? pc.green("yes") : pc.yellow("no")}${
      effective.session.expired ? pc.yellow(" (session expired)") : ""
    }`,
  );

  console.log(pc.bold("Local workspace (base layer)"));
  console.log(`  Instance: ${effective.local.instanceId}`);
  console.log(`  Config: ${pc.dim(effective.local.configPath)}`);
  console.log(
    `  Surface: ${effective.local.surfaceProfile ?? pc.dim("(unset)")}  Host: ${effective.local.serverHost ?? pc.dim("(unset)")}  Port: ${
      effective.local.serverPort ?? pc.dim("(unset)")
    }`,
  );
  console.log(
    `  Local-linked hosted token: ${effective.local.hasConfiguredToken ? pc.green("set") : pc.dim("none")}`,
  );
  if (effective.local.growthubBaseUrl) {
    console.log(`  Growthub base: ${effective.local.growthubBaseUrl}`);
  }

  console.log(pc.bold("Hosted overlay"));
  if (!effective.hosted.present) {
    console.log(pc.dim("  No hosted overlay present. Run `growthub auth login` to attach one."));
  } else {
    if (effective.hosted.email || effective.hosted.userId) {
      console.log(`  User: ${effective.hosted.email ?? effective.hosted.userId}`);
    }
    if (effective.hosted.orgName || effective.hosted.orgId) {
      console.log(`  Org: ${effective.hosted.orgName ?? effective.hosted.orgId}`);
    }
    if (effective.hosted.hostedBaseUrl) console.log(`  Hosted: ${effective.hosted.hostedBaseUrl}`);
    if (effective.hosted.linkedInstanceId) {
      console.log(`  Linked instance: ${effective.hosted.linkedInstanceId}`);
    }
    if (effective.hosted.entitlements.length > 0) {
      console.log(`  Entitlements: ${effective.hosted.entitlements.join(", ")}`);
    }
    if (effective.hosted.gatedKitSlugs.length > 0) {
      console.log(`  Gated kits: ${effective.hosted.gatedKitSlugs.join(", ")}`);
    }
    if (effective.hosted.lastPulledAt) console.log(pc.dim(`  Last pulled: ${effective.hosted.lastPulledAt}`));
    if (effective.hosted.lastPushedAt) console.log(pc.dim(`  Last pushed: ${effective.hosted.lastPushedAt}`));
  }

  console.log(pc.bold("Execution defaults"));
  console.log(
    `  preferredMode=${effective.executionDefaults.preferredMode}  serverlessFallback=${effective.executionDefaults.allowServerlessFallback}  browserBridge=${effective.executionDefaults.allowBrowserBridge}`,
  );
}

async function runProfileStatus(opts: BaseProfileOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const effective = computeEffectiveProfile({ configPath });
  writeEffectiveProfileSnapshot(effective);

  if (opts.json) {
    console.log(JSON.stringify(effective, null, 2));
    return;
  }

  printEffectiveProfileHuman(effective);
}

function normalizeExecutionPrefs(value: Partial<ExecutionPreferences> | undefined, fallback: ExecutionPreferences): ExecutionPreferences {
  if (!value) return fallback;
  const preferredMode: ExecutionPreferences["preferredMode"] =
    value.preferredMode === "local" ||
    value.preferredMode === "serverless" ||
    value.preferredMode === "browser" ||
    value.preferredMode === "auto"
      ? value.preferredMode
      : fallback.preferredMode;

  return {
    preferredMode,
    allowServerlessFallback:
      typeof value.allowServerlessFallback === "boolean"
        ? value.allowServerlessFallback
        : fallback.allowServerlessFallback,
    allowBrowserBridge:
      typeof value.allowBrowserBridge === "boolean"
        ? value.allowBrowserBridge
        : fallback.allowBrowserBridge,
  };
}

async function runProfilePull(opts: BaseProfileOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const session = readSession();
  if (!session) {
    console.error(pc.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }

  const existingOverlay =
    readHostedOverlay() ??
    seedHostedOverlayFromSession({
      hostedBaseUrl: session.hostedBaseUrl,
      userId: session.userId,
      email: session.email,
      orgId: session.orgId,
      orgName: session.orgName,
      machineLabel: session.machineLabel,
      linkedInstanceId: resolvePaperclipInstanceId(),
    });

  let remote: PullProfileResponse | null = null;
  let usedFallback = false;

  try {
    remote = await fetchHostedProfile(session);
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      usedFallback = true;
      if (!opts.json) {
        console.log(
          pc.yellow(
            "Hosted profile endpoint not yet available — keeping current overlay. (This is expected while gh-app is still shipping its CLI API.)",
          ),
        );
      }
    } else {
      throw err;
    }
  }

  const merged = {
    ...existingOverlay,
    hostedBaseUrl: session.hostedBaseUrl,
    userId: remote?.userId ?? existingOverlay.userId,
    email: remote?.email ?? existingOverlay.email,
    displayName: remote?.displayName ?? existingOverlay.displayName ?? existingOverlay.email,
    orgId: remote?.orgId ?? existingOverlay.orgId,
    orgName: remote?.orgName ?? existingOverlay.orgName,
    entitlements: remote?.entitlements ?? existingOverlay.entitlements,
    gatedKitSlugs: remote?.gatedKitSlugs ?? existingOverlay.gatedKitSlugs,
    executionDefaults: normalizeExecutionPrefs(remote?.executionDefaults, existingOverlay.executionDefaults),
    lastPulledAt: remote ? new Date().toISOString() : existingOverlay.lastPulledAt,
    extra: remote?.extra ?? existingOverlay.extra,
  };

  writeHostedOverlay(merged);
  const effective = computeEffectiveProfile({ configPath });
  writeEffectiveProfileSnapshot(effective);

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", usedFallback, overlay: merged }, null, 2));
    return;
  }

  if (!usedFallback) {
    console.log(pc.green("Hosted profile pulled and overlay updated."));
  }
  console.log(pc.dim(`Entitlements: ${merged.entitlements.length === 0 ? "(none)" : merged.entitlements.join(", ")}`));
  console.log(pc.dim(`Gated kits: ${merged.gatedKitSlugs.length === 0 ? "(none)" : merged.gatedKitSlugs.join(", ")}`));
}

async function runProfilePush(opts: BaseProfileOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const session = readSession();
  if (!session) {
    console.error(pc.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }

  const effective = computeEffectiveProfile({ configPath });

  let acknowledged = false;
  let usedFallback = false;

  try {
    await pushHostedProfile(session, {
      linkedInstanceId: effective.local.instanceId,
      surfaceProfile: effective.local.surfaceProfile,
      machineLabel: effective.local.machineLabel,
      workspaceLabel: effective.local.workspaceLabel,
    });
    acknowledged = true;
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      usedFallback = true;
    } else {
      throw err;
    }
  }

  const existingOverlay =
    readHostedOverlay() ??
    seedHostedOverlayFromSession({
      hostedBaseUrl: session.hostedBaseUrl,
      userId: session.userId,
      email: session.email,
      orgId: session.orgId,
      orgName: session.orgName,
      machineLabel: session.machineLabel,
      linkedInstanceId: effective.local.instanceId,
    });

  const updatedOverlay = {
    ...existingOverlay,
    linkedInstanceId: existingOverlay.linkedInstanceId ?? effective.local.instanceId,
    lastPushedAt: acknowledged ? new Date().toISOString() : existingOverlay.lastPushedAt,
  };
  writeHostedOverlay(updatedOverlay);
  writeEffectiveProfileSnapshot(computeEffectiveProfile({ configPath }));

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", acknowledged, usedFallback, overlay: updatedOverlay }, null, 2));
    return;
  }

  if (usedFallback) {
    console.log(
      pc.yellow(
        "Hosted push endpoint not yet available — linkage recorded locally only. (This is expected while gh-app is still shipping its CLI API.)",
      ),
    );
    return;
  }

  console.log(pc.green("Hosted profile push acknowledged."));
  console.log(pc.dim(`Linked instance: ${effective.local.instanceId}`));
}

async function runProfileCredits(opts: BaseProfileOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const session = readSession();
  if (!session) {
    console.error(pc.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }

  try {
    const credits = await fetchHostedCredits(session);
    if (!credits || typeof credits.totalAvailable !== "number") {
      console.error(pc.red("Hosted credits endpoint returned no data."));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(credits, null, 2));
      return;
    }

    console.log(pc.bold("Hosted credits"));
    console.log(`  Available: $${credits.totalAvailable.toFixed(2)}`);
    console.log(`  Used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
    console.log(`  Plan: ${credits.planTier}`);
    console.log(`  Period: ${credits.currentPeriodStart} → ${credits.currentPeriodEnd}`);
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      console.error(pc.red("Hosted credits endpoint is not available on this app version."));
      process.exit(1);
    }
    throw err;
  }
}

export function registerProfileCommands(program: Command): void {
  const profile = program
    .command("profile")
    .description("Inspect and sync the effective Growthub profile (local workspace + hosted overlay)");

  profile
    .command("status")
    .description("Show the merged local + hosted profile the CLI will use at runtime")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)")
    .option("--json", "Output raw JSON")
    .action(async (opts: BaseProfileOptions) => {
      await runProfileStatus(opts);
    });

  profile
    .command("pull")
    .description("Pull hosted Growthub profile metadata into the local overlay")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)")
    .option("--json", "Output raw JSON")
    .action(async (opts: BaseProfileOptions) => {
      await runProfilePull(opts);
    });

  profile
    .command("push")
    .description("Push safe local profile metadata (workspace linkage, labels) upward")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)")
    .option("--json", "Output raw JSON")
    .action(async (opts: BaseProfileOptions) => {
      await runProfilePush(opts);
    });

  profile
    .command("credits")
    .description("Show hosted credit balance for the authenticated Growthub user")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)")
    .option("--json", "Output raw JSON")
    .action(async (opts: BaseProfileOptions) => {
      await runProfileCredits(opts);
    });
}
