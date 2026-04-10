import path from "node:path";
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
} from "../kits/service.js";

// ---------------------------------------------------------------------------
// Family display config — color + emoji per family
// ---------------------------------------------------------------------------

const FAMILY_CONFIG: Record<string, { color: (s: string) => string; emoji: string; label: string }> = {
  studio:   { color: pc.cyan,    emoji: "🎬", label: "Studio" },
  workflow: { color: pc.magenta, emoji: "🔄", label: "Workflow" },
  operator: { color: pc.green,   emoji: "🤖", label: "Operator" },
  ops:      { color: pc.yellow,  emoji: "⚙️ ", label: "Ops" },
};

function familyColor(family: string, text: string): string {
  return FAMILY_CONFIG[family]?.color(text) ?? text;
}

function familyBadge(family: string): string {
  const cfg = FAMILY_CONFIG[family];
  if (!cfg) return family;
  return cfg.color(`${cfg.emoji} ${cfg.label}`);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
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

// ---------------------------------------------------------------------------
// Kit preview card
// ---------------------------------------------------------------------------

function printKitCard(item: KitListItem): void {
  const badge = familyBadge(item.family);
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

// ---------------------------------------------------------------------------
// Grouped list renderer
// ---------------------------------------------------------------------------

function printGroupedList(kits: KitListItem[]): void {
  const byFamily: Record<string, KitListItem[]> = {};
  for (const kit of kits) {
    (byFamily[kit.family] ??= []).push(kit);
  }

  const families = Object.keys(byFamily).sort();
  const totalFamilies = families.length;

  console.log("");
  console.log(
    pc.bold("Growthub Agent Worker Kits") +
    pc.dim(`  ${kits.length} kit${kits.length !== 1 ? "s" : ""} · ${totalFamilies} famil${totalFamilies !== 1 ? "ies" : "y"}`),
  );
  console.log(hr());

  for (const family of families) {
    const groupKits = byFamily[family];
    const header = familyBadge(family);

    console.log(`\n${header}  ${pc.dim("(" + groupKits.length + ")")}`);

    for (const kit of groupKits) {
      console.log(`  ${familyColor(family, pc.bold(kit.id))}  ${pc.dim("v" + kit.version)}`);
      console.log(`  ${pc.dim(truncate(kit.description, 62))}`);
      console.log(`  ${pc.dim("→")} ${pc.cyan("growthub kit download " + kit.id)}`);
      console.log("");
    }
  }

  console.log(hr());
  console.log(pc.dim("  growthub kit download <id>  ·  growthub kit inspect <id>  ·  growthub kit families"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Interactive kit picker
// ---------------------------------------------------------------------------

async function runInteractivePicker(opts: { out?: string }): Promise<void> {
  p.intro(pc.bold("Growthub Agent Worker Kits"));

  let kits: KitListItem[];
  try {
    kits = listBundledKits();
  } catch (err) {
    p.log.error("Failed to load kits: " + (err as Error).message);
    process.exit(1);
  }

  const familiesAvailable = [...new Set(kits.map((k) => k.family))].sort();
  const familyChoice = await p.select({
    message: "Filter by family (or show all)",
    options: [
      { value: "all", label: "All families" },
      ...familiesAvailable.map((f) => {
        const cfg = FAMILY_CONFIG[f];
        return { value: f, label: cfg ? cfg.emoji + "  " + cfg.label : f };
      }),
    ],
  });

  if (p.isCancel(familyChoice)) { p.cancel("Cancelled."); process.exit(0); }

  const filtered = familyChoice === "all" ? kits : kits.filter((k) => k.family === familyChoice);

  const kitChoice = await p.select({
    message: "Select a kit",
    options: filtered.map((k) => ({
      value: k.id,
      label: familyBadge(k.family) + "  " + pc.bold(k.name) + "  " + pc.dim("v" + k.version),
      hint: truncate(k.description, 55),
    })),
  });

  if (p.isCancel(kitChoice)) { p.cancel("Cancelled."); process.exit(0); }

  const selected = kits.find((k) => k.id === kitChoice)!;
  printKitCard(selected);

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "download", label: "⬇️  Download kit" },
      { value: "inspect",  label: "🔍 Inspect manifest" },
      { value: "copy-id",  label: "📋 Print ID to stdout" },
      { value: "cancel",   label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") { p.cancel("Cancelled."); process.exit(0); }
  if (action === "copy-id") { console.log(selected.id); p.outro(pc.dim("Kit ID printed above.")); return; }
  if (action === "inspect") { runInspect(selected.id, opts.out); return; }
  if (action === "download") { await runDownload(selected.id, opts); }
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
    const confirmed = await p.confirm({ message: "Download " + pc.bold(item.name) + "?" });
    if (p.isCancel(confirmed) || !confirmed) { p.cancel("Cancelled."); process.exit(0); }
  }

  const s = p.spinner();
  s.start("Exporting kit…");
  const result = downloadBundledKit(resolvedId, opts.out);
  s.stop("Kit exported");

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
  console.log(familyBadge(info.family) + pc.dim("  schema v" + info.schemaVersion));
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
  $ growthub kit list                     # all kits grouped by family
  $ growthub kit list --family studio     # filter by family
  $ growthub kit list --json              # machine-readable output
  $ growthub kit download higgsfield      # fuzzy slug — resolves automatically
  $ growthub kit download growthub-open-higgsfield-studio-v1
  $ growthub kit inspect higgsfield-studio-v1
  $ growthub kit families                 # show family taxonomy
`);

  // Default action — interactive picker
  kit.action(async () => {
    await runInteractivePicker({});
  });

  // ── list ────────────────────────────────────────────────────────────────
  kit
    .command("list")
    .description("List all available kits grouped by family")
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
        const s = p.spinner();
        s.start("Exporting " + resolvedId + "…");
        const result = downloadBundledKit(resolvedId, opts.out);
        s.stop("Kit exported");
        console.log("");
        console.log(pc.bold("Exported folder:"), pc.cyan(result.folderPath));
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
        { family: "studio",   tagline: "AI generation studio backed by a local fork",                      surfaces: "local-fork, browser-hosted, desktop-app", example: "growthub-open-higgsfield-studio-v1" },
        { family: "workflow", tagline: "Multi-step pipeline operator across tools or APIs",                surfaces: "browser-hosted (primary)",                example: "creative-strategist-v1" },
        { family: "operator", tagline: "Domain vertical specialist — one provider, structured deliverables", surfaces: "browser-hosted",                       example: "growthub-email-marketing-v1" },
        { family: "ops",      tagline: "Infrastructure / toolchain operator (provider optional)",          surfaces: "local-fork (primary)",                   example: "(coming soon)" },
      ];

      console.log("");
      console.log(pc.bold("Kit Family Taxonomy"));
      console.log(hr());

      for (const def of defs) {
        console.log("\n  " + familyBadge(def.family));
        console.log("  " + pc.dim(def.tagline));
        console.log("  " + pc.dim("Surfaces: ") + pc.dim(def.surfaces));
        console.log("  " + pc.dim("Example:  ") + pc.cyan(def.example));
      }

      console.log("");
      console.log(hr());
      console.log(pc.dim("  growthub kit list --family <family>  to filter kits by family"));
      console.log("");
    });
}
