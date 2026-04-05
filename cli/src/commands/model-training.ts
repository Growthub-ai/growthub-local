import type { Command } from "commander";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pc from "picocolors";
import { resolveGrowthubRepoRoot } from "../utils/repo-root.js";
import { agentReasonCommand } from "./agent-reason.js";

const PKG_TRAIN = "growthub_model_training";

function pythonSrcRoot(repoRoot: string): string {
  return path.join(repoRoot, "packages", "model-training", "src");
}

function tailArgsAfterSubcommand(subcommand: string): string[] {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(subcommand);
  if (idx < 0) return [];
  return argv.slice(idx + 1);
}

/** Drop flags already handled by Commander so Python does not see duplicates. */
function filterConsumedPassthrough(raw: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "--dry-run") continue;
    if (a === "--root" || a === "-r") {
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function spawnPythonModule(repoRoot: string, moduleArgs: string[], extraEnv: NodeJS.ProcessEnv = {}): number {
  const pySrc = pythonSrcRoot(repoRoot);
  const env = {
    ...process.env,
    PYTHONPATH: [pySrc, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    GROWTHUB_REPO_ROOT: repoRoot,
    ...extraEnv,
  };
  const py = process.env.GROWTHUB_PYTHON?.trim() || "python3";
  const result = spawnSync(py, ["-m", PKG_TRAIN, ...moduleArgs], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.error) {
    console.error(pc.red(String(result.error.message)));
    console.error(pc.dim(`Hint: set GROWTHUB_PYTHON or install Python 3; PYTHONPATH includes ${pySrc}`));
    return 1;
  }
  return result.status ?? 1;
}

type ModelGlobalOpts = { root?: string; dryRun?: boolean };

function repoRootFromOpts(opts: ModelGlobalOpts): string {
  return opts.root?.trim() ? path.resolve(opts.root) : resolveGrowthubRepoRoot();
}

function registerPythonStage(program: Command, name: string, description: string, pythonSub: string) {
  program
    .command(name)
    .description(description)
    .option("-r, --root <path>", "Repository root (default: git toplevel or GH_LOCAL_ROOT)")
    .option("--dry-run", "Validate paths and manifests only", false)
    .allowUnknownOption(true)
    .action((opts: ModelGlobalOpts) => {
      const root = repoRootFromOpts(opts);
      const passthrough = filterConsumedPassthrough(tailArgsAfterSubcommand(name));
      const flag = opts.dryRun ? ["--dry-run"] : [];
      const code = spawnPythonModule(root, [pythonSub, ...flag, ...passthrough]);
      process.exit(code);
    });
}

export function registerModelTrainingCommands(program: Command): void {
  registerPythonStage(
    program,
    "model:bootstrap",
    "Cache Gemma 4 (or other) base weights under .growthub/models and write manifest",
    "bootstrap",
  );
  registerPythonStage(
    program,
    "model:train",
    "Supervised fine-tuning stage (Unsloth integration point)",
    "train",
  );
  registerPythonStage(program, "model:eval", "Evaluate current adapter / merged checkpoint", "eval");
  registerPythonStage(
    program,
    "model:distill",
    "Teacher–student distillation stage (distilabel integration point)",
    "distill",
  );
  registerPythonStage(program, "model:merge", "Merge adapter into base weights", "merge");
  registerPythonStage(program, "model:quantize", "Export GGUF / AWQ (tool-specific)", "quantize");
  registerPythonStage(program, "model:deploy", "Print vLLM (or other) serve command from manifest", "deploy");

  registerPythonStage(
    program,
    "rl:preference",
    "Preference optimization (DPO / SimPO / ORPO — tool-specific)",
    "preference",
  );
  registerPythonStage(
    program,
    "rl:grpo",
    "GRPO with verifiable rewards (verl; reward = subprocess contract)",
    "grpo",
  );

  program
    .command("agent:reason")
    .description(
      "Run one local reasoning turn against an OpenAI-compatible HTTP API (e.g. vLLM); set GROWTHUB_MODEL_BASE_URL",
    )
    .argument("[prompt...]", "Prompt text")
    .option("-r, --root <path>", "Repository root (manifest / docs context)")
    .option("-c, --config <path>", "Paperclip config path (default: default instance config.json)")
    .action(async (promptWords: string[], opts: { root?: string; config?: string }) => {
      const words = Array.isArray(promptWords) ? promptWords : [];
      const prompt = words.join(" ").trim();
      await agentReasonCommand({ ...opts, prompt });
    });
}
