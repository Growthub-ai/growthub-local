import { Command } from "commander";
import pc from "picocolors";
import {
  downloadBundledKit,
  inspectBundledKit,
  listBundledKits,
  resolveKitPath,
} from "../kits/service.js";

function printKeyValue(label: string, value: string | number): void {
  console.log(`${pc.bold(label)} ${value}`);
}

export function registerKitCommands(program: Command): void {
  const kit = program.command("kit").description("Bundled Growthub Agent Worker Kit export utilities");

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
            `version=${item.version}`,
            `bundle=${item.bundleId}@${item.bundleVersion}`,
            `briefType=${item.briefType}`,
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
    });

  kit
    .command("path")
    .description("Resolve the expected expanded export folder path without exporting")
    .argument("<kit-id>", "Bundled worker kit id")
    .option("--out <path>", "Output directory for the generated artifacts")
    .action((kitId: string, opts: { out?: string }) => {
      console.log(resolveKitPath(kitId, opts.out));
    });
}

