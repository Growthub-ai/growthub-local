import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import * as p from "@clack/prompts";
import {
  downloadBundledKit,
  inspectBundledKit,
  listBundledKits,
  resolveKitPath,
  validateKitDirectory,
} from "../kits/service.js";
import {
  getJobStatus,
  initForkSync,
  listJobs,
  listRegisteredForks,
  planForkSync,
  readJobReport,
  startSyncJob,
} from "../kits/sync/index.js";

function printKeyValue(label: string, value: string | number): void {
  console.log(`${pc.bold(label)} ${value}`);
}

export function registerKitCommands(program: Command): void {
  const kit = program.command("kit").description("Growthub Agent Worker Kit capability packaging utilities");

  kit
    .command("list")
    .description("List the bundled worker kits available in this CLI build")
    .action(() => {
      const kits = listBundledKits();
      if (kits.length === 0) {
        console.log(pc.dim("No bundled worker kits are available in this CLI build."));
        return;
      }

      for (const item of kits) {
        console.log(
          [
            pc.bold(item.id),
            `type=${item.type}`,
            `version=${item.version}`,
            `bundle=${item.bundleId}@${item.bundleVersion}`,
            `briefType=${item.briefType}`,
            `mode=${item.executionMode}`,
            `name=${item.name}`,
          ].join("  "),
        );
      }
    });

  kit
    .command("inspect")
    .description("Inspect a bundled worker kit manifest and export metadata")
    .argument("<kit-id>", "Bundled worker kit id")
    .option("--out <path>", "Override the export root used for resolved output paths")
    .action((kitId: string, opts: { out?: string }) => {
      const info = inspectBundledKit(kitId, opts.out);
      printKeyValue("Kit:", `${info.id} @ ${info.version}`);
      printKeyValue("Name:", info.name);
      printKeyValue("Type:", info.type);
      printKeyValue("Execution Mode:", info.executionMode);
      printKeyValue("Activation Modes:", info.activationModes.join(", "));
      printKeyValue("Schema Version:", info.schemaVersion);
      printKeyValue("Bundle:", `${info.bundleId} @ ${info.bundleVersion}`);
      printKeyValue("Brief Type:", info.briefType);
      printKeyValue("Entrypoint:", info.entrypointPath);
      printKeyValue("Agent Contract:", info.agentContractPath);
      printKeyValue("Brand Template:", info.brandTemplatePath);
      printKeyValue("Frozen Assets:", info.frozenAssetCount);
      printKeyValue("Required Export Assets:", info.requiredFrozenAssetCount);
      printKeyValue("Export Root:", info.outputRoot);
      printKeyValue("Export Folder:", info.exportFolderPath);
      printKeyValue("Export Zip:", info.exportZipPath);

      if (Object.keys(info.compatibility).length > 0) {
        console.log(pc.bold("Compatibility:"));
        for (const [key, value] of Object.entries(info.compatibility)) {
          if (value !== undefined) {
            console.log(`  ${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
          }
        }
      }

      console.log(pc.bold("Public Example Brands:"));
      for (const brandPath of info.publicExampleBrandPaths) {
        console.log(`- ${brandPath}`);
      }

      console.log(pc.bold("Required Paths:"));
      for (const requiredPath of info.requiredPaths) {
        console.log(`- ${requiredPath}`);
      }
    });

  kit
    .command("download")
    .description("Export a bundled worker kit as both a zip file and expanded folder")
    .argument("<kit-id>", "Bundled worker kit id")
    .option("--out <path>", "Output directory for the generated artifacts")
    .action((kitId: string, opts: { out?: string }) => {
      const result = downloadBundledKit(kitId, opts.out);
      printKeyValue("Expanded Folder:", result.folderPath);
      printKeyValue("Zip File:", result.zipPath);
      console.log("");
      console.log(pc.bold("Next steps:"));
      console.log(`  1. Point Growthub local (or Claude Code) Working Directory at: ${pc.cyan(result.folderPath)}`);
      console.log(`  2. ${pc.cyan("cp .env.example .env")}  →  add your MUAPI_API_KEY`);
      console.log(`  3. ${pc.cyan("bash setup/clone-fork.sh")}  →  boot the local studio (optional)`);
      console.log(`  4. Open a new Claude Code session — the agent takes it from there`);
      console.log("");
      console.log(`  ${pc.dim("Docs: QUICKSTART.md | validation-checklist.md")}`);
    });

  kit
    .command("path")
    .description("Resolve the expected expanded export folder path without exporting")
    .argument("<kit-id>", "Bundled worker kit id")
    .option("--out <path>", "Output directory for the generated artifacts")
    .action((kitId: string, opts: { out?: string }) => {
      console.log(resolveKitPath(kitId, opts.out));
    });

  kit
    .command("validate")
    .description("Validate a kit directory against the kit contract schema")
    .argument("<path>", "Path to the kit directory to validate")
    .action((kitPath: string) => {
      const resolvedPath = path.resolve(kitPath);
      const result = validateKitDirectory(resolvedPath);

      printKeyValue("Kit:", result.kitId);
      printKeyValue("Schema Version:", result.schemaVersion);

      if (result.warnings.length > 0) {
        console.log(pc.yellow(pc.bold(`Warnings (${result.warnings.length}):`)));
        for (const warning of result.warnings) {
          console.log(pc.yellow(`  ${warning.field}: ${warning.message}`));
        }
      }

      if (result.errors.length > 0) {
        console.log(pc.red(pc.bold(`Errors (${result.errors.length}):`)));
        for (const error of result.errors) {
          console.log(pc.red(`  ${error.field}: ${error.message}`));
        }
        printKeyValue("Result:", pc.red("INVALID"));
        process.exitCode = 1;
      } else {
        printKeyValue("Result:", pc.green("VALID"));
      }
    });

  registerKitSyncCommands(kit);
  registerKitDiscoverCommand(kit);
}

function registerKitDiscoverCommand(kit: Command): void {
  kit
    .command("discover")
    .description("Interactive Worker Kits discovery — fork sync and self-heal")
    .action(async () => {
      p.intro(pc.bold("Growthub Worker Kits"));

      const bundledKits = listBundledKits();
      const registeredForks = listRegisteredForks();

      const choices: Array<{ value: string; label: string; hint?: string }> = [
        { value: "fork-sync", label: "Fork sync and self-heal", hint: "plan/apply upstream updates to a forked kit" },
        { value: "list-bundled", label: "List bundled worker kits" },
      ];
      if (registeredForks.length > 0) {
        choices.push({ value: "list-forks", label: `Show registered forks (${registeredForks.length})` });
      }

      const action = await p.select({
        message: "What do you want to do?",
        options: choices,
      });

      if (p.isCancel(action)) {
        p.cancel("cancelled");
        return;
      }

      if (action === "list-bundled") {
        for (const item of bundledKits) {
          p.log.info(`${pc.bold(item.id)}  ${item.type}  ${item.version}  ${item.name}`);
        }
        p.outro("Use 'growthub kit inspect <kit-id>' for full metadata.");
        return;
      }

      if (action === "list-forks") {
        for (const record of registeredForks) {
          p.log.info(
            `${pc.bold(record.forkId)}  kit=${record.kitId}  baseline=${record.baselineVersion}  path=${record.forkPath}`,
          );
        }
        p.outro("Use 'growthub kit sync plan <fork-id>' to preview drift.");
        return;
      }

      const flow = await p.select({
        message: "Fork sync — choose a step",
        options: [
          { value: "init", label: "Register a fork and capture baseline" },
          { value: "plan", label: "Preview drift for a registered fork" },
          { value: "start", label: "Run a self-healing sync job" },
          { value: "status", label: "Inspect the latest sync job" },
        ],
      });
      if (p.isCancel(flow)) { p.cancel("cancelled"); return; }

      if (flow === "init") {
        const kitChoice = await p.select({
          message: "Which bundled kit is this fork derived from?",
          options: bundledKits.map((item) => ({ value: item.id, label: `${item.id}  (${item.version})` })),
        });
        if (p.isCancel(kitChoice)) { p.cancel("cancelled"); return; }
        const forkPath = await p.text({
          message: "Absolute path to the forked kit directory",
          validate: (value) => (value.trim() ? undefined : "path is required"),
        });
        if (p.isCancel(forkPath)) { p.cancel("cancelled"); return; }
        const forkAlias = await p.text({
          message: "Optional fork id (press enter to auto-derive)",
          defaultValue: "",
        });
        if (p.isCancel(forkAlias)) { p.cancel("cancelled"); return; }
        const result = initForkSync({
          kitId: kitChoice as string,
          forkPath: forkPath as string,
          forkId: (forkAlias as string) || undefined,
        });
        p.log.success(`Registered fork ${result.record.forkId} @ baseline ${result.record.baselineVersion}`);
        p.outro(`Next: growthub kit sync plan ${result.record.forkId}`);
        return;
      }

      if (registeredForks.length === 0) {
        p.log.warn("No forks registered yet. Run the init flow first.");
        p.outro("");
        return;
      }

      const forkChoice = await p.select({
        message: "Pick a fork",
        options: registeredForks.map((record) => ({
          value: record.forkId,
          label: `${record.forkId}  kit=${record.kitId}  baseline=${record.baselineVersion}`,
        })),
      });
      if (p.isCancel(forkChoice)) { p.cancel("cancelled"); return; }

      if (flow === "plan") {
        const { summary, upstreamVersion } = planForkSync(forkChoice as string);
        p.log.info(`Baseline=${summary.baselineVersion}  Upstream=${upstreamVersion}`);
        p.log.info(`Totals: ${JSON.stringify(summary.totals)}`);
        p.outro(`Actionable entries: ${summary.entries.filter((e) => e.action !== "noop").length}`);
        return;
      }

      if (flow === "start") {
        const autoApply = await p.confirm({ message: "Apply safe upstream updates in-place?", initialValue: false });
        if (p.isCancel(autoApply)) { p.cancel("cancelled"); return; }
        const detach = await p.confirm({ message: "Run as a detached background process?", initialValue: false });
        if (p.isCancel(detach)) { p.cancel("cancelled"); return; }
        const result = startSyncJob({
          forkId: forkChoice as string,
          autoApply: autoApply as boolean,
          detach: detach as boolean,
        });
        p.log.success(`Sync job ${result.state.jobId} → status=${result.state.status}`);
        p.outro(`Report: ${result.state.reportPath}`);
        return;
      }

      if (flow === "status") {
        const state = getJobStatus(forkChoice as string);
        p.log.info(`${state.jobId}  ${state.status}  mode=${state.mode}  auto=${state.autoApply}`);
        if (state.summary) p.log.info(JSON.stringify(state.summary));
        p.outro(`Log: ${state.logPath}`);
      }
    });
}

function registerKitSyncCommands(kit: Command): void {
  const sync = kit
    .command("sync")
    .description("Fork sync and self-heal for customized worker kits");

  sync
    .command("init")
    .description("Register a forked kit directory and capture an upstream baseline")
    .argument("<kit-id>", "Bundled worker kit id this fork is derived from")
    .option("--fork <path>", "Path to the forked kit directory on disk")
    .option("--as <name>", "Optional fork id (lowercase letters, digits, '-', '_')")
    .option("--notes <text>", "Free-form notes captured with the registration")
    .action((kitId: string, opts: { fork?: string; as?: string; notes?: string }) => {
      if (!opts.fork) {
        console.error(pc.red("--fork <path> is required"));
        process.exitCode = 1;
        return;
      }
      const result = initForkSync({
        kitId,
        forkPath: opts.fork,
        forkId: opts.as,
        notes: opts.notes,
      });
      printKeyValue("Fork ID:", result.record.forkId);
      printKeyValue("Kit:", `${result.source.kitId}@${result.source.version}`);
      printKeyValue("Fork Path:", result.record.forkPath);
      printKeyValue("Baseline Version:", result.record.baselineVersion);
      printKeyValue("Baseline Captured:", result.record.baselineCapturedAt);
      console.log("");
      console.log(pc.bold("Next steps:"));
      console.log(`  ${pc.cyan(`growthub kit sync plan ${result.record.forkId}`)}  →  preview drift`);
      console.log(`  ${pc.cyan(`growthub kit sync start ${result.record.forkId} --auto-apply`)}  →  self-heal`);
    });

  sync
    .command("list")
    .description("List all registered forked kits")
    .action(() => {
      const records = listRegisteredForks();
      if (records.length === 0) {
        console.log(pc.dim("No forked kits registered. Run 'growthub kit sync init <kit-id> --fork <path>' first."));
        return;
      }
      for (const record of records) {
        console.log(
          [
            pc.bold(record.forkId),
            `kit=${record.kitId}`,
            `baseline=${record.baselineVersion}`,
            `lastSync=${record.lastSyncAt ?? "—"}`,
            `path=${record.forkPath}`,
          ].join("  "),
        );
      }
    });

  sync
    .command("plan")
    .description("Preview drift between the forked kit and the current bundled kit")
    .argument("<fork-id>", "Registered fork id")
    .option("--json", "Emit drift summary as JSON")
    .action((forkId: string, opts: { json?: boolean }) => {
      const { record, summary, upstreamVersion } = planForkSync(forkId);
      if (opts.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      printKeyValue("Fork:", `${record.forkId} (${record.kitId})`);
      printKeyValue("Baseline:", record.baselineVersion);
      printKeyValue("Upstream:", upstreamVersion);
      console.log("");
      console.log(pc.bold("Totals:"));
      for (const [label, value] of Object.entries(summary.totals)) {
        console.log(`  ${label}: ${value}`);
      }
      const actionable = summary.entries.filter((entry) => entry.action !== "noop");
      if (actionable.length === 0) {
        console.log("");
        console.log(pc.green("No drift detected — fork is in sync with upstream."));
        return;
      }
      console.log("");
      console.log(pc.bold("Actionable entries:"));
      for (const entry of actionable) {
        const colour = entry.action === "escalate-review" || entry.action === "skip-frozen-conflict"
          ? pc.yellow
          : entry.action === "apply-upstream" || entry.action === "merge-package-json"
            ? pc.cyan
            : pc.dim;
        console.log(`  ${colour(entry.action)}  ${entry.path}  (${entry.classification})`);
      }
    });

  sync
    .command("start")
    .description("Launch a self-healing sync job for a registered fork")
    .argument("<fork-id>", "Registered fork id")
    .option("--auto-apply", "Apply safe upstream updates in-place on the fork", false)
    .option("--detach", "Run the sync job as a detached background process", false)
    .option("--branch <name>", "Override the worktree branch name created for the sync")
    .action((forkId: string, opts: { autoApply?: boolean; detach?: boolean; branch?: string }) => {
      const result = startSyncJob({
        forkId,
        autoApply: opts.autoApply,
        detach: opts.detach,
        branchOverride: opts.branch,
      });
      printKeyValue("Job ID:", result.state.jobId);
      printKeyValue("Mode:", result.state.mode);
      printKeyValue("Auto-apply:", result.state.autoApply ? "yes" : "no");
      printKeyValue("Status:", colourStatus(result.state.status));
      if (result.state.branch) printKeyValue("Branch:", result.state.branch);
      printKeyValue("Log:", result.state.logPath);
      printKeyValue("Report:", result.state.reportPath);
      if (result.detached) {
        console.log("");
        console.log(pc.dim(`Detached runner launched (pid=${result.state.pid ?? "?"}). Poll with:`));
        console.log(`  ${pc.cyan(`growthub kit sync status ${forkId} --job ${result.state.jobId}`)}`);
      }
    });

  sync
    .command("status")
    .description("Show the status of a sync job for a fork")
    .argument("<fork-id>", "Registered fork id")
    .option("--job <id>", "Specific job id (defaults to the most recent job)")
    .option("--json", "Emit job state as JSON")
    .action((forkId: string, opts: { job?: string; json?: boolean }) => {
      const state = getJobStatus(forkId, opts.job);
      if (opts.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      printKeyValue("Job ID:", state.jobId);
      printKeyValue("Status:", colourStatus(state.status));
      printKeyValue("Mode:", state.mode);
      printKeyValue("Auto-apply:", state.autoApply ? "yes" : "no");
      printKeyValue("Baseline:", state.baselineVersion);
      printKeyValue("Upstream:", state.upstreamVersion);
      printKeyValue("Started:", state.startedAt);
      if (state.endedAt) printKeyValue("Ended:", state.endedAt);
      if (state.branch) printKeyValue("Branch:", state.branch);
      if (state.summary) {
        console.log(pc.bold("Summary:"));
        for (const [label, value] of Object.entries(state.summary)) {
          console.log(`  ${label}: ${value}`);
        }
      }
      if (state.error) {
        console.log(pc.red(`Error: ${state.error}`));
      }
    });

  sync
    .command("jobs")
    .description("List all sync jobs recorded for a fork")
    .argument("<fork-id>", "Registered fork id")
    .action((forkId: string) => {
      const jobs = listJobs(forkId);
      if (jobs.length === 0) {
        console.log(pc.dim(`No sync jobs recorded for fork ${forkId}.`));
        return;
      }
      for (const job of jobs) {
        console.log(
          [
            pc.bold(job.jobId),
            `status=${colourStatus(job.status)}`,
            `mode=${job.mode}`,
            `auto=${job.autoApply ? "yes" : "no"}`,
            `started=${job.startedAt}`,
          ].join("  "),
        );
      }
    });

  sync
    .command("report")
    .description("Print the human-readable report for a sync job")
    .argument("<fork-id>", "Registered fork id")
    .option("--job <id>", "Specific job id (defaults to the most recent job)")
    .action((forkId: string, opts: { job?: string }) => {
      console.log(readJobReport(forkId, opts.job));
    });
}

function colourStatus(status: string): string {
  switch (status) {
    case "succeeded": return pc.green(status);
    case "running":   return pc.cyan(status);
    case "queued":    return pc.dim(status);
    case "failed":    return pc.red(status);
    case "needs-review": return pc.yellow(status);
    default:          return status;
  }
}
