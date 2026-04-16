/**
 * `growthub status` — Statuspage-style mission-critical service health grid.
 *
 * Self-contained CLI surface over `cli/src/status/`. Default view shows
 * standard components; `--super-admin` reveals elevated / slow / privileged
 * probes (release bundle verification etc). Emits JSON with `--json`.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runStatuspageReport } from "../status/runner.js";
import type { ServiceStatusLevel, StatuspageReport } from "../status/types.js";

function levelGlyph(level: ServiceStatusLevel): string {
  switch (level) {
    case "operational":
      return pc.green("●");
    case "degraded":
      return pc.yellow("●");
    case "outage":
      return pc.red("●");
    default:
      return pc.dim("○");
  }
}

function overallBanner(report: StatuspageReport): string {
  switch (report.overallLevel) {
    case "operational":
      return pc.green("✓ All systems operational");
    case "degraded":
      return pc.yellow("⚠ Degraded — non-critical issues detected");
    case "outage":
      return pc.red("✗ Outage — at least one critical component is down");
    default:
      return pc.dim("? Status indeterminate");
  }
}

function renderHuman(report: StatuspageReport): void {
  const byCategory = new Map<string, typeof report.components>();
  for (const c of report.components) {
    const bucket = byCategory.get(c.category) ?? [];
    bucket.push(c);
    byCategory.set(c.category, bucket);
  }

  p.log.message(`${overallBanner(report)}  ${pc.dim(`(${report.summary})`)}`);
  for (const [category, list] of byCategory) {
    p.log.message(pc.cyan(`\n  ${category}`));
    for (const c of list) {
      const crit = c.critical ? pc.red("!") : pc.dim("·");
      const lat = c.latencyMs !== undefined ? pc.dim(` ${c.latencyMs}ms`) : "";
      const sa = c.superAdminOnly ? pc.magenta(" [super-admin]") : "";
      p.log.message(`    ${levelGlyph(c.level)} ${crit} ${c.label.padEnd(30)} ${c.summary}${lat}${sa}`);
    }
  }
}

export interface StatuspageCommandOptions {
  json?: boolean;
  superAdmin?: boolean;
  onlyCategory?: string;
  only?: string[];
  timeoutMs?: number;
}

export async function runStatuspage(opts: StatuspageCommandOptions): Promise<void> {
  const report = await runStatuspageReport({
    superAdmin: opts.superAdmin ?? false,
    onlyCategory: opts.onlyCategory as StatuspageReport["components"][number]["category"] | undefined,
    onlyIds: opts.only,
    perProbeTimeoutMs: opts.timeoutMs,
  });

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    // Non-zero exit on outage so CI automation can gate on it.
    if (report.overallLevel === "outage") process.exitCode = 2;
    return;
  }

  renderHuman(report);
  if (report.overallLevel === "outage") process.exitCode = 2;
}

export function registerStatusCommands(program: Command): void {
  program
    .command("status")
    .description("Statuspage-style health grid for every mission-critical service the CLI depends on.")
    .option("--json", "Emit machine-readable report")
    .option("--super-admin", "Include super-admin-only probes (release bundle, etc)")
    .option("--only-category <category>", "Restrict to a single category (e.g. github, fork-sync)")
    .option("--only <id...>", "Restrict to specific component ids")
    .option("--timeout-ms <n>", "Per-probe timeout in ms (default 5000)", (v) => Number(v))
    .action(async (opts) => {
      await runStatuspage(opts);
    });
}
