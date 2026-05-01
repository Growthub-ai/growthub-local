/**
 * `growthub kit publish` — Community Kit Publishing CLI surface.
 *
 * Local-first: no hosted Growthub required to validate or pack metadata.
 *
 *   growthub kit publish validate <path> [--json]
 *   growthub kit publish pack <path> [--out <dir>] [--json]
 *   growthub kit publish metadata <path> [--json]
 *
 * The metadata artifact can be submitted to awesome-growthub-kits or shared
 * directly. It follows the KIT_PUBLISH_CONTRACT_V1.md schema.
 */

import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import { track } from "../analytics/posthog.js";
import { buildPublishMetadata } from "../runtime/kit-publish/metadata.js";
import { packKit } from "../runtime/kit-publish/pack.js";

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function kv(label: string, value: string): void {
  console.log(`  ${pc.bold(label.padEnd(28))} ${value}`);
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

function runPublishValidate(kitPath: string, opts: { json?: boolean }): void {
  const kitRoot = path.resolve(kitPath);

  let result: ReturnType<typeof buildPublishMetadata>;
  try {
    result = buildPublishMetadata({ kitRoot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  track("kit_publish_validate", { kitId: result.metadata.kitId, valid: String(result.valid) });

  if (opts.json) {
    console.log(JSON.stringify(
      {
        status: result.valid ? "valid" : "invalid",
        kitId: result.metadata.kitId,
        validation: result.metadata.validation,
        metadata: result.metadata,
      },
      null,
      2,
    ));
    if (!result.valid) process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(pc.bold(`Kit: ${result.metadata.kitId}`) + pc.dim(`  v${result.metadata.kitVersion}`));
  console.log(hr());
  kv("Name:", result.metadata.name);
  kv("Family:", result.metadata.family);
  kv("Categories:", result.metadata.categories.join(", "));
  kv("Requires Bridge:", String(result.metadata.requiresBridge));
  kv("Fork Sync:", String(result.metadata.supportsForkSync));
  kv("License:", result.metadata.license);
  if (result.metadata.repository) kv("Repository:", result.metadata.repository);

  console.log("");

  const { errors, warnings } = result.metadata.validation;
  for (const e of errors) console.log(pc.red(`  ERROR   ${e}`));
  for (const w of warnings) console.log(pc.yellow(`  WARN    ${w}`));

  if (errors.length === 0 && warnings.length === 0) {
    console.log(pc.green("  Result: VALID — ready to publish"));
  } else if (errors.length === 0) {
    console.log(pc.yellow(`  Result: VALID with ${warnings.length} warning(s)`));
  } else {
    console.log(pc.red(`  Result: INVALID — ${errors.length} error(s)`));
    process.exitCode = 1;
  }

  console.log("");
  console.log(pc.dim(`  Next: growthub kit publish pack ${kitPath}`));
  console.log(pc.dim(`  Docs: docs/KIT_PUBLISH_CONTRACT_V1.md`));
  console.log("");
}

// ---------------------------------------------------------------------------
// pack
// ---------------------------------------------------------------------------

function runPublishPack(
  kitPath: string,
  opts: { out?: string; repository?: string; json?: boolean },
): void {
  const kitRoot = path.resolve(kitPath);
  const outDir = opts.out ? path.resolve(opts.out) : kitRoot;

  let result: ReturnType<typeof packKit>;
  try {
    result = packKit({ kitRoot, outDir, repositoryOverride: opts.repository });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  track("kit_publish_pack", { kitId: result.metadata.kitId });

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", metadataPath: result.metadataPath, metadata: result.metadata }, null, 2));
    return;
  }

  console.log("");
  console.log(pc.green(pc.bold("Publish metadata packed.")));
  console.log(`  ${pc.bold("File:")}   ${result.metadataPath}`);
  console.log(`  ${pc.bold("Kit ID:")} ${result.metadata.kitId}`);
  console.log(`  ${pc.bold("Valid:")}  ${result.valid ? pc.green("yes") : pc.yellow("partial (warnings)")}`);
  console.log("");
  console.log(pc.dim("  Submit to awesome-growthub-kits or share the metadata file directly."));
  console.log(pc.dim("  awesome-growthub-kits: https://github.com/Growthub-ai/awesome-growthub-kits"));
  console.log("");
}

// ---------------------------------------------------------------------------
// metadata (print only — no file written)
// ---------------------------------------------------------------------------

function runPublishMetadata(kitPath: string, opts: { json?: boolean }): void {
  const kitRoot = path.resolve(kitPath);

  let result: ReturnType<typeof buildPublishMetadata>;
  try {
    result = buildPublishMetadata({ kitRoot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(result.metadata, null, 2));
    return;
  }

  console.log(JSON.stringify(result.metadata, null, 2));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerKitPublishCommands(kitCommand: Command): void {
  const publish = kitCommand
    .command("publish")
    .description("Validate and pack a kit for community publishing (local-first, no hosted Growthub required)")
    .addHelpText("after", `
Examples:
  $ growthub kit publish validate ./my-kit
  $ growthub kit publish validate ./my-kit --json
  $ growthub kit publish pack ./my-kit --out ./dist
  $ growthub kit publish metadata ./my-kit --json

Contract: docs/KIT_PUBLISH_CONTRACT_V1.md
Registry: https://github.com/Growthub-ai/awesome-growthub-kits
`);

  publish
    .command("validate")
    .description("Validate a kit directory for community publishing readiness")
    .argument("<path>", "Path to the kit directory")
    .option("--json", "Emit machine-readable JSON")
    .action((kitPath: string, opts: { json?: boolean }) => {
      runPublishValidate(kitPath, opts);
    });

  publish
    .command("pack")
    .description("Pack kit publish metadata into a shareable JSON artifact")
    .argument("<path>", "Path to the kit directory")
    .option("--out <dir>", "Output directory for the metadata artifact (default: kit root)")
    .option("--repository <url>", "Override repository URL in metadata")
    .option("--json", "Emit machine-readable JSON")
    .action((kitPath: string, opts: { out?: string; repository?: string; json?: boolean }) => {
      runPublishPack(kitPath, opts);
    });

  publish
    .command("metadata")
    .description("Print publish metadata for a kit (stdout only — no file written)")
    .argument("<path>", "Path to the kit directory")
    .option("--json", "Emit machine-readable JSON (default: formatted JSON)")
    .action((kitPath: string, opts: { json?: boolean }) => {
      runPublishMetadata(kitPath, opts);
    });
}
