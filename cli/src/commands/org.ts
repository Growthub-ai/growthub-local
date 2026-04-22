/**
 * CLI Commands — org
 *
 * Thin read-only surface over the hosted profile:
 *
 *   growthub org show           — identity + entitlements + gated kits
 *   growthub org entitlements   — entitlement list only
 *   growthub org gated          — gated kit list only
 *
 * All data comes from `getHostedProfile()` on the hosted execution client;
 * no new network paths are introduced.
 */

import pc from "picocolors";
import { Command } from "commander";
import { createHostedExecutionClient } from "../runtime/hosted-execution-client/index.js";

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

async function fetchProfile() {
  const hosted = createHostedExecutionClient();
  return hosted.getHostedProfile();
}

export function registerOrgCommands(program: Command): void {
  const org = program
    .command("org")
    .description("Hosted organization / entitlement view");

  org
    .command("show")
    .description("Print identity, org, entitlements, and gated kits")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const profile = await fetchProfile();
        if (opts.json) {
          console.log(JSON.stringify(profile, null, 2));
          return;
        }
        console.log("");
        console.log(pc.bold("Hosted Organization"));
        console.log(hr());
        console.log(`  ${pc.dim("User:")}          ${profile.displayName ?? profile.email ?? profile.userId}`);
        if (profile.email) console.log(`  ${pc.dim("Email:")}         ${profile.email}`);
        console.log(`  ${pc.dim("User id:")}       ${profile.userId}`);
        if (profile.orgName) console.log(`  ${pc.dim("Org name:")}      ${profile.orgName}`);
        if (profile.orgId)   console.log(`  ${pc.dim("Org id:")}        ${profile.orgId}`);
        console.log(hr());
        console.log(`  ${pc.dim("Entitlements:")}  ${profile.entitlements.length > 0 ? profile.entitlements.join(", ") : pc.dim("(none)")}`);
        console.log(`  ${pc.dim("Gated kits:")}    ${profile.gatedKitSlugs.length > 0 ? profile.gatedKitSlugs.join(", ") : pc.dim("(none)")}`);
        console.log(hr());
        console.log(`  ${pc.dim("Preferred mode:")}    ${profile.executionDefaults.preferredMode}`);
        console.log(`  ${pc.dim("Serverless fallback:")} ${profile.executionDefaults.allowServerlessFallback}`);
        console.log(`  ${pc.dim("Browser bridge:")}    ${profile.executionDefaults.allowBrowserBridge}`);
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to read hosted profile: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  org
    .command("entitlements")
    .description("List hosted entitlements only")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const profile = await fetchProfile();
        if (opts.json) {
          console.log(JSON.stringify({ entitlements: profile.entitlements }, null, 2));
          return;
        }
        for (const ent of profile.entitlements) console.log(ent);
      } catch (err) {
        console.error(pc.red("Failed to read hosted profile: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  org
    .command("gated")
    .description("List gated kit slugs only")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const profile = await fetchProfile();
        if (opts.json) {
          console.log(JSON.stringify({ gatedKitSlugs: profile.gatedKitSlugs }, null, 2));
          return;
        }
        for (const slug of profile.gatedKitSlugs) console.log(slug);
      } catch (err) {
        console.error(pc.red("Failed to read hosted profile: " + (err as Error).message));
        process.exitCode = 1;
      }
    });
}
