/**
 * CLI Commands — environment
 *
 * Environment Management lane:
 *   growthub environment            — interactive hub (Local · Hosted · Bridge)
 *   growthub environment snapshot   — one-shot render (supports --json)
 *   growthub environment refresh    — re-pull the hosted manifest + profile
 *
 * This is the two-end management surface promised by the v1 mental model:
 * Local (fork identity / policy / authority / extensions), Hosted (profile,
 * entitlements, registry), Bridge (session + cache + drift).
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  buildEnvironmentSnapshot,
  type EnvironmentSnapshot,
} from "../runtime/environment-snapshot/index.js";
import {
  renderBridgePanel,
  renderEnvironmentSnapshot,
  renderHostedPanel,
  renderLocalPanel,
} from "../runtime/environment-snapshot/renderers.js";
import { createCmsCapabilityRegistryClient } from "../runtime/cms-capability-registry/index.js";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { fleetView } from "./fleet.js";
import { runStatuspage } from "./status.js";


async function renderSnapshotWithSpinner(message: string): Promise<EnvironmentSnapshot> {
  const spinner = p.spinner();
  spinner.start(message);
  try {
    const snapshot = await buildEnvironmentSnapshot();
    spinner.stop(`Environment snapshot ready (${snapshot.bridge.state}).`);
    return snapshot;
  } catch (err) {
    spinner.stop(pc.red("Failed to build environment snapshot."));
    throw err;
  }
}

export async function runEnvironmentHub(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("🧭 Environment Management"));

  let snapshot: EnvironmentSnapshot;
  try {
    snapshot = await renderSnapshotWithSpinner("Building environment snapshot...");
  } catch (err) {
    p.log.error((err as Error).message);
    return opts.allowBackToHub ? "back" : "done";
  }

  while (true) {
    const tab = await p.select({
      message: "Pick a tab",
      options: [
        { value: "local",  label: "📦 Local",   hint: "Forks, policy, authority, local extensions" },
        { value: "hosted", label: "🔐 Hosted",  hint: "Profile, entitlements, registry" },
        { value: "bridge", label: "🔗 Bridge",  hint: "Session, cache, drift" },
        ...(opts.allowBackToHub ? [{ value: "__back", label: "← Back to main menu" }] : []),
      ],
    });

    if (p.isCancel(tab)) { p.cancel("Cancelled."); process.exit(0); }
    if (tab === "__back") return "back";

    if (tab === "local") {
      console.log("");
      console.log(renderLocalPanel(snapshot.local));
      console.log("");
      const localAction = await p.select({
        message: "Local actions",
        options: [
          { value: "fleet", label: "🛰  Show fleet index" },
          { value: "refresh", label: "🔄 Rebuild snapshot" },
          { value: "__back", label: "← Back to tabs" },
        ],
      });
      if (p.isCancel(localAction)) { p.cancel("Cancelled."); process.exit(0); }
      if (localAction === "fleet") await fleetView({});
      if (localAction === "refresh") {
        snapshot = await renderSnapshotWithSpinner("Rebuilding snapshot...");
      }
      continue;
    }

    if (tab === "hosted") {
      console.log("");
      console.log(renderHostedPanel(snapshot.hosted));
      console.log("");
      const hostedAction = await p.select({
        message: "Hosted actions",
        options: [
          { value: "refresh-registry", label: "🔄 Refresh capability manifest" },
          { value: "rebuild", label: "🔄 Rebuild snapshot" },
          { value: "__back", label: "← Back to tabs" },
        ],
      });
      if (p.isCancel(hostedAction)) { p.cancel("Cancelled."); process.exit(0); }
      if (hostedAction === "refresh-registry") {
        const spinner = p.spinner();
        spinner.start("Refreshing hosted manifest...");
        try {
          const registry = createCmsCapabilityRegistryClient({ bypassCache: true });
          const result = await registry.refresh();
          spinner.stop(`Registry hash ${result.envelope.meta.registryHash}.`);
          if (result.drift.severity !== "none") {
            p.note(
              [
                `Drift: ${result.drift.severity}`,
                result.drift.addedSlugs.length ? `+ ${result.drift.addedSlugs.join(", ")}` : null,
                result.drift.removedSlugs.length ? `- ${result.drift.removedSlugs.join(", ")}` : null,
                result.drift.mutatedSlugs.length ? `~ ${result.drift.mutatedSlugs.join(", ")}` : null,
              ].filter((x): x is string => Boolean(x)).join("\n"),
              "Manifest Drift",
            );
          }
        } catch (err) {
          spinner.stop(pc.red("Refresh failed."));
          p.log.error((err as Error).message);
        }
      }
      if (hostedAction === "rebuild" || hostedAction === "refresh-registry") {
        snapshot = await renderSnapshotWithSpinner("Rebuilding snapshot...");
      }
      continue;
    }

    if (tab === "bridge") {
      console.log("");
      console.log(renderBridgePanel(snapshot.bridge));
      console.log("");
      const bridgeAction = await p.select({
        message: "Bridge actions",
        options: [
          { value: "statuspage", label: "🟢 Run service statuspage" },
          { value: "rebuild", label: "🔄 Rebuild snapshot" },
          { value: "__back", label: "← Back to tabs" },
        ],
      });
      if (p.isCancel(bridgeAction)) { p.cancel("Cancelled."); process.exit(0); }
      if (bridgeAction === "statuspage") await runStatuspage({});
      if (bridgeAction === "rebuild") {
        snapshot = await renderSnapshotWithSpinner("Rebuilding snapshot...");
      }
      continue;
    }
  }
}

export function registerEnvironmentCommands(program: Command): void {
  const env = program
    .command("environment")
    .alias("env")
    .description("Environment Management — local fork, hosted account, bridge health");

  env.action(async () => {
    await runEnvironmentHub({});
  });

  env
    .command("snapshot")
    .description("Print a one-shot environment snapshot")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const snapshot = await buildEnvironmentSnapshot();
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        console.log("");
        console.log(renderEnvironmentSnapshot(snapshot));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to build environment snapshot: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  env
    .command("refresh")
    .description("Force a hosted manifest refresh and print the updated snapshot")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const registry = createCmsCapabilityRegistryClient({ bypassCache: true });
        await registry.refresh();
        const snapshot = await buildEnvironmentSnapshot();
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        console.log("");
        console.log(renderEnvironmentSnapshot(snapshot));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to refresh environment: " + (err as Error).message));
        process.exitCode = 1;
      }
    });
}
