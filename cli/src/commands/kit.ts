import path from "node:path";
import { pathToFileURL } from "node:url";
import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import {
  downloadBundledKit,
  inspectBundledKit,
  listBundledKits,
  resolveKitPath,
  validateKitDirectory,
  fuzzyResolveKitId,
  type KitListItem,
  type KitDownloadProgress,
} from "../kits/service.js";
import {
  listRegisteredKitForks,
  registerKitFork,
  planKitForkSync,
  startKitForkSyncJob,
  listKitForkSyncJobs,
  readKitForkSyncJob,
  runPreparedKitForkSyncJob,
  type KitForkRegistration,
  type KitForkSyncJobState,
  type KitForkSyncPlan,
} from "../kits/fork-sync.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Type display config — user-facing grouping independent from internal families
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, { color: (s: string) => string; emoji: string; label: string }> = {
  studio: { color: pc.cyan, emoji: "🛠️", label: "Custom Workspaces" },
  specialized_agents: { color: pc.magenta, emoji: "🧠", label: "Specialized Agents" },
  ops: { color: pc.yellow, emoji: "⚙️ ", label: "Ops" },
};

function displayTypeForFamily(family: string): keyof typeof TYPE_CONFIG | string {
  if (family === "workflow" || family === "operator") return "specialized_agents";
  if (family === "studio" || family === "ops") return family;
  return family;
}

function typeColor(family: string, text: string): string {
  const type = displayTypeForFamily(family);
  return TYPE_CONFIG[type]?.color(text) ?? text;
}

