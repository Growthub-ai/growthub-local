/**
 * `growthub setup` — Guided first-run wizard.
 *
 * Asks the highest-value questions, then calls existing primitives:
 *   starter init    → workspace scaffold
 *   auth login      → optional Bridge connection
 *   kit health      → post-scaffold validation
 *   skills validate → SKILL.md check
 *
 * Self-improvement is presented as an optional feature extension on any
 * governed workspace — not a separate workspace type.
 *
 * Execution stays hosted. The wizard composes and governs locally only.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { track } from "../analytics/posthog.js";

// Standard kit IDs
const CUSTOM_WORKSPACE_KIT_ID = "growthub-custom-workspace-starter-v1";

type WizardWorkspaceType =
  | "custom-workspace"
  | "import-repo"
  | "import-skill";

function resolveCliPath(): string {
  return process.argv[1];
}

function runCliCommand(args: string[]): boolean {
  const result = spawnSync(process.execPath, [resolveCliPath(), ...args], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  return (result.status ?? 1) === 0;
}

async function runSetupWizard(opts: { profile?: string; out?: string }): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Growthub Setup Wizard") + pc.dim("  — < 5 minute governed workspace"));

  // Step 1: What do you want to build?
  // self-improving is NOT a separate type — it's a feature extension asked later
  let kitId = CUSTOM_WORKSPACE_KIT_ID;
  let workspaceType: WizardWorkspaceType = "custom-workspace";

  // If --profile self-improving was passed, route to custom workspace and enable
  // the self-improving extension automatically (no extra prompt)
  const autoSelfImproving = opts.profile === "self-improving";

  if (!opts.profile) {
    const choice = await p.select<WizardWorkspaceType>({
      message: "What are you building?",
      options: [
        {
          value: "custom-workspace",
          label: "Governed Workspace",
          hint: "blank governed workspace — works with any workflow",
        },
        {
          value: "import-repo",
          label: "Import a GitHub Repo",
          hint: "turn any GitHub repo into a governed workspace",
        },
        {
          value: "import-skill",
          label: "Import a Skill",
          hint: "turn a skills.sh skill into a governed workspace",
        },
      ],
    });

    if (p.isCancel(choice)) { p.cancel("Setup cancelled."); process.exit(0); }
    workspaceType = choice;

    kitId = {
      "custom-workspace": CUSTOM_WORKSPACE_KIT_ID,
      "import-repo": CUSTOM_WORKSPACE_KIT_ID,
      "import-skill": CUSTOM_WORKSPACE_KIT_ID,
    }[workspaceType];
  } else {
    // --profile workspace / self-improving / import-* passed explicitly.
    workspaceType = (opts.profile as WizardWorkspaceType) ?? "custom-workspace";
    kitId = {
      "custom-workspace": CUSTOM_WORKSPACE_KIT_ID,
    }[workspaceType as string] ?? CUSTOM_WORKSPACE_KIT_ID;
  }

  // Step 2: Output path
  const defaultOut = opts.out ?? `./my-workspace`;
  const outRaw = opts.out ?? await p.text({
      message: "Workspace output path:",
      placeholder: defaultOut,
      defaultValue: defaultOut,
    });
  if (p.isCancel(outRaw)) { p.cancel("Setup cancelled."); process.exit(0); }
  const outPath = path.resolve(process.cwd(), String(outRaw) || defaultOut);

  // Step 3: Enable self-improving feature? (optional extension, not a separate kit)
  let enableSelfImproving = autoSelfImproving;
  if (!autoSelfImproving && !opts.out) {
    const siChoice = await p.confirm({
      message: "Enable self-improving workspace? (proposes reusable capabilities after each run)",
      initialValue: false,
    });
    if (p.isCancel(siChoice)) { p.cancel("Setup cancelled."); process.exit(0); }
    enableSelfImproving = Boolean(siChoice);
  }

  // Step 4: Connect Growthub Bridge?
  const connectBridge = opts.out
    ? false
    : await p.confirm({
      message: "Connect to hosted Growthub Bridge? (optional — for hosted agent binding)",
      initialValue: false,
    });
  if (p.isCancel(connectBridge)) { p.cancel("Setup cancelled."); process.exit(0); }

  track("setup_wizard_started", { profile: workspaceType, selfImproving: String(enableSelfImproving) });

  // ── Scaffold ───────────────────────────────────────────────────────────────

  p.log.step(`Scaffolding ${pc.cyan(workspaceType)} workspace at ${pc.cyan(outPath)} …`);

  let scaffoldOk = false;
  if (workspaceType === "import-repo") {
    const repoRef = await p.text({ message: "GitHub repo (owner/repo):", placeholder: "octocat/hello-world" });
    if (p.isCancel(repoRef) || !repoRef) { p.cancel("Setup cancelled."); process.exit(0); }
    scaffoldOk = runCliCommand(["starter", "import-repo", String(repoRef), "--out", outPath]);
  } else if (workspaceType === "import-skill") {
    const skillRef = await p.text({ message: "Skill reference (owner/repo/skill):", placeholder: "anthropics/skills/frontend-design" });
    if (p.isCancel(skillRef) || !skillRef) { p.cancel("Setup cancelled."); process.exit(0); }
    scaffoldOk = runCliCommand(["starter", "import-skill", String(skillRef), "--out", outPath]);
  } else {
    scaffoldOk = runCliCommand(["starter", "init", "--kit", kitId, "--out", outPath]);
  }

  if (!scaffoldOk) {
    p.log.warn("Scaffold step exited with an error — continuing with remaining steps.");
  }

  // ── Optional Bridge login ──────────────────────────────────────────────────
  if (connectBridge) {
    p.log.step("Connecting to Growthub Bridge …");
    runCliCommand(["auth", "login"]);
  }

  // ── Health check ──────────────────────────────────────────────────────────
  p.log.step("Running health check …");
  runCliCommand(["kit", "health", outPath]);

  track("setup_wizard_completed", {
    profile: workspaceType,
    scaffoldOk: String(scaffoldOk),
    selfImproving: String(enableSelfImproving),
  });

  const relPath = path.relative(process.cwd(), outPath) || ".";
  const siSteps = enableSelfImproving
    ? `\n  ${pc.dim("5.")} ${pc.cyan(`cd ${relPath} && growthub workspace improve propose --from-run demo`)}  →  first capability`
    : "";

  p.outro(
    pc.bold("Setup complete.") + "\n\n" +
    "  Next steps:\n" +
    `  ${pc.dim("1.")} ${pc.cyan(`cd ${relPath}`)}\n` +
    `  ${pc.dim("2.")} ${pc.cyan("cp .env.example .env")}  →  add your API key\n` +
    `  ${pc.dim("3.")} ${pc.cyan("growthub kit fork register .")}  →  register fork\n` +
    `  ${pc.dim("4.")} ${pc.cyan("growthub skills validate")}  →  verify SKILL.md` +
    siSteps + "\n\n" +
    `  ${pc.dim("Docs:")} QUICKSTART.md · growthub kit health ${relPath}`,
  );
}

export function registerSetupCommands(program: Command): void {
  const setup = program
    .command("setup")
    .description("Guided first-run setup wizard and workspace health utilities");

  setup
    .command("wizard")
    .description("Interactive < 5-minute setup wizard — scaffold, optionally connect Bridge, run health check")
    .option("--profile <type>", "Skip profile selection: custom-workspace | self-improving | import-repo | import-skill")
    .option("--out <path>", "Output path for the scaffolded workspace")
    .addHelpText("after", `
Examples:
  $ growthub setup wizard
  $ growthub setup wizard --profile custom-workspace --out ./my-workspace
  $ growthub setup wizard --profile self-improving --out ./my-workspace
`)
    .action(async (opts: { profile?: string; out?: string }) => {
      await runSetupWizard(opts);
    });
}
