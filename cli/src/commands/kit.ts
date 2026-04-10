import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import {
  downloadBundledKit,
  inspectBundledKit,
  listBundledKits,
  resolveKitPath,
  validateKitDirectory,
} from "../kits/service.js";

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
}
