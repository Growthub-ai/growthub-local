#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as p from "../cli/node_modules/@clack/prompts/dist/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cliDistPath = path.join(repoRoot, "cli", "dist", "index.js");
const cliSourceEntrypointPath = path.join(repoRoot, "cli", "src", "index.ts");
const tsxLoaderPath = path.join(repoRoot, "node_modules", ".pnpm", "tsx@4.21.0", "node_modules", "tsx", "dist", "loader.mjs");
const cliPackageJsonPath = path.join(repoRoot, "cli", "package.json");
const createPackageJsonPath = path.join(repoRoot, "packages", "create-growthub-local", "package.json");
const createEntrypointPath = path.join(repoRoot, "packages", "create-growthub-local", "bin", "create-growthub-local.mjs");
const templatesRoot = path.join(repoRoot, "cli", "assets", "shared-templates");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveDemoHome() {
  const explicitHome = process.env.CLI_DEMO_HOME?.trim();
  if (explicitHome) return path.resolve(explicitHome);
  return path.join(os.tmpdir(), "growthub-cli-demo");
}

function resolvePreviewDataDir() {
  return path.join(resolveDemoHome(), "preview-instance");
}

function getPreviewVersions() {
  const cliPkg = readJson(cliPackageJsonPath);
  const createPkg = readJson(createPackageJsonPath);
  return {
    cliVersion: cliPkg.version,
    createVersion: createPkg.version,
    installerPin: createPkg.dependencies?.["@growthub/cli"] ?? null,
  };
}

function currentBranchName() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return "unknown";
  return result.stdout.trim() || "unknown";
}

function getBaseEnv() {
  return {
    ...process.env,
    PAPERCLIP_HOME: resolveDemoHome(),
  };
}

function printHelp() {
  console.log(`Usage:
  zsh /Users/antonio/growthub-local/scripts/demo-cli.sh interactive
  zsh /Users/antonio/growthub-local/scripts/demo-cli.sh installer --profile gtm
  zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli
  zsh /Users/antonio/growthub-local/scripts/demo-cli.sh env

Modes:
  interactive  Top-level preview menu for this branch
  installer    Real installer/onboarding preview using local branch CLI dist
  cli          Real branch CLI interactive hub
  env          Show preview environment metadata`);
}

function printEnv() {
  const versions = getPreviewVersions();
  console.log(JSON.stringify({
    repoRoot,
    cliDistPath,
    createEntrypointPath,
    demoHome: resolveDemoHome(),
    previewDataDir: resolvePreviewDataDir(),
    branch: currentBranchName(),
    ...versions,
  }, null, 2));
}

function spawnNode(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...getBaseEnv(),
      ...extraEnv,
    },
  });

  process.exit(result.status ?? 1);
}

function runInstaller(args) {
  let profile = "gtm";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--profile" && args[index + 1]) {
      profile = args[index + 1];
      break;
    }
  }

  spawnNode(
    [
      createEntrypointPath,
      "--profile",
      profile,
      "--data-dir",
      resolvePreviewDataDir(),
      ...args.filter((arg, index) => !(arg === "--profile" || args[index - 1] === "--profile")),
    ],
    {
      GROWTHUB_LOCAL_CLI_ENTRYPOINT: cliDistPath,
    },
  );
}

function runCli(args) {
  spawnNode([
    "--import",
    tsxLoaderPath,
    cliSourceEntrypointPath,
    ...args,
  ]);
}

function runHostedBridgePreview() {
  spawnNode([cliDistPath, "auth", "--help"]);
}

function runSourceKitPicker() {
  spawnNode([
    "--import",
    "./node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/loader.mjs",
    "-e",
    "import('./cli/src/commands/kit.ts').then(async m => { await m.runInteractivePicker({}); })",
  ]);
}

function readTemplatesManifest() {
  return readJson(path.join(templatesRoot, "manifest.json"));
}

