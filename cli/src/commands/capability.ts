/**
 * CLI Commands — capability
 *
 * growthub capability list        — List CMS-backed runtime node primitives
 * growthub capability inspect     — Show capability bindings, family, outputs
 * growthub capability resolve     — Show machine-scoped resolution for all caps
 * growthub capability refresh     — Re-pull the hosted manifest and report drift
 * growthub capability register    — Validate + install a local extension file
 * growthub capability diff        — Show drift between cache and hosted manifest
 * growthub capability clear-cache — Drop the on-disk manifest cache
 *
 * Interactive picker is available via `growthub capability` (no subcommand).
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  createCmsCapabilityRegistryClient,
  CAPABILITY_FAMILIES,
  resolveLocalExtensionDir,
  validateLocalCapabilityExtension,
  resolveManifestCachePath,
  type CmsCapabilityNode,
  type CapabilityFamily,
  type ManifestDriftReport,
} from "../runtime/cms-capability-registry/index.js";
import {
  promptNodeInputs,
  renderInputFormSummary,
} from "../runtime/node-input-form/index.js";
import {
  createMachineCapabilityResolver,
} from "../runtime/machine-capability-resolver/index.js";
import { getWorkflowAccess } from "../auth/workflow-access.js";
import { readSession } from "../auth/session-store.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const FAMILY_CONFIG: Record<string, { color: (s: string) => string; emoji: string; label: string }> = {
  video:  { color: pc.magenta, emoji: "🎬", label: "Video" },
  image:  { color: pc.cyan,    emoji: "🖼️ ", label: "Image" },
  slides: { color: pc.yellow,  emoji: "📊", label: "Slides" },
  text:   { color: pc.green,   emoji: "📝", label: "Text" },
  data:   { color: pc.blue,    emoji: "📦", label: "Data" },
  ops:    { color: pc.red,     emoji: "⚙️ ", label: "Ops" },
};

function familyBadge(family: string): string {
  const cfg = FAMILY_CONFIG[family];
  if (!cfg) return family;
  return cfg.color(`${cfg.emoji} ${cfg.label}`);
}

function executionKindLabel(kind: string): string {
  if (kind === "hosted-execute") return pc.cyan("hosted");
  if (kind === "provider-assembly") return pc.yellow("provider");
  if (kind === "local-only") return pc.green("local");
  return kind;
}

function sourceBadge(node: CmsCapabilityNode): string {
  const source = node.provenance?.source ?? "hosted";
  if (source === "local-extension") return pc.magenta("local-ext");
  if (source === "hosted-derived") return pc.yellow("derived");
  return pc.dim("hosted");
}

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
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

// ---------------------------------------------------------------------------
// Grouped list renderer
// ---------------------------------------------------------------------------

function printGroupedCapabilities(nodes: CmsCapabilityNode[]): void {
  const byFamily: Record<string, CmsCapabilityNode[]> = {};
  for (const node of nodes) {
    (byFamily[node.family] ??= []).push(node);
  }

  const families = Object.keys(byFamily).sort();
  const totalFamilies = families.length;

  console.log("");
  console.log(
    pc.bold("CMS Capability Registry") +
    pc.dim(`  ${nodes.length} capabilit${nodes.length !== 1 ? "ies" : "y"}  ·  ${totalFamilies} ${totalFamilies !== 1 ? "families" : "family"}`),
  );
  console.log(hr());

  for (const family of families) {
    const groupNodes = byFamily[family];
    const header = familyBadge(family);

    console.log(`\n${header}  ${pc.dim("(" + groupNodes.length + ")")}`);

    for (const node of groupNodes) {
      const enabledTag = node.enabled ? pc.green("enabled") : pc.red("disabled");
      console.log(`  ${pc.bold(node.slug)}  ${pc.dim(node.displayName)}  ${enabledTag}  ${sourceBadge(node)}`);
      console.log(`  ${pc.dim("Execution:")} ${executionKindLabel(node.executionKind)}  ${pc.dim("Outputs:")} ${pc.dim(node.outputTypes.join(", "))}`);
      if (node.description) {
        console.log(`  ${pc.dim(node.description)}`);
      }
      console.log("");
    }
  }

  console.log(hr());
  console.log(pc.dim("  growthub capability inspect <slug>  ·  growthub capability resolve"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Inspect renderer
// ---------------------------------------------------------------------------

function printCapabilityCard(node: CmsCapabilityNode): void {
  const iconPrefix = node.icon ? `${node.icon}  ` : "";
  const lines = [
    `${iconPrefix}${pc.bold(node.displayName)}  ${pc.dim(node.slug)}`,
    `${familyBadge(node.family)}  ${node.enabled ? pc.green("enabled") : pc.red("disabled")}`,
    "",
    `${pc.dim("Category:")}          ${node.category}`,
    `${pc.dim("Node Type:")}         ${node.nodeType}`,
    `${pc.dim("Execution Kind:")}    ${executionKindLabel(node.executionKind)}`,
    `${pc.dim("Execution Strategy:")} ${node.executionBinding.strategy}`,
    `${pc.dim("Tool Name:")}         ${node.executionTokens.tool_name}`,
    `${pc.dim("Output Types:")}      ${node.outputTypes.join(", ")}`,
    `${pc.dim("Required Bindings:")} ${node.requiredBindings.length > 0 ? node.requiredBindings.join(", ") : pc.dim("(none)")}`,
  ];

  if (node.description) {
    lines.push("", pc.dim(node.description));
  }

  const inputKeys = Object.keys(node.executionTokens.input_template);
  if (inputKeys.length > 0) {
    lines.push("", `${pc.dim("Input fields:")} ${inputKeys.join(", ")}`);
  }

  if (node.provenance) {
    lines.push(
      "",
      `${pc.dim("Provenance:")}        ${sourceBadge(node)}`,
      `${pc.dim("Fetched:")}           ${node.provenance.fetchedAt}`,
      ...(node.provenance.manifestHash ? [`${pc.dim("Manifest hash:")}     ${node.provenance.manifestHash}`] : []),
      ...(node.provenance.filePath ? [`${pc.dim("File:")}              ${node.provenance.filePath}`] : []),
    );
  }

  console.log("");
  console.log(box(lines));
  console.log("");
}

// ---------------------------------------------------------------------------
// Interactive picker (accessible from discovery hub)
// ---------------------------------------------------------------------------

export async function runCapabilityPicker(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("CMS Capability Registry"));

  const access = getWorkflowAccess();
  if (access.state !== "ready") {
    p.note(
      [
        "Capabilities are unavailable until the hosted user is linked to this local machine.",
        access.reason,
      ].join("\n"),
      "Growthub Local Machine Required",
    );
    return opts.allowBackToHub ? "back" : "done";
  }

  const registry = createCmsCapabilityRegistryClient();

  while (true) {
    const familyChoice = await p.select({
      message: "Filter by capability family",
      options: [
        { value: "all", label: "All Families" },
        ...CAPABILITY_FAMILIES.map((family) => {
          const cfg = FAMILY_CONFIG[family];
          return {
            value: family,
            label: cfg ? `${cfg.emoji}  ${cfg.label}` : family,
          };
        }),
        ...(opts.allowBackToHub ? [{ value: "__back_to_hub", label: "← Back to main menu" }] : []),
      ],
    });

    if (p.isCancel(familyChoice)) { p.cancel("Cancelled."); process.exit(0); }
    if (familyChoice === "__back_to_hub") return "back";

    const query = familyChoice === "all"
      ? undefined
      : { family: familyChoice as CapabilityFamily };

    let result: { nodes: CmsCapabilityNode[] };
    try {
      result = await registry.listCapabilities(query);
    } catch (err) {
      p.log.error("Failed to load capabilities: " + (err as Error).message);
      continue;
    }

    if (result.nodes.length === 0) {
      p.note("No capabilities available for that family.", "Nothing found");
      continue;
    }

    while (true) {
      const capChoice = await p.select({
        message: "Select capability",
        options: [
          ...result.nodes.map((n) => ({
            value: n.slug,
            label:
              `${familyBadge(n.family)}  ` +
              pc.bold(n.displayName) + "  " +
              pc.dim(n.slug),
            hint: n.description ? n.description.slice(0, 55) : undefined,
          })),
          { value: "__back_to_family", label: "← Back to family filter" },
        ],
      });

      if (p.isCancel(capChoice)) { p.cancel("Cancelled."); process.exit(0); }
      if (capChoice === "__back_to_family") break;

      const selected = result.nodes.find((n) => n.slug === capChoice);
      if (!selected) continue;

      printCapabilityCard(selected);

      const nextStep = await p.select({
        message: "Next step",
        options: [
          { value: "resolve", label: "🔍 Check machine binding" },
          { value: "back_to_caps", label: "← Back to capability list" },
        ],
      });

      if (p.isCancel(nextStep)) { p.cancel("Cancelled."); process.exit(0); }
      if (nextStep === "back_to_caps") continue;

      if (nextStep === "resolve") {
        try {
          const resolver = createMachineCapabilityResolver();
          const binding = await resolver.resolveCapability(selected.slug);
          if (binding) {
            const statusColor = binding.allowed ? pc.green : pc.red;
            console.log("");
            console.log(box([
              `${pc.bold("Machine Binding:")} ${selected.slug}`,
              `${pc.dim("Allowed:")}  ${statusColor(String(binding.allowed))}`,
              `${pc.dim("Reason:")}   ${binding.reason ?? "—"}`,
              ...(binding.machineConnectionId ? [`${pc.dim("Connection:")} ${binding.machineConnectionId}`] : []),
            ]));
            console.log("");
          }
        } catch (err) {
          p.log.error("Resolution failed: " + (err as Error).message);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerCapabilityCommands(program: Command): void {
  const cap = program
    .command("capability")
    .description("Discover and inspect CMS-backed runtime node capabilities")
    .addHelpText("after", `
Examples:
  $ growthub capability                     # interactive browser
  $ growthub capability list                # all capabilities grouped by family
  $ growthub capability list --family video # filter by family
  $ growthub capability list --json         # machine-readable output
  $ growthub capability inspect video-gen   # inspect a specific capability
  $ growthub capability resolve             # resolve machine bindings for all
  $ growthub capability refresh             # re-pull hosted manifest + report drift
  $ growthub capability register ./my.json  # install a local extension
  $ growthub capability diff                # drift between cache and hosted
  $ growthub capability clear-cache         # drop the on-disk manifest cache
  $ growthub capability configure video-gen # rich form — supports MP4/PNG local files
`);

  cap.action(async () => {
    await runCapabilityPicker({});
  });

  // ── list ────────────────────────────────────────────────────────────────
  cap
    .command("list")
    .description("List all CMS-backed runtime node capabilities")
    .option("--family <family>", "Filter by family (video, image, slides, text, data, ops)")
    .option("--json", "Output raw JSON for scripting")
    .action(async (opts: { family?: string; json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      const query = opts.family
        ? { family: opts.family as CapabilityFamily }
        : undefined;

      try {
        const { nodes, meta } = await registry.listCapabilities(query);

        if (opts.json) {
          console.log(JSON.stringify({ nodes, meta }, null, 2));
          return;
        }

        if (nodes.length === 0) {
          console.error(pc.yellow("No capabilities found" + (opts.family ? ` for family: ${opts.family}` : "") + "."));
          console.error(pc.dim("Valid families: " + CAPABILITY_FAMILIES.join(", ")));
          process.exitCode = 1;
          return;
        }

        printGroupedCapabilities(nodes);
        const cacheSuffix = meta.cached ? pc.yellow(" (served from cache)") : "";
        const extSuffix = meta.localExtensionCount && meta.localExtensionCount > 0
          ? pc.magenta(` · ${meta.localExtensionCount} local extension${meta.localExtensionCount === 1 ? "" : "s"}`)
          : "";
        console.log(pc.dim(`  Source: ${meta.source}${cacheSuffix}${extSuffix}  ·  Fetched: ${meta.fetchedAt}`));
        if (meta.manifestHash) {
          console.log(pc.dim(`  Manifest: ${meta.manifestHash}`));
        }
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to list capabilities: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── inspect ─────────────────────────────────────────────────────────────
  cap
    .command("inspect")
    .description("Inspect a specific CMS capability node")
    .argument("<slug>", "Capability slug (e.g. 'video-gen', 'text-gen')")
    .option("--json", "Output raw JSON")
    .action(async (slug: string, opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();

      try {
        const node = await registry.getCapability(slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(node, null, 2));
          return;
        }

        printCapabilityCard(node);
      } catch (err) {
        console.error(pc.red("Failed to inspect capability: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── resolve ─────────────────────────────────────────────────────────────
  cap
    .command("resolve")
    .description("Resolve machine-scoped capability bindings for all capabilities")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      try {
        const resolver = createMachineCapabilityResolver();
        const result = await resolver.resolveAll();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log("");
        console.log(pc.bold("Machine Capability Resolution"));
        console.log(hr());
        console.log(`  ${pc.dim("Hostname:")}  ${result.machineContext.hostname}`);
        console.log(`  ${pc.dim("Instance:")}  ${result.machineContext.instanceId}`);
        console.log(`  ${pc.dim("Session:")}   ${result.machineContext.hasActiveSession ? pc.green("active") : pc.red("none")}`);
        if (result.machineContext.machineLabel) {
          console.log(`  ${pc.dim("Machine:")}   ${result.machineContext.machineLabel}`);
        }
        console.log(`  ${pc.dim("Entitlements:")} ${result.entitlements.length > 0 ? result.entitlements.join(", ") : pc.dim("(none)")}`);
        console.log(hr());

        for (const binding of result.bindings) {
          const statusColor = binding.allowed ? pc.green : pc.red;
          const statusIcon = binding.allowed ? "✓" : "✗";
          console.log(
            `  ${statusColor(statusIcon)} ${pc.bold(binding.capabilitySlug)}` +
            `  ${pc.dim(binding.reason ?? "")}`,
          );
        }

        console.log("");
        console.log(pc.dim(`  Resolved at: ${result.resolvedAt}`));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to resolve capabilities: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── refresh ─────────────────────────────────────────────────────────────
  cap
    .command("refresh")
    .description("Re-fetch the hosted capability manifest and report drift")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      try {
        const registry = createCmsCapabilityRegistryClient({ bypassCache: true });
        const result = await registry.refresh();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printDriftReport(result.drift, result.envelope.meta.registryHash);
        console.log(pc.dim(`  Cache: ${result.cachePath}`));
        console.log(pc.dim(`  Hash:  ${result.envelope.meta.registryHash}`));
        console.log(pc.dim(`  Nodes: ${result.envelope.meta.nodeCount}  ·  Enabled: ${result.envelope.meta.enabledCount}`));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to refresh capabilities: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── register (local extension) ──────────────────────────────────────────
  cap
    .command("register")
    .description("Install a local capability extension file into the active fork")
    .argument("<file>", "Path to a LocalCapabilityExtension JSON file")
    .option("--fork <path>", "Target fork path (defaults to the current working directory)")
    .option("--force", "Overwrite an existing extension with the same slug")
    .action(async (file: string, opts: { fork?: string; force?: boolean }) => {
      const sourcePath = path.resolve(file);
      if (!fs.existsSync(sourcePath)) {
        console.error(pc.red(`File not found: ${sourcePath}`));
        process.exitCode = 1;
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      } catch (err) {
        console.error(pc.red(`Invalid JSON: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }

      const verdict = validateLocalCapabilityExtension(parsed);
      if (!verdict.ok) {
        console.error(pc.red("Extension failed validation:"));
        for (const issue of verdict.issues) {
          console.error(pc.red(`  ${issue.path}: ${issue.message}`));
        }
        process.exitCode = 1;
        return;
      }

      const envelope = parsed as { node: { slug: string } };
      const forkPath = opts.fork ? path.resolve(opts.fork) : process.cwd();
      const targetDir = resolveLocalExtensionDir(forkPath);
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, `${envelope.node.slug}.json`);

      if (fs.existsSync(targetFile) && !opts.force) {
        console.error(pc.red(`Extension already exists at ${targetFile}. Use --force to overwrite.`));
        process.exitCode = 1;
        return;
      }

      fs.copyFileSync(sourcePath, targetFile);
      console.log("");
      console.log(pc.green(`✓ Installed local extension: ${envelope.node.slug}`));
      console.log(pc.dim(`  Fork: ${forkPath}`));
      console.log(pc.dim(`  File: ${targetFile}`));
      console.log("");
    });

  // ── diff ────────────────────────────────────────────────────────────────
  cap
    .command("diff")
    .description("Show drift between the cached manifest and the hosted registry")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      try {
        const registry = createCmsCapabilityRegistryClient({ bypassCache: true });
        const { drift, envelope } = await registry.refresh();

        if (opts.json) {
          console.log(JSON.stringify({ drift, hash: envelope.meta.registryHash }, null, 2));
          return;
        }

        printDriftReport(drift, envelope.meta.registryHash);
      } catch (err) {
        console.error(pc.red("Failed to compute drift: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── configure (rich schema-driven form) ─────────────────────────────────
  cap
    .command("configure")
    .description("Rich schema-driven form for a capability — supports local MP4/PNG/media")
    .argument("<slug>", "Capability slug")
    .option("--json", "Output the collected bindings as JSON (no rendered summary)")
    .option("--seed <file>", "Seed values from a JSON file")
    .action(async (slug: string, opts: { json?: boolean; seed?: string }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      try {
        const node = await registry.getCapability(slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`));
          process.exitCode = 1;
          return;
        }

        let seed: Record<string, unknown> | undefined;
        if (opts.seed) {
          const seedPath = path.resolve(opts.seed);
          if (!fs.existsSync(seedPath)) {
            console.error(pc.red(`Seed file not found: ${seedPath}`));
            process.exitCode = 1;
            return;
          }
          seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as Record<string, unknown>;
        }

        const result = await promptNodeInputs(node, { seed });
        if (result.cancelled) {
          console.error(pc.yellow("Configuration cancelled."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify({
            slug: node.slug,
            bindings: result.bindings,
            attachments: result.attachments.map((a) => ({
              key: a.key,
              path: a.file.absolutePath,
              mime: a.file.mime,
              category: a.file.category,
              sizeBytes: a.file.sizeBytes,
            })),
          }, null, 2));
          return;
        }

        console.log("");
        console.log(renderInputFormSummary(result));
        console.log("");
      } catch (err) {
        console.error(pc.red("Configure failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── clear-cache ─────────────────────────────────────────────────────────
  cap
    .command("clear-cache")
    .description("Drop the on-disk manifest cache")
    .action(async () => {
      const session = readSession();
      const host = session?.hostedBaseUrl ?? "https://app.growthub.local";
      const cachePath = resolveManifestCachePath(host);
      const registry = createCmsCapabilityRegistryClient();
      const cleared = registry.clearCache();
      if (cleared) {
        console.log(pc.green(`✓ Cache cleared: ${cachePath}`));
      } else {
        console.log(pc.dim(`No cache file at ${cachePath}.`));
      }
    });
}

function printDriftReport(drift: ManifestDriftReport, remoteHash: string): void {
  const color =
    drift.severity === "none"
      ? pc.green
      : drift.severity === "node-added"
        ? pc.yellow
        : pc.red;
  console.log("");
  console.log(pc.bold("Capability Registry Drift"));
  console.log(hr());
  console.log(`  ${pc.dim("Severity:")}     ${color(drift.severity)}`);
  console.log(`  ${pc.dim("Local hash:")}   ${drift.localHash || pc.dim("(no prior cache)")}`);
  console.log(`  ${pc.dim("Remote hash:")}  ${remoteHash}`);
  if (drift.addedSlugs.length > 0) {
    console.log(`  ${pc.dim("Added:")}        ${drift.addedSlugs.map((s) => pc.green(s)).join(", ")}`);
  }
  if (drift.removedSlugs.length > 0) {
    console.log(`  ${pc.dim("Removed:")}      ${drift.removedSlugs.map((s) => pc.red(s)).join(", ")}`);
  }
  if (drift.mutatedSlugs.length > 0) {
    console.log(`  ${pc.dim("Mutated:")}      ${drift.mutatedSlugs.map((s) => pc.yellow(s)).join(", ")}`);
  }
  console.log(hr());
  console.log("");
}
