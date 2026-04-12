/**
 * cli/src/commands/template.ts
 *
 * growthub template — shared creative artifact library.
 *
 * UX: always filtered, never a flat list.
 *   - No args → two-step interactive picker (group → artifact → action)
 *   - list    → grouped summary with counts
 *   - get     → fuzzy slug resolution → print or copy
 *
 * Imports only from ../templates/index.js — zero coupling to kits.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import {
  listArtifacts, getArtifact, copyArtifact,
  groupArtifacts, getCatalogStats, resolveSlug,
} from "../templates/index.js";
import type {
  TemplateArtifact, ArtifactGroup,
  ArtifactFilter, SceneModuleSubtype,
} from "../templates/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}
function hr(w = 72): string { return pc.dim("─".repeat(w)); }
function truncate(s: string, max: number): string { return s.length <= max ? s : s.slice(0, max - 1) + "…"; }

function box(lines: string[]): string {
  const padded = lines.map((l) => "  " + l);
  const width  = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top    = pc.dim("┌" + "─".repeat(width) + "┐");
  const bottom = pc.dim("└" + "─".repeat(width) + "┘");
  const body   = padded.map((l) => pc.dim("│") + l + " ".repeat(width - stripAnsi(l).length) + pc.dim("│"));
  return [top, ...body, bottom].join("\n");
}

function badge(a: TemplateArtifact): string {
  if (a.type === "ad-format")                return pc.cyan("🎬 Ad Format");
  if (a.type === "scene-module") {
    if (a.subtype === "hook") return pc.yellow("🪝 Hook");
    if (a.subtype === "body") return pc.blue("🧩 Body");
    if (a.subtype === "cta")  return pc.green("🎯 CTA");
  }
  return pc.magenta("🧩 Module");
}

function printCard(a: TemplateArtifact): void {
  const compat = a.compatibleFormats.length
    ? pc.dim("Works with: ") + a.compatibleFormats.map((f) => pc.cyan(f)).join(", ")
    : pc.dim("Works with: any format");
  const rows = [
    pc.bold(a.name),
    `${badge(a)}  ${pc.dim(a.id)}`,
    "",
    truncate(a.category, 62),
    "",
    compat,
  ];
  if (a.type === "ad-format" && a.scenes != null) {
    rows.push(pc.dim("Scenes: ") + a.scenes + (a.hookVariations ? pc.dim("  · Hook variations: ") + a.hookVariations : ""));
  }
  console.log(""); console.log(box(rows));
}

// ---------------------------------------------------------------------------
// Grouped summary — map, not menu. Shows structure + slugs, not full content.
// ---------------------------------------------------------------------------

function printSummary(filter: ArtifactFilter): void {
  const artifacts = listArtifacts(filter);
  if (!artifacts.length) {
    console.log(pc.yellow("No templates matched. Try: growthub template list")); return;
  }
  const stats  = getCatalogStats();
  const groups = groupArtifacts(artifacts);

  console.log("");
  console.log(pc.bold("Growthub Shared Template Library") + pc.dim(`  ${artifacts.length} of ${stats.total} artifacts`));
  console.log(pc.dim("  " + Object.entries(stats.byFamily).map(([f, n]) => `${f} (${n})`).join(" · ")));
  console.log(hr());

  for (const g of groups) {
    console.log(`\n${pc.bold(g.label)}  ${pc.dim("(" + g.count + ")")}`);
    console.log(pc.dim("  " + g.description));
    console.log("");
    for (const a of g.artifacts) {
      const compat = a.compatibleFormats.length ? pc.dim(" · " + a.compatibleFormats.join(", ")) : "";
      console.log(`  ${pc.cyan(pc.bold(a.name))}${compat}`);
      console.log(`  ${pc.dim("growthub template get " + a.slug)}`);
      console.log("");
    }
  }

  console.log(hr());
  console.log(pc.dim("  growthub template get <slug>"));
  console.log(pc.dim("  growthub template list --type ad-formats"));
  console.log(pc.dim("  growthub template list --type scene-modules --subtype hooks"));
  console.log(pc.dim("  growthub template   (interactive picker)"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Interactive two-step picker
// ---------------------------------------------------------------------------

async function runPicker(): Promise<void> {
  p.intro(pc.bold("Growthub Shared Template Library"));

  let artifacts: TemplateArtifact[];
  try { artifacts = listArtifacts(); }
  catch (err) { p.log.error((err as Error).message); process.exit(1); }

  const groups: ArtifactGroup[] = groupArtifacts(artifacts);

  // Step 1 — pick a group
  const groupChoice = await p.select({
    message: "What kind of template?",
    options: groups.map((g) => ({
      value: g.key,
      label: g.label,
      hint: `${g.count} available · ${g.description}`,
    })),
  });
  if (p.isCancel(groupChoice)) { p.cancel("Cancelled."); process.exit(0); }

  const group = groups.find((g) => g.key === groupChoice)!;

  // Step 2 — pick one artifact in the group
  const artifactChoice = await p.select({
    message: `Select from: ${group.label}`,
    options: group.artifacts.map((a) => ({
      value: a.id,
      label: pc.bold(a.name),
      hint: truncate(a.category, 52),
    })),
  });
  if (p.isCancel(artifactChoice)) { p.cancel("Cancelled."); process.exit(0); }

  const selected = artifacts.find((a) => a.id === artifactChoice)!;
  printCard(selected);

  // Step 3 — action
  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "print",  label: "📄 Print to terminal" },
      { value: "copy",   label: "📁 Copy to directory" },
      { value: "slug",   label: "📋 Print slug" },
      { value: "cancel", label: "Cancel" },
    ],
  });
  if (p.isCancel(action) || action === "cancel") { p.cancel("Cancelled."); process.exit(0); }

  if (action === "slug") {
    console.log(selected.slug);
    p.outro(pc.dim("Use with: growthub template get " + selected.slug));
    return;
  }

  if (action === "print") {
    const r = getArtifact(selected.id);
    console.log("\n" + hr()); console.log(r.content); console.log(hr());
    p.outro(pc.dim("Source: " + r.absolutePath));
    return;
  }

  if (action === "copy") {
    const destInput = await p.text({
      message: "Output directory:",
      placeholder: "~/Downloads/templates",
      validate: (v) => (!v?.trim() ? "Path is required" : undefined),
    });
    if (p.isCancel(destInput)) { p.cancel("Cancelled."); process.exit(0); }
    const destDir = path.resolve((destInput as string).replace(/^~/, process.env["HOME"] ?? ""));
    const destPath = copyArtifact(selected.id, destDir);
    p.outro(pc.green("Copied → ") + destPath);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerTemplateCommands(program: Command): void {
  const cmd = program
    .command("template")
    .description("Browse and pull from the shared creative template library")
    .addHelpText("after", `
Shared templates are frozen artifact primitives — distinct from kits.
Any agent or kit resolves them by slug.

  $ growthub template                                     Interactive picker
  $ growthub template list                                Grouped summary
  $ growthub template list --type ad-formats
  $ growthub template list --type scene-modules --subtype hooks
  $ growthub template list --format villain-animation
  $ growthub template get villain-animation               Fuzzy slug
  $ growthub template get meme-overlay --out ~/kit/hooks/
  $ growthub template get villain-animation --json
`);

  cmd.action(async () => { await runPicker(); });

  // ── list ──────────────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("Grouped template summary — filter before browsing")
    .option("--type <type>",       "ad-formats | scene-modules")
    .option("--subtype <subtype>", "hooks | body | cta  (scene-modules only)")
    .option("--format <format>",   "Filter by compatible ad format slug")
    .option("--json",              "Raw JSON for scripting")
    .action((opts: { type?: string; subtype?: string; format?: string; json?: boolean }) => {
      const filter: ArtifactFilter = {};

      if (opts.type) {
        const t = opts.type.replace(/s$/, "");
        if (t !== "ad-format" && t !== "scene-module") {
          console.error(pc.red(`Unknown --type '${opts.type}'.`) + pc.dim(" Valid: ad-formats, scene-modules"));
          process.exitCode = 1; return;
        }
        filter.type = t;
      }

      if (opts.subtype) {
        const sub = opts.subtype.replace(/s$/, "") as SceneModuleSubtype;
        if (!["hook", "body", "cta"].includes(sub)) {
          console.error(pc.red(`Unknown --subtype '${opts.subtype}'.`) + pc.dim(" Valid: hooks, body, cta"));
          process.exitCode = 1; return;
        }
        filter.subtype = sub;
      }

      if (opts.format) filter.format = opts.format;

      if (opts.json) { console.log(JSON.stringify(listArtifacts(filter), null, 2)); return; }
      printSummary(filter);
    });

  // ── get ───────────────────────────────────────────────────────────────────
  cmd
    .command("get")
    .description("Print or copy a template — fuzzy slug resolution")
    .argument("<slug>", "Artifact slug (e.g. villain-animation, meme-overlay)")
    .option("--out <path>", "Copy to this directory")
    .option("--json",       "Artifact metadata + content as JSON")
    .action((slug: string, opts: { out?: string; json?: boolean }) => {
      const artifact = resolveSlug(slug);
      if (!artifact) {
        console.error(pc.red(`Unknown template '${slug}'.`) + pc.dim(" Run `growthub template list` to browse."));
        process.exitCode = 1; return;
      }
      if (artifact.id !== slug && artifact.slug !== slug) {
        console.error(pc.dim(`Resolved '${slug}' → ${artifact.slug}`));
      }

      let resolved: ReturnType<typeof getArtifact>;
      try { resolved = getArtifact(artifact.id); }
      catch (err) { console.error(pc.red((err as Error).message)); process.exitCode = 1; return; }

      if (opts.json) { console.log(JSON.stringify({ artifact: resolved.artifact, content: resolved.content }, null, 2)); return; }

      if (opts.out) {
        const destDir = path.resolve(opts.out.replace(/^~/, process.env["HOME"] ?? ""));
        try {
          const dest = copyArtifact(artifact.id, destDir);
          console.log(pc.green("Copied → ") + dest);
        } catch (err) { console.error(pc.red((err as Error).message)); process.exitCode = 1; }
        return;
      }

      printCard(resolved.artifact);
      console.log(hr()); console.log(resolved.content); console.log(hr());
      console.log(pc.dim("Source: " + resolved.absolutePath)); console.log("");
    });
}
