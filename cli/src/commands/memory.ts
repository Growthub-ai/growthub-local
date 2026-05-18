/**
 * `growthub memory` — headless Memory & Knowledge surface.
 *
 * Mirrors the interactive `growthub discover → Memory & Knowledge` flow but
 * exposes each step as a non-interactive subcommand so agents and smoke tests
 * can drive the same primitives the discovery hub uses.
 *
 *   growthub memory status [--project <slug>] [--json]
 *   growthub memory seed   [--project <slug>] [--title <t>] [--type <t>] [--narrative <n>] [--json]
 *   growthub memory sync   [--project <slug>] [--json]
 *   growthub memory pull   [--project <slug>] [--json]
 *
 * Every call goes through the same `cli/src/runtime/memory/profile-binding.ts`
 * primitives that the discovery hub uses, which in turn call the published
 * `@growthub/api-contract` bridge primitives (`client.saveKnowledge`,
 * `client.listKnowledge`, `client.listKnowledgeTables`).
 */

import type { Command } from "commander";
import path from "node:path";
import pc from "picocolors";
import {
  addObservation,
  inspectMemoryProfileBinding,
  syncProjectToProfile,
  pullProjectMemoriesIfAvailable,
  setAutoSyncEnabled,
  type ObservationType,
  type ConceptCategory,
} from "../runtime/memory/index.js";

function resolveProject(project?: string): string {
  if (project && project.trim()) return project.trim();
  return path.basename(process.cwd());
}