async function runTemplatePreview() {
  const manifest = readTemplatesManifest();
  const familyChoices = [...new Set(manifest.templates.map((template) => template.family))];

  const familyChoice = await p.select({
    message: "What template type do you want to browse?",
    options: familyChoices.map((family) => {
      if (family === "video-creative") {
        return {
          value: family,
          label: "🎬 Video Ads",
          hint: "Ad formats and reusable creative modules",
        };
      }
      return {
        value: family,
        label: family,
        hint: `${family} templates`,
      };
    }),
  });

  if (p.isCancel(familyChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const familyTemplates = manifest.templates.filter((template) => template.family === familyChoice);
  const groupChoices = [
    {
      value: "ad-format",
      label: "🎬 Ad Formats",
      count: familyTemplates.filter((template) => template.type === "ad-format").length,
    },
    {
      value: "scene-module/hook",
      label: "🪝 Hook Modules",
      count: familyTemplates.filter((template) => template.type === "scene-module" && template.subtype === "hook").length,
    },
    {
      value: "scene-module/body",
      label: "🧩 Body Modules",
      count: familyTemplates.filter((template) => template.type === "scene-module" && template.subtype === "body").length,
    },
    {
      value: "scene-module/cta",
      label: "🎯 CTA Modules",
      count: familyTemplates.filter((template) => template.type === "scene-module" && template.subtype === "cta").length,
    },
  ].filter((entry) => entry.count > 0);

  const groupChoice = await p.select({
    message: "What kind of template?",
    options: groupChoices.map((entry) => ({
      value: entry.value,
      label: entry.label,
      hint: `${entry.count} available`,
    })),
  });

  if (p.isCancel(groupChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const filteredTemplates = familyTemplates.filter((template) => {
    if (groupChoice === "ad-format") return template.type === "ad-format";
    const [, subtype] = groupChoice.split("/");
    return template.type === "scene-module" && template.subtype === subtype;
  });

  const templateChoice = await p.select({
    message: "Select a template",
    options: filteredTemplates.map((template) => ({
      value: template.slug,
      label: template.slug,
      hint: template.path,
    })),
  });

  if (p.isCancel(templateChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const selected = filteredTemplates.find((template) => template.slug === templateChoice);
  if (!selected) {
    process.exit(1);
  }

  const actionChoice = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "print", label: "📄 Print to terminal" },
      { value: "slug", label: "📋 Print slug" },
    ],
  });

  if (p.isCancel(actionChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (actionChoice === "slug") {
    console.log(selected.slug);
    process.exit(0);
  }

  const content = fs.readFileSync(path.join(templatesRoot, selected.path), "utf8");
  console.log(content);
  process.exit(0);
}

async function runInteractive() {
  const versions = getPreviewVersions();
  p.intro(`Growthub CLI Preview  cli@${versions.cliVersion}  installer@${versions.createVersion}`);

  const choice = await p.select({
    message: "What do you want to preview?",
    options: [
      {
        value: "installer",
        label: "🛠️ Install + Onboard Preview",
        hint: "Real create-growthub-local flow using this branch CLI build",
      },
      {
        value: "cli",
        label: "🧰 CLI Discovery Preview",
        hint: "Top-level kits/templates choice from this branch UX",
      },
      {
        value: "hosted-auth",
        label: "🔐 Hosted Auth Bridge Preview",
        hint: "Validate auth/profile commands in the branch CLI surface",
      },
      {
        value: "kit-picker",
        label: "📦 Custom Workspace Download",
        hint: "Browse and download worker kits — geo-seo-v1, higgsfield-studio-v1, and more",
      },
      {
        value: "qwen-code",
        label: "🤖 Qwen Code CLI Preview",
        hint: "Validate Qwen Code CLI integration — health, prompt, session",
      },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (choice === "installer") {
    const profile = await p.select({
      message: "Which install profile?",
      options: [
        { value: "gtm", label: "📈 GTM", hint: "Go-to-Market surface" },
        { value: "dx", label: "🧠 DX", hint: "Developer Experience surface" },
      ],
    });

    if (p.isCancel(profile)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    runInstaller(["--profile", profile]);
  }

  if (choice === "hosted-auth") {
    runHostedBridgePreview();
  }

  if (choice === "kit-picker") {
    runSourceKitPicker();
  }

  if (choice === "qwen-code") {
    runCli(["qwen-code"]);
  }

  runCli([]);
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

if (command === "env") {
  printEnv();
  process.exit(0);
}

if (command === "interactive") {
  await runInteractive();
  process.exit(0);
}

if (command === "installer") {
  runInstaller(rest);
}

if (command === "cli") {
  if (rest.length > 0) {
    runCli(rest);
  }
  runCli([]);
  process.exit(0);
}

if (command === "template") {
  await runTemplatePreview();
  process.exit(0);
}

console.error(`Unknown command '${command}'`);
printHelp();
process.exit(1);