function typeBadge(family: string): string {
  const type = displayTypeForFamily(family);
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return String(type);
  return cfg.color(`${cfg.emoji} ${cfg.label}`);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function displayKitName(name: string): string {
  return name.replace(/^Growthub Agent Worker Kit\s+[—-]\s+/u, "").trim();
}

// ---------------------------------------------------------------------------
// Simple horizontal rule and box helpers (no external deps)
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function box(lines: string[]): string {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top    = pc.dim("┌" + "─".repeat(width) + "┐");
  const bottom = pc.dim("└" + "─".repeat(width) + "┘");
  const body = padded.map((l) => {
    const pad = width - stripAnsi(l).length;
    return pc.dim("│") + l + " ".repeat(pad) + pc.dim("│");
  });
  return [top, ...body, bottom].join("\n");
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function terminalLink(label: string, href: string): string {
  return `\u001B]8;;${href}\u0007${label}\u001B]8;;\u0007`;
}

function folderOpenLabel(folderPath: string): string {
  const href = pathToFileURL(folderPath).href;
  const label =
    process.platform === "darwin"
      ? "Open in Finder"
      : process.platform === "win32"
        ? "Open in Explorer"
        : "Open folder";
  return terminalLink(label, href);
}

function renderProgressBar(progress: KitDownloadProgress): void {
  if (!process.stdout.isTTY) return;
  const width = 24;
  const filled = Math.max(0, Math.min(width, Math.round((progress.percent / 100) * width)));
  const bar = `${"=".repeat(filled)}${"-".repeat(width - filled)}`;
  const detail = truncate(progress.detail, 48);
  const line = `\r${pc.cyan("Exporting kit")} ${pc.dim("[")}${pc.green(bar)}${pc.dim("]")} ${String(progress.percent).padStart(3)}% ${pc.dim(detail)}`;
  process.stdout.write(line);
  if (progress.phase === "done") {
    process.stdout.write("\n");
  }
}

// ---------------------------------------------------------------------------
// Kit preview card
// ---------------------------------------------------------------------------

function printKitCard(item: KitListItem): void {
  const badge = typeBadge(item.family);
  console.log("");
  console.log(box([
    `${pc.bold(item.name)}  ${pc.dim("v" + item.version)}`,
    `${badge}  ${pc.dim(item.id)}`,
    "",
    truncate(item.description, 62),
    "",
    `${pc.dim("Brief:")} ${pc.dim(item.briefType)}   ${pc.dim("Mode:")} ${pc.dim(item.executionMode)}`,
  ]));
}

function getActionLabel(action: string): string {
  if (action === "download") return "download";
  if (action === "inspect") return "inspect";
  if (action === "fork-sync") return "fork sync & self-heal";
  if (action === "copy-id") return "print id";
  return action;
}

async function confirmKitActions(input: {
  kits: KitListItem[];
  actions: string[];
}): Promise<boolean> {
  const actionLabels = input.actions.map((action) => {
    return getActionLabel(action);
  });

  const summaryLines = [
    pc.bold("Selected kits"),
    ...input.kits.map((kit) => `${typeBadge(kit.family)}  ${displayKitName(kit.name)}`),
    "",
    pc.bold("Selected actions"),
    actionLabels.join(", "),
  ];

  console.log("");
  console.log(box(summaryLines));

  const confirmed = await p.confirm({
    message: "Continue with these worker kit actions?",
    initialValue: false,
  });

  if (p.isCancel(confirmed)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return Boolean(confirmed);
}

// ---------------------------------------------------------------------------
// Grouped list renderer
// ---------------------------------------------------------------------------

function printGroupedList(kits: KitListItem[]): void {
  const byType: Record<string, KitListItem[]> = {};
  for (const kit of kits) {
    const type = displayTypeForFamily(kit.family);
    (byType[type] ??= []).push(kit);
  }

  const types = Object.keys(byType).sort();
  const totalTypes = types.length;

  console.log("");
  console.log(
    pc.bold("Growthub Agent Worker Kits") +
    pc.dim(`  ${kits.length} kit${kits.length !== 1 ? "s" : ""} · ${totalTypes} type${totalTypes !== 1 ? "s" : ""}`),
  );
  console.log(hr());

  for (const type of types) {
    const groupKits = byType[type];
    const header = typeBadge(type);

    console.log(`\n${header}  ${pc.dim("(" + groupKits.length + ")")}`);

    for (const kit of groupKits) {
      console.log(`  ${typeColor(kit.family, pc.bold(kit.id))}  ${pc.dim("v" + kit.version)}`);
      console.log(`  ${pc.dim(truncate(kit.description, 62))}`);
      console.log(`  ${pc.dim("→")} ${pc.cyan("growthub kit download " + kit.id)}`);
      console.log("");
    }
  }

  console.log(hr());
  console.log(pc.dim("  growthub kit download <id>  ·  growthub kit inspect <id>  ·  growthub kit families"));
  console.log("");
}

function forkStatusBadge(status: KitForkSyncJobState["status"]): string {
  if (status === "succeeded") return pc.green("succeeded");
  if (status === "running") return pc.cyan("running");
  if (status === "queued") return pc.blue("queued");
  if (status === "needs_review") return pc.yellow("needs review");
  return pc.red("failed");
}

function latestJobForFork(forkId: string): KitForkSyncJobState | null {
  const [latest] = listKitForkSyncJobs(forkId);
  return latest ?? null;
}

function printForkRegistrations(registrations: KitForkRegistration[]): void {
  if (registrations.length === 0) {
    console.log("");
    console.log(box([
      pc.bold("Fork sync agent"),
      "",
      "No worker-kit forks are registered yet.",
      "Use " + pc.cyan("growthub kit sync init <kit-id> --fork-path <path>") + " to register one.",
    ]));
    console.log("");
    return;
  }

  console.log("");
  console.log(pc.bold("Registered Worker Kit Forks"));
  console.log(hr());
  for (const registration of registrations) {
    const latestJob = latestJobForFork(registration.id);
    console.log(box([
      `${pc.bold(registration.id)}  ${pc.dim(registration.kitId)}`,
      `${pc.dim("Fork path:")} ${truncate(registration.forkPath, 70)}`,
      `${pc.dim("Base branch:")} ${registration.baseBranch}   ${pc.dim("Sync prefix:")} ${registration.branchPrefix}`,
      `${pc.dim("Baseline:")} ${registration.baselineVersion ?? "not captured"}   ${pc.dim("Last sync:")} ${registration.lastSyncedUpstreamVersion ?? "never"}`,
      `${pc.dim("Latest job:")} ${latestJob ? `${latestJob.id} (${forkStatusBadge(latestJob.status)})` : "none"}`,
    ]));
    console.log("");
  }
}

function printForkSyncPlan(plan: KitForkSyncPlan): void {
  console.log("");
  console.log(box([
    `${pc.bold("Fork sync plan")}  ${pc.dim(plan.registration.id)}`,
    `${pc.dim("Bundled kit:")} ${plan.registration.kitId}`,
    `${pc.dim("Fork path:")} ${truncate(plan.registration.forkPath, 68)}`,
    `${pc.dim("Baseline → upstream:")} ${plan.baselineVersion ?? "none"} → ${plan.upstreamVersion}`,
    `${pc.dim("Dirty working tree:")} ${plan.dirtyWorkingTree ? pc.yellow("yes") : pc.green("no")}`,
    "",
    `${pc.dim("Upstream changed files:")} ${String(plan.upstreamChangedFiles)}`,
    `${pc.dim("Fork customized files:")} ${String(plan.forkCustomizedFiles)}`,
    `${pc.dim("Potential overlap:")} ${String(plan.potentialConflictFiles.length)}`,
    `${pc.dim("Local-only files:")} ${String(plan.localOnlyFiles.length)}`,
    `${pc.dim("Upstream-only files:")} ${String(plan.upstreamOnlyFiles.length)}`,
    `${pc.dim("package.json files:")} ${String(plan.packageJsonFiles.length)}`,
    "",
    `${pc.dim("Preview:")} ${plan.previewFiles.length > 0 ? plan.previewFiles.join(", ") : "no drift detected"}`,
  ]));
  console.log("");
}

function printForkSyncJobs(jobs: KitForkSyncJobState[]): void {
  if (jobs.length === 0) {
    console.log("");
    console.log(box([
      pc.bold("Fork sync jobs"),
      "",
      "No detached jobs have been started yet.",
    ]));
    console.log("");
    return;
  }

  console.log("");
  console.log(pc.bold("Fork Sync Jobs"));
  console.log(hr());
  for (const job of jobs) {
    console.log(box([
      `${pc.bold(job.id)}  ${forkStatusBadge(job.status)}`,
      `${pc.dim("Fork:")} ${job.forkId}   ${pc.dim("Kit:")} ${job.kitId}`,
      `${pc.dim("Branch:")} ${job.branchName}`,
      `${pc.dim("Worktree:")} ${truncate(job.worktreePath, 72)}`,
      `${pc.dim("Log:")} ${truncate(job.logPath, 76)}`,
      `${pc.dim("Report:")} ${truncate(job.reportPath, 73)}`,
      `${pc.dim("Started:")} ${job.startedAt ?? "not started"}   ${pc.dim("Finished:")} ${job.finishedAt ?? "pending"}`,
      ...(job.error ? [`${pc.dim("Error:")} ${truncate(job.error, 74)}`] : []),
    ]));
    console.log("");
  }
}

function printForkSyncJobDetails(job: KitForkSyncJobState): void {
  const summary = job.summary;
  console.log("");
  console.log(box([
    `${pc.bold(job.id)}  ${forkStatusBadge(job.status)}`,
    `${pc.dim("Fork:")} ${job.forkId}   ${pc.dim("Kit:")} ${job.kitId}`,
    `${pc.dim("Branch:")} ${job.branchName}`,
    `${pc.dim("Worktree:")} ${truncate(job.worktreePath, 72)}`,
    `${pc.dim("Log:")} ${truncate(job.logPath, 76)}`,
    `${pc.dim("Skill:")} ${truncate(job.skillPath, 74)}`,
    `${pc.dim("Report:")} ${truncate(job.reportPath, 73)}`,
    `${pc.dim("Started:")} ${job.startedAt ?? "not started"}`,
    `${pc.dim("Finished:")} ${job.finishedAt ?? "pending"}`,
    ...(job.error ? [`${pc.dim("Error:")} ${truncate(job.error, 74)}`] : []),
    ...(summary ? [
      "",
      `${pc.dim("Merged files:")} ${String(summary.mergedFiles)}`,
      `${pc.dim("Upstream applied:")} ${String(summary.upstreamAppliedFiles)}`,
      `${pc.dim("Preserved fork files:")} ${String(summary.preservedForkFiles)}`,
      `${pc.dim("Removed files:")} ${String(summary.removedFiles)}`,
      `${pc.dim("Conflicts:")} ${summary.conflictFiles.length > 0 ? summary.conflictFiles.join(", ") : "none"}`,
      `${pc.dim("Validation:")} ${summary.validationErrors.length > 0 ? summary.validationErrors.join(", ") : "passed"}`,
    ] : []),
  ]));
  console.log("");
}

function printForkRegistration(
  registration: KitForkRegistration,
  baselinePath: string,
  upstreamVersion: string,
): void {
  console.log("");
  console.log(box([
    `${pc.bold("Fork sync registration saved")}  ${pc.dim(registration.id)}`,
    `${pc.dim("Bundled kit:")} ${registration.kitId}@${upstreamVersion}`,
    `${pc.dim("Fork path:")} ${truncate(registration.forkPath, 72)}`,
    `${pc.dim("Repo path:")} ${registration.repoRelativePath}`,
    `${pc.dim("Base branch:")} ${registration.baseBranch}   ${pc.dim("Sync prefix:")} ${registration.branchPrefix}`,
    `${pc.dim("Baseline snapshot:")} ${truncate(baselinePath, 62)}`,
  ]));
  console.log("");
}

function printStartedForkSyncJob(job: KitForkSyncJobState): void {
  printForkSyncJobDetails(job);
  console.log(box([
    pc.bold("Next steps"),
    "",
    `Monitor: ${pc.cyan(`growthub kit sync status --job ${job.id}`)}`,
    `Artifacts: ${pc.cyan(`growthub kit sync report --job ${job.id}`)}`,
    `Job log: ${truncate(job.logPath, 66)}`,
  ]));
  console.log("");
}

function resolveRequestedJob(
  forkOrJobId?: string,
  explicitJobId?: string,
): KitForkSyncJobState | null {
  if (explicitJobId?.trim()) {
    return readKitForkSyncJob(explicitJobId.trim());
  }
  if (forkOrJobId?.trim()) {
    const trimmed = forkOrJobId.trim();
    return readKitForkSyncJob(trimmed) ?? latestJobForFork(trimmed);
  }
  const [latest] = listKitForkSyncJobs();
  return latest ?? null;
}

function printJobStatus(job: KitForkSyncJobState): void {
  printForkSyncJobDetails(job);
}

function printJobList(jobs: KitForkSyncJobState[]): void {
  printForkSyncJobs(jobs);
}

function printJobArtifacts(job: KitForkSyncJobState): void {
  console.log("");
  console.log(box([
    `${pc.bold("Fork sync artifacts")}  ${forkStatusBadge(job.status)}`,
    `${pc.dim("Job:")} ${job.id}`,
    `${pc.dim("Report:")} ${truncate(job.reportPath, 72)}`,
    `${pc.dim("Skill pack:")} ${truncate(job.skillPath, 68)}`,
    `${pc.dim("Log:")} ${truncate(job.logPath, 75)}`,
    `${pc.dim("Worktree:")} ${truncate(job.worktreePath, 71)}`,
    "",
    `Status: ${pc.cyan(`growthub kit sync status --job ${job.id}`)}`,
  ]));
  console.log("");
}

async function promptRequiredText(input: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
}): Promise<string> {
  const value = await p.text(input);
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    p.note("Value was empty. Nothing changed.", "Fork sync agent");
    process.exit(0);
  }
  return trimmed;
}

async function runForkSyncWizard(selected: KitListItem): Promise<void> {
  const existingRegistrations = listRegisteredKitForks().filter((registration) => registration.kitId === selected.id);
  let chosenForkId: string | null = null;

  if (existingRegistrations.length > 0) {
    const existingChoice = await p.select({
      message: "Select a registered fork or create a new one",
      options: [
        ...existingRegistrations.map((registration) => ({
          value: registration.id,
          label: pc.bold(registration.id),
          hint: truncate(registration.forkPath, 50),
        })),
        { value: "__new", label: "Register a new fork path", hint: "capture a baseline and branch strategy" },
        { value: "__view_jobs", label: "View latest sync jobs", hint: "see detached branch runs for this kit" },
        { value: "__back", label: "← Back to kit actions" },
      ],
    });

    if (p.isCancel(existingChoice) || existingChoice === "__back") return;
    if (existingChoice === "__view_jobs") {
      const relevantIds = new Set(existingRegistrations.map((registration) => registration.id));
      const jobs = listKitForkSyncJobs().filter((job) => relevantIds.has(job.forkId));
      printForkSyncJobs(jobs);
      return;
    }
    if (existingChoice !== "__new") {
      chosenForkId = existingChoice;
    }
  }

  if (!chosenForkId) {
    const forkPath = path.resolve(await promptRequiredText({
      message: `Path to your forked ${displayKitName(selected.name)} directory`,
      placeholder: "/absolute/path/to/your/git/repo/worker-kit",
    }));
    const forkId = await promptRequiredText({
      message: "Fork id used for registry + sync jobs",
      placeholder: "my-custom-kit",
      defaultValue: path.basename(forkPath),
    });
    const baseBranch = await promptRequiredText({
      message: "Base branch for detached sync worktrees",
      defaultValue: "main",
    });
    const branchPrefix = await promptRequiredText({
      message: "Sync branch prefix",
      defaultValue: "sync",
    });

    const registration = registerKitFork({
      forkId,
      kitId: selected.id,
      forkPath,
      baseBranch,
      branchPrefix,
    });
    chosenForkId = registration.registration.id;
    p.note(
      [
        `Fork: ${registration.registration.id}`,
        `Bundled source: ${registration.registration.kitId}@${registration.upstreamVersion}`,
        `Baseline snapshot: ${registration.baselinePath}`,
      ].join("\n"),
      "Fork sync registration saved",
    );
  }

  const plan = planKitForkSync(chosenForkId);
  printForkSyncPlan(plan);
  if (plan.dirtyWorkingTree) {
    p.note(
      `The fork path has uncommitted changes. Commit or stash ${plan.registration.repoRelativePath} before starting the background sync agent.`,
      "Fork sync blocked",
    );
    return;
  }

  const startConfirmed = await p.confirm({
    message: "Start the detached fork sync agent now?",
    initialValue: true,
  });
  if (p.isCancel(startConfirmed) || !startConfirmed) {
    p.note(
      `Plan captured for ${plan.registration.id}. Start later with growthub kit sync start ${plan.registration.id}.`,
      "Fork sync not started",
    );
    return;
  }

  const started = startKitForkSyncJob(chosenForkId);
  printForkSyncJobDetails(started.job);
}

// ---------------------------------------------------------------------------
// Interactive kit picker
// ---------------------------------------------------------------------------

export async function runInteractivePicker(opts: { out?: string; allowBackToHub?: boolean }): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Growthub Agent Worker Kits"));

  let kits: KitListItem[];
  try {
    kits = listBundledKits();
  } catch (err) {
    p.log.error("Failed to load kits: " + (err as Error).message);
    process.exit(1);
  }

  const familiesAvailable = [...new Set(kits.map((k) => k.family))].sort();
  const typeOptions = Array.from(new Set(familiesAvailable.map((family) => displayTypeForFamily(family))));

  while (true) {
    const typeChoice = await p.select({
      message: "Filter by type",
      options: [
        { value: "all", label: "All Types" },
        ...typeOptions.map((type) => {
          const cfg = TYPE_CONFIG[type];
          return {
            value: type,
            label: cfg ? cfg.emoji + "  " + cfg.label : String(type),
          };
        }),
        ...(opts.allowBackToHub ? [{ value: "__back_to_hub", label: "← Back to main menu" }] : []),
      ],
    });

    if (p.isCancel(typeChoice)) { p.cancel("Cancelled."); process.exit(0); }
    if (typeChoice === "__back_to_hub") return "back";

    const filtered = typeChoice === "all"
      ? kits
      : kits.filter((k) => displayTypeForFamily(k.family) === typeChoice);
    const showTypeBadgeInKitChoices = typeChoice === "all";

    if (filtered.length === 0) {
      p.note("No kits are available for that type yet.", "Nothing found");
      continue;
    }

    while (true) {
      const kitChoice = await p.select({
        message: "Select kit",
        options: [
          ...filtered.map((k) => ({
            value: k.id,
            label:
              (showTypeBadgeInKitChoices ? typeBadge(k.family) + "  " : "") +
              pc.bold(displayKitName(k.name)) +
              "  " +
              pc.dim("v" + k.version),
            hint: truncate(k.description, 55),
          })),
          { value: "__back_to_type", label: "← Back to type filter" },
        ],
      });

      if (p.isCancel(kitChoice)) { p.cancel("Cancelled."); process.exit(0); }
      if (kitChoice === "__back_to_type") break;

      const selected = filtered.find((kit) => kit.id === kitChoice);
      if (!selected) {
        p.cancel("Selected kit was not found.");
        process.exit(1);
      }

      printKitCard(selected);

      const nextStep = await p.select({
        message: "Next step",
        options: [
          { value: "actions", label: "Choose action(s)" },
          { value: "back_to_kits", label: "← Back to kit list" },
        ],
      });

      if (p.isCancel(nextStep)) { p.cancel("Cancelled."); process.exit(0); }
      if (nextStep === "back_to_kits") continue;

      while (true) {
        const action = await p.select({
          message: "What would you like to do?",
          options: [
            { value: "download", label: "⬇️  Download kit", hint: "growthub kit download <id>" },
            { value: "inspect", label: "🔍 Inspect manifest", hint: "growthub kit inspect <id>" },
            { value: "fork-sync", label: "🩺 Fork sync & self-heal", hint: "register a fork and launch a background sync branch" },
            { value: "copy-id", label: "📋 Print ID to stdout", hint: "echo <kit-id>" },
            { value: "back_to_kits", label: "← Back to kit list" },
          ],
        });

        if (p.isCancel(action)) { p.cancel("Cancelled."); process.exit(0); }
        if (action === "back_to_kits") break;

        const confirmed = await confirmKitActions({
          kits: [selected],
          actions: [action as string],
        });

        if (!confirmed) {
          const reviewChoice = await p.select({
            message: "Review selection",
            options: [
              { value: "actions", label: `Choose ${getActionLabel(action as string)} again` },
              { value: "back_to_kits", label: "← Back to kit list" },
            ],
          });

          if (p.isCancel(reviewChoice)) { p.cancel("Cancelled."); process.exit(0); }
          if (reviewChoice === "back_to_kits") break;
          continue;
        }

        if (action === "copy-id") {
          console.log(selected.id);
          p.outro(pc.dim("Kit ID printed above."));
          return "done";
        }

        if (action === "inspect") {
          runInspect(selected.id, opts.out);
          p.outro(pc.dim("Done."));
          return "done";
        }

        if (action === "fork-sync") {
          await runForkSyncWizard(selected);
          p.outro(pc.green("Fork sync agent flow completed."));
          return "done";
        }

        await runDownload(selected.id, opts);
        p.outro(pc.green("Kit exported successfully."));
        return "done";
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Download flow (spinner + preview + next-steps box)
// ---------------------------------------------------------------------------

async function runDownload(kitId: string, opts: { out?: string; yes?: boolean }): Promise<void> {
  const resolvedId = fuzzyResolveKitId(kitId);
  if (!resolvedId) {
    console.error(pc.red("Unknown kit '" + kitId + "'.") + pc.dim(" Run `growthub kit list` to browse."));
    process.exit(1);
  }
  if (resolvedId !== kitId) {
    console.log(pc.dim("Resolved '" + kitId + "' → " + resolvedId));
  }

  const kits = listBundledKits();
  const item = kits.find((k) => k.id === resolvedId)!;
  printKitCard(item);

  if (!opts.yes) {
    const confirmed = await p.confirm({ message: "Download " + pc.bold(displayKitName(item.name)) + "?" });
    if (p.isCancel(confirmed) || !confirmed) { p.cancel("Cancelled."); process.exit(0); }
  }

  const result = downloadBundledKit(resolvedId, opts.out, {
    onProgress: renderProgressBar,
  });

  console.log("");
  console.log(pc.green(pc.bold("Kit exported successfully.")));
  console.log("");

  const nextSteps = [
    pc.bold("Next steps"),
    "",
    pc.dim("1.") + " Point Working Directory at:",
    "   " + pc.cyan(result.folderPath),
    "",
    pc.dim("2.") + " " + pc.cyan("cp .env.example .env") + "  →  add your API key",
    pc.dim("3.") + " " + pc.cyan("bash setup/clone-fork.sh") + "  →  boot local studio",
    pc.dim("4.") + " Open Growthub local — the agent loads automatically",
    "",
    pc.dim("Docs: QUICKSTART.md · validation-checklist.md"),
  ];
  console.log("");
  console.log(box(nextSteps));
  console.log("");
  console.log(pc.bold("Open folder: ") + folderOpenLabel(result.folderPath));
  console.log(pc.dim("Folder: ") + result.folderPath);
  console.log("");
  console.log(pc.dim("Zip: ") + result.zipPath);
  console.log("");
}

// ---------------------------------------------------------------------------
// Inspect (pretty output)
// ---------------------------------------------------------------------------

function runInspect(kitId: string, outDir?: string): void {
  const info = inspectBundledKit(kitId, outDir);
  const kv = (label: string, value: string | number) =>
    console.log("  " + pc.bold(label.padEnd(24)) + " " + value);

  console.log("");
  console.log(pc.bold("Kit: " + info.id) + pc.dim("  v" + info.version));
  console.log(typeBadge(info.family) + pc.dim("  schema v" + info.schemaVersion));
  console.log(hr());
  kv("Name:", info.name);
  kv("Description:", truncate(info.description, 55));
  kv("Entrypoint:", info.entrypointPath);
  kv("Agent Contract:", info.agentContractPath);
  kv("Bundle:", info.bundleId + " @ " + info.bundleVersion);
  kv("Brief Type:", info.briefType);
  kv("Frozen Assets:", String(info.frozenAssetCount));
  kv("Required Assets:", String(info.requiredFrozenAssetCount));
  kv("Export Folder:", info.exportFolderPath);
  kv("Export Zip:", info.exportZipPath);
  if (Object.keys(info.compatibility).length > 0) {
    kv("Compatibility:", JSON.stringify(info.compatibility));
  }
  console.log(hr());
  console.log(pc.bold("  Required Paths:"));
  for (const rp of info.requiredPaths) console.log("    " + pc.dim("·") + " " + rp);
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerKitCommands(program: Command): void {
  const kit = program
    .command("kit")
    .description("Browse, inspect, and download Growthub Agent Worker Kits")
    .addHelpText("after", `
Examples:
  $ growthub kit                          # interactive browser
  $ growthub kit list                     # all kits grouped by type
  $ growthub kit list --family studio     # filter by family
  $ growthub kit list --json              # machine-readable output
  $ growthub kit download higgsfield      # fuzzy slug — resolves automatically
  $ growthub kit download growthub-open-higgsfield-studio-v1
  $ growthub kit inspect higgsfield-studio-v1
  $ growthub kit families                 # show family taxonomy
  $ growthub kit sync list                # registered fork sync targets
  $ growthub kit sync init --kit growthub-postiz-social-v1 --fork-path ./forks/postiz
`);

  // Default action — interactive picker
  kit.action(async () => {
    await runInteractivePicker({});
  });

  // ── list ────────────────────────────────────────────────────────────────
  kit
    .command("list")
    .description("List all available kits grouped by type")
    .option("--family <families>", "Filter by family (comma-separated: studio,workflow,operator,ops)")
    .option("--json", "Output raw JSON for scripting")
    .addHelpText("after", `
Examples:
  $ growthub kit list
  $ growthub kit list --family studio
  $ growthub kit list --family studio,operator
  $ growthub kit list --json
`)
    .action((opts: { family?: string; json?: boolean }) => {
      let kits = listBundledKits();

      if (opts.family) {
        const wanted = opts.family.split(",").map((f) => f.trim().toLowerCase());
        kits = kits.filter((k) => wanted.includes(k.family));
        if (kits.length === 0) {
          console.error(pc.yellow("No kits found for family: " + opts.family));
          console.error(pc.dim("Valid families: studio, workflow, operator, ops"));
          process.exitCode = 1;
          return;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(kits, null, 2));
        return;
      }

      printGroupedList(kits);
    });

  // ── inspect ───────────────────────────────────────────────────────────────
  kit
    .command("inspect")
    .description("Inspect a kit manifest (supports fuzzy slug)")
    .argument("<kit-id>", "Kit id or slug (e.g. 'higgsfield', 'studio-v1')")
    .option("--out <path>", "Override the export root for resolved paths")
    .option("--json", "Output raw JSON")
    .addHelpText("after", `
Examples:
  $ growthub kit inspect higgsfield-studio-v1
  $ growthub kit inspect growthub-email-marketing-v1 --json
`)
    .action((kitId: string, opts: { out?: string; json?: boolean }) => {
      const resolvedId = fuzzyResolveKitId(kitId);
      if (!resolvedId) {
        console.error(pc.red("Unknown kit '" + kitId + "'.") + pc.dim(" Run `growthub kit list` to browse."));
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(inspectBundledKit(resolvedId, opts.out), null, 2));
        return;
      }
      runInspect(resolvedId, opts.out);
    });

  // ── download ──────────────────────────────────────────────────────────────
  kit
    .command("download")
    .description("Download a kit — interactive if no kit-id given")
    .argument("[kit-id]", "Kit id or fuzzy slug (omit for interactive picker)")
    .option("--out <path>", "Output directory for the generated artifacts")
    .option("--yes", "Skip confirmation prompt")
    .addHelpText("after", `
Examples:
  $ growthub kit download                           # interactive
  $ growthub kit download higgsfield                # fuzzy slug
  $ growthub kit download growthub-open-higgsfield-studio-v1
  $ growthub kit download studio-v1 --out ~/kits
  $ growthub kit download studio-v1 --yes
`)
    .action(async (kitId: string | undefined, opts: { out?: string; yes?: boolean }) => {
      if (!kitId) {
        await runInteractivePicker(opts);
        return;
      }

      const resolvedId = fuzzyResolveKitId(kitId);
      if (!resolvedId) {
        console.error(pc.red("Unknown kit '" + kitId + "'.") + pc.dim(" Run `growthub kit list` to browse."));
        process.exitCode = 1;
        return;
      }

      if (opts.yes) {
        const result = downloadBundledKit(resolvedId, opts.out, {
          onProgress: renderProgressBar,
        });
        console.log("");
        console.log(pc.bold("Exported folder:"), pc.cyan(result.folderPath));
        console.log(pc.bold("Open folder:   "), folderOpenLabel(result.folderPath));
        console.log(pc.bold("Zip:           "), pc.dim(result.zipPath));
        console.log("");
        console.log(pc.bold("Next steps:"));
        console.log("  1. Point Working Directory at: " + pc.cyan(result.folderPath));
        console.log("  2. " + pc.cyan("cp .env.example .env") + "  →  add your API key");
        console.log("  3. " + pc.cyan("bash setup/clone-fork.sh") + "  →  boot local studio");
        console.log("  4. Open Growthub local — the agent loads automatically");
        console.log("");
        return;
      }

      await runDownload(resolvedId, opts);
    });

  // ── path ──────────────────────────────────────────────────────────────────
  kit
    .command("path")
    .description("Resolve the expected export folder path without exporting")
    .argument("<kit-id>", "Kit id or fuzzy slug")
    .option("--out <path>", "Override the export root")
    .action((kitId: string, opts: { out?: string }) => {
      const resolvedId = fuzzyResolveKitId(kitId);
      if (!resolvedId) {
        console.error(pc.red("Unknown kit '" + kitId + "'."));
        process.exitCode = 1;
        return;
      }
      console.log(resolveKitPath(resolvedId, opts.out));
    });

  // ── validate ──────────────────────────────────────────────────────────────
  kit
    .command("validate")
    .description("Validate a kit directory against the kit contract schema")
    .argument("<path>", "Path to the kit directory")
    .addHelpText("after", `
Examples:
  $ growthub kit validate ./my-kit
  $ growthub kit validate ~/kits/growthub-open-higgsfield-studio-v1
`)
    .action((kitPath: string) => {
      const resolvedPath = path.resolve(kitPath);
      const result = validateKitDirectory(resolvedPath);

      console.log("");
      console.log(pc.bold("Kit: " + result.kitId) + pc.dim("  schema v" + result.schemaVersion));
      console.log(hr());

      for (const w of result.warnings) {
        console.log(pc.yellow("  WARN  " + w.field + ": " + w.message));
      }
      for (const e of result.errors) {
        console.log(pc.red("  ERROR " + e.field + ": " + e.message));
      }

      if (result.errors.length > 0) {
        console.log("");
        console.log(pc.red(pc.bold("  Result: INVALID")) + pc.dim("  (" + result.errors.length + " error" + (result.errors.length !== 1 ? "s" : "") + ")"));
        process.exitCode = 1;
      } else {
        console.log(pc.green(pc.bold("  Result: VALID")));
      }
      console.log("");
    });

  // ── families ──────────────────────────────────────────────────────────────
  kit
    .command("families")
    .description("Show the kit family taxonomy with descriptions and examples")
    .action(() => {
      const defs = [
        { family: "studio",   tagline: "AI generation studio backed by a local fork",                      surfaces: "local-fork, browser-hosted, desktop-app", example: "growthub-open-higgsfield-studio-v1, growthub-postiz-social-v1, growthub-zernio-social-v1" },
        { family: "workflow", tagline: "Multi-step pipeline operator across tools or APIs",                surfaces: "browser-hosted (primary)",                example: "creative-strategist-v1" },
        { family: "operator", tagline: "Domain vertical specialist — one provider, structured deliverables", surfaces: "browser-hosted",                       example: "growthub-email-marketing-v1" },
        { family: "ops",      tagline: "Infrastructure / toolchain operator (provider optional)",          surfaces: "local-fork (primary)",                   example: "(coming soon)" },
      ];

      console.log("");
      console.log(pc.bold("Kit Family Taxonomy"));
      console.log(hr());

      for (const def of defs) {
        console.log("\n  " + typeBadge(def.family));
        console.log("  " + pc.dim(def.tagline));
        console.log("  " + pc.dim("Surfaces: ") + pc.dim(def.surfaces));
        console.log("  " + pc.dim("Example:  ") + pc.cyan(def.example));
      }

      console.log("");
      console.log(hr());
      console.log(pc.dim("  growthub kit list --family <family>  to filter by internal family"));
      console.log("");
    });

  const sync = kit
    .command("sync")
    .description("Register forked worker kits and run the background self-healing sync agent");

  sync
    .command("init")
    .description("Register a forked worker kit path and capture the current upstream baseline")
    .requiredOption("--kit <kit-id>", "Bundled worker kit id to track")
    .requiredOption("--fork-path <path>", "Local fork path inside your git repository")
    .option("--fork-id <id>", "Stable id for this registered fork (defaults to folder name)")
    .option("--base-branch <branch>", "Base branch for background sync worktrees")
    .option("--branch-prefix <prefix>", "Branch prefix used for sync branches", "sync")
    .option("--refresh-baseline", "Replace the saved upstream baseline snapshot", false)
    .option("--json", "Output raw JSON")
    .addHelpText("after", `
Examples:
  $ growthub kit sync init --kit growthub-postiz-social-v1 --fork-path ./forks/postiz
  $ growthub kit sync init --kit growthub-zernio-social-v1 --fork-path ./forks/zernio --fork-id my-zernio
`)
    .action((opts: {
      kit: string;
      forkPath: string;
      forkId?: string;
      baseBranch?: string;
      branchPrefix?: string;
      refreshBaseline?: boolean;
      json?: boolean;
    }) => {
      const result = registerKitFork({
        forkId: opts.forkId,
        kitId: opts.kit,
        forkPath: opts.forkPath,
        baseBranch: opts.baseBranch,
        branchPrefix: opts.branchPrefix,
        refreshBaseline: opts.refreshBaseline,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printForkRegistration(result.registration, result.baselinePath, result.upstreamVersion);
    });

  sync
    .command("list")
    .description("List registered worker kit forks")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean }) => {
      const registrations = listRegisteredKitForks();
      if (opts.json) {
        console.log(JSON.stringify(registrations, null, 2));
        return;
      }
      printForkRegistrations(registrations);
    });

  sync
    .command("plan")
    .description("Preview upstream drift and likely merge pressure for a registered fork")
    .argument("<fork-id>", "Registered fork id")
    .option("--json", "Output raw JSON")
    .action((forkId: string, opts: { json?: boolean }) => {
      const plan = planKitForkSync(forkId);
      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }
      printForkSyncPlan(plan);
    });

  sync
    .command("start")
    .description("Launch the detached fork sync/self-heal agent in the background")
    .argument("<fork-id>", "Registered fork id")
    .option("--json", "Output raw JSON")
    .action((forkId: string, opts: { json?: boolean }) => {
      const result = startKitForkSyncJob(forkId);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printStartedForkSyncJob(result.job);
    });

  sync
    .command("status")
    .description("Inspect the latest or a specific fork sync job")
    .argument("[fork-or-job-id]", "Registered fork id or explicit job id")
    .option("--job <job-id>", "Explicit job id")
    .option("--json", "Output raw JSON")
    .action((forkOrJobId: string | undefined, opts: { job?: string; json?: boolean }) => {
      const job = resolveRequestedJob(forkOrJobId, opts.job);
      if (!job) {
        console.error(pc.red("No fork sync job found for the requested target."));
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }
      printJobStatus(job);
    });

  sync
    .command("jobs")
    .description("List recent fork sync jobs")
    .option("--fork <fork-id>", "Filter by registered fork id")
    .option("--json", "Output raw JSON")
    .action((opts: { fork?: string; json?: boolean }) => {
      const jobs = listKitForkSyncJobs(opts.fork);
      if (opts.json) {
        console.log(JSON.stringify(jobs, null, 2));
        return;
      }
      printJobList(jobs);
    });

  sync
    .command("report")
    .description("Print report and skill artifact locations for a completed sync job")
    .argument("[fork-or-job-id]", "Registered fork id or explicit job id")
    .option("--job <job-id>", "Explicit job id")
    .option("--json", "Output raw JSON")
    .action((forkOrJobId: string | undefined, opts: { job?: string; json?: boolean }) => {
      const job = resolveRequestedJob(forkOrJobId, opts.job);
      if (!job) {
        console.error(pc.red("No fork sync job found for the requested target."));
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify({
          jobId: job.id,
          reportPath: job.reportPath,
          skillPath: job.skillPath,
          logPath: job.logPath,
          status: job.status,
        }, null, 2));
        return;
      }
      printJobArtifacts(job);
    });

  sync
    .command("__run-job")
    .argument("<job-id>", "Internal detached fork sync job id")
    .action(async (jobId: string) => {
      const job = await runPreparedKitForkSyncJob(jobId);
      if (job.status === "failed") {
        process.exitCode = 1;
      }
    });
}