export function registerMemoryCommands(program: Command): void {
  const memory = program
    .command("memory")
    .description("Memory & Knowledge — headless surface for the growthub_local_bridge knowledge tools");

  memory
    .command("status")
    .description("Inspect the binding between this project's memory and the connected Growthub profile")
    .option("--project <slug>", "Memory project slug (defaults to cwd basename)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: { project?: string; json?: boolean }) => {
      const project = resolveProject(opts.project);
      const binding = inspectMemoryProfileBinding(project);
      if (opts.json) {
        console.log(JSON.stringify(binding, null, 2));
        return;
      }
      console.log("");
      console.log(pc.bold(`Memory & Knowledge · ${project}`));
      console.log(pc.dim("─".repeat(60)));
      console.log(
        `  Authenticated:    ${binding.authenticated ? pc.green("yes") : pc.yellow("no")}`
        + (binding.hostedEmail ? pc.dim(` · ${binding.hostedEmail}`) : ""),
      );
      console.log(`  Observations:     ${binding.observationCount}`);
      console.log(`  Summaries:        ${binding.summaryCount}`);
      console.log(`  Pending push:     ${binding.pendingObservations} obs · ${binding.pendingSummaries} summaries`);
      console.log(`  Auto-sync:        ${binding.autoSyncEnabled ? pc.green("ON") : pc.dim("OFF")}`);
      if (binding.syncState.bridgeTableId) {
        console.log(`  Bridge table id:  ${pc.cyan(binding.syncState.bridgeTableId)}`);
        if (binding.syncState.bridgeTableFileName) {
          console.log(`  Bridge table:     ${pc.dim(binding.syncState.bridgeTableFileName)}`);
        }
      }
      if (binding.syncState.lastPushedAt) {
        console.log(`  Last pushed:      ${pc.dim(binding.syncState.lastPushedAt)}`);
      }
      if (binding.syncState.lastPullAt) {
        console.log(`  Last pulled:      ${pc.dim(`${binding.syncState.lastPullAt} (${binding.syncState.lastPullStatus ?? "ok"})`)}`);
      }
      const obsMap = binding.syncState.observationBridgeIds ?? {};
      const sumMap = binding.syncState.summaryBridgeIds ?? {};
      console.log(`  Mapped records:   ${Object.keys(obsMap).length} obs · ${Object.keys(sumMap).length} summaries`);
      if (binding.syncUnavailableReason) {
        console.log(pc.yellow(`  Sync unavailable: ${binding.syncUnavailableReason}`));
      }
      console.log("");
    });

  memory
    .command("seed")
    .description("Append a memory observation locally (no network) — useful for round-trip smoke tests")
    .option("--project <slug>", "Memory project slug (defaults to cwd basename)")
    .option("--title <text>", "Observation title")
    .option("--type <type>", "Observation type: bugfix | feature | refactor | change | discovery | decision | conversation")
    .option("--narrative <text>", "Long-form narrative for the observation")
    .option("--fact <fact...>", "Atomic facts (repeatable)")
    .option("--concept <concept...>", "Concept tags (repeatable): how-it-works | why-it-exists | what-changed | problem-solution | gotcha | pattern | trade-off")
    .option("--session-id <id>", "Session id (defaults to a fresh timestamped id)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: {
      project?: string;
      title?: string;
      type?: string;
      narrative?: string;
      fact?: string[];
      concept?: string[];
      sessionId?: string;
      json?: boolean;
    }) => {
      const project = resolveProject(opts.project);
      const title = opts.title?.trim() || `Smoke seed @ ${new Date().toISOString()}`;
      const sessionId = opts.sessionId?.trim() || `seed-${Date.now()}`;
      const type = (opts.type?.trim() || "discovery") as ObservationType;
      const concepts = (opts.concept ?? ["how-it-works"]) as ConceptCategory[];
      const facts = opts.fact ?? [];

      const observation = addObservation(project, {
        sessionId,
        type,
        title,
        narrative: opts.narrative,
        facts,
        concepts,
      });

      if (opts.json) {
        console.log(JSON.stringify({ status: "ok", project, observation }, null, 2));
        return;
      }
      console.log(pc.green("✓") + ` Seeded observation #${observation.id} in project ${pc.cyan(project)}.`);
    });

  memory
    .command("sync")
    .description("Push pending memory observations + summaries to the connected Growthub profile via the canonical bridge knowledge tools")
    .option("--project <slug>", "Memory project slug (defaults to cwd basename)")
    .option("--enable-auto", "Also flip auto-sync ON for this project (persists in sync-state.json)")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: { project?: string; enableAuto?: boolean; json?: boolean }) => {
      const project = resolveProject(opts.project);
      if (opts.enableAuto) setAutoSyncEnabled(project, true);
      const result = await syncProjectToProfile(project);
      if (opts.json) {
        console.log(JSON.stringify({ project, ...result }, null, 2));
        if (result.status === "error" || result.status === "unavailable") process.exitCode = 1;
        return;
      }
      if (result.status === "ok") {
        console.log(pc.green("✓") + ` Pushed ${result.pushedObservations} obs + ${result.pushedSummaries} summaries to Growthub.`);
        if (result.bridgeTableId) {
          console.log(pc.dim(`  Bridge table: ${result.bridgeTableFileName} (${result.bridgeTableId})`));
        }
      } else if (result.status === "no-changes") {
        console.log(pc.dim("Already up to date — no pending records to push."));
      } else if (result.status === "unavailable") {
        console.log(pc.yellow(`Sync unavailable: ${result.reason ?? ""}`));
        process.exitCode = 1;
      } else {
        console.log(pc.red(`Sync failed: ${result.reason ?? "unknown"}`));
        process.exitCode = 1;
      }
    });

  memory
    .command("pull")
    .description("Pull hosted-side memory items for this project (lists knowledge items in the project's bridge table)")
    .option("--project <slug>", "Memory project slug (defaults to cwd basename)")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      const project = resolveProject(opts.project);
      const result = await pullProjectMemoriesIfAvailable(project);
      if (opts.json) {
        console.log(JSON.stringify({ project, ...result }, null, 2));
        if (result.status === "error") process.exitCode = 1;
        return;
      }
      if (result.status === "ok") {
        console.log(
          pc.green("✓")
          + ` Pulled ${result.pulledObservations} obs + ${result.pulledSummaries} summaries from Growthub.`,
        );
        const items = result.items ?? [];
        for (const item of items.slice(0, 10)) {
          const tag = item.observationId !== undefined
            ? pc.dim(`obs#${item.observationId}`)
            : item.summaryId !== undefined
              ? pc.dim(`sum#${item.summaryId}`)
              : pc.dim("item");
          console.log(`  ${tag}  ${item.fileName}  ${pc.dim(item.bridgeId)}`);
        }
        if (items.length > 10) console.log(pc.dim(`  …+${items.length - 10} more`));
      } else if (result.status === "unavailable") {
        console.log(pc.yellow(`Pull unavailable: ${result.reason ?? ""}`));
      } else {
        console.log(pc.red(`Pull failed: ${result.reason ?? "unknown"}`));
        process.exitCode = 1;
      }
    });
}
