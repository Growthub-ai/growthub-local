/**
 * CLI Commands — capability
 *
 * growthub capability list       — List CMS-backed runtime node primitives
 * growthub capability inspect    — Show capability bindings, family, outputs
 * growthub capability resolve    — Show machine-scoped resolution for all caps
 *
 * Interactive picker is available via `growthub capability` (no subcommand).
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  createCmsCapabilityRegistryClient,
  clearCapabilityCache,
  getCapabilityCacheStatus,
  CAPABILITY_FAMILIES,
  type CmsCapabilityNode,
  type CapabilityFamily,
  type InputTemplateField,
  type OutputMappingEntry,
} from "../runtime/cms-capability-registry/index.js";
import {
  createMachineCapabilityResolver,
} from "../runtime/machine-capability-resolver/index.js";
import { getWorkflowAccess } from "../auth/workflow-access.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Execution token inspection helpers
// ---------------------------------------------------------------------------

function extractInputTemplateFields(template: Record<string, unknown>): InputTemplateField[] {
  return Object.entries(template).map(([key, value]) => ({
    key,
    value,
    valueType: Array.isArray(value) ? "array" : typeof value,
    isEmpty: value === "" || value === null || value === undefined,
  }));
}

function extractOutputMappingEntries(mapping: Record<string, unknown>): OutputMappingEntry[] {
  return Object.entries(mapping).map(([key, path]) => ({ key, path }));
}

function printInputTemplateTable(fields: InputTemplateField[]): void {
  if (fields.length === 0) {
    console.log(pc.dim("  (no input fields defined)"));
    return;
  }
  const keyWidth = Math.max(8, ...fields.map((f) => f.key.length));
  const typeWidth = Math.max(6, ...fields.map((f) => f.valueType.length));
  console.log(
    "  " + pc.dim("key".padEnd(keyWidth)) + "  " + pc.dim("type".padEnd(typeWidth)) + "  " + pc.dim("default"),
  );
  console.log("  " + pc.dim("─".repeat(keyWidth + typeWidth + 20)));
  for (const field of fields) {
    const defaultStr = field.isEmpty
      ? pc.dim("(empty)")
      : pc.green(JSON.stringify(field.value).slice(0, 60));
    console.log("  " + pc.bold(field.key.padEnd(keyWidth)) + "  " + pc.dim(field.valueType.padEnd(typeWidth)) + "  " + defaultStr);
  }
}

function printOutputMappingTable(entries: OutputMappingEntry[]): void {
  if (entries.length === 0) {
    console.log(pc.dim("  (no output mappings defined)"));
    return;
  }
  const keyWidth = Math.max(8, ...entries.map((e) => e.key.length));
  console.log("  " + pc.dim("key".padEnd(keyWidth)) + "  " + pc.dim("path / value"));
  console.log("  " + pc.dim("─".repeat(keyWidth + 40)));
  for (const entry of entries) {
    console.log("  " + pc.bold(entry.key.padEnd(keyWidth)) + "  " + pc.cyan(JSON.stringify(entry.path).slice(0, 80)));
  }
}

function printCacheFreshnessLine(meta: { fromCache?: boolean; source?: string; fetchedAt?: string; expiresAt?: string; cacheAgeSeconds?: number }): void {
  if (meta.fromCache) {
    const age = meta.cacheAgeSeconds !== undefined ? `${meta.cacheAgeSeconds}s ago` : "?";
    const expires = meta.expiresAt ? `expires ${meta.expiresAt.slice(11, 19)} UTC` : "";
    console.log(pc.dim(`  Cache: warm · fetched ${age} · ${expires}`));
  } else {
    const ts = meta.fetchedAt ? meta.fetchedAt.slice(0, 19).replace("T", " ") + " UTC" : "just now";
    console.log(pc.dim(`  Source: ${meta.source ?? "hosted"} · fetched ${ts}`));
  }
}

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
      console.log(`  ${pc.bold(node.slug)}  ${pc.dim(node.displayName)}  ${enabledTag}`);
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
    .option("--refresh", "Bypass local TTL cache and fetch fresh from hosted")
    .action(async (opts: { family?: string; json?: boolean; refresh?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      const query = {
        ...(opts.family ? { family: opts.family as CapabilityFamily } : {}),
        ...(opts.refresh ? { refresh: true } : {}),
      };

      try {
        const { nodes, meta } = await registry.listCapabilities(Object.keys(query).length > 0 ? query : undefined);

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
        printCacheFreshnessLine(meta);
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
        const { nodes, meta } = await registry.listCapabilities({ slug, enabledOnly: false });
        const node = nodes.find((n) => n.slug === slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify({ ...node, _meta: meta }, null, 2));
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
          const tags: string[] = [];
          if (binding.family) tags.push(pc.dim(binding.family));
          if (binding.strategy && binding.strategy !== "direct") tags.push(pc.yellow(binding.strategy));
          const tagStr = tags.length > 0 ? "  " + tags.join("  ") : "";
          console.log(
            `  ${statusColor(statusIcon)} ${pc.bold(binding.capabilitySlug)}${tagStr}` +
            `\n     ${pc.dim(binding.reason ?? "")}`,
          );
        }

        console.log("");
        console.log(pc.dim(`  Resolved at: ${result.resolvedAt}`));
        if (result.registryMeta) {
          const rm = result.registryMeta;
          const cacheNote = rm.staleFallback
            ? pc.yellow("stale fallback")
            : rm.fromCache
              ? `cache (${rm.cacheAgeSeconds ?? "?"}s ago)`
              : rm.source;
          console.log(pc.dim(`  Registry:    ${cacheNote}`));
        }
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to resolve capabilities: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── manifest ─────────────────────────────────────────────────────────────
  cap
    .command("manifest")
    .description("Show normalized hosted manifest metadata and execution tokens for a capability")
    .argument("<slug>", "Capability slug")
    .option("--json", "Output raw JSON")
    .option("--refresh", "Bypass local TTL cache")
    .action(async (slug: string, opts: { json?: boolean; refresh?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      try {
        const { nodes, meta } = await registry.listCapabilities({ slug, enabledOnly: false, refresh: opts.refresh });
        const node = nodes.find((n) => n.slug === slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify({
            slug: node.slug,
            displayName: node.displayName,
            family: node.family,
            category: node.category,
            nodeType: node.nodeType,
            executionKind: node.executionKind,
            executionBinding: node.executionBinding,
            executionTokens: node.executionTokens,
            requiredBindings: node.requiredBindings,
            outputTypes: node.outputTypes,
            enabled: node.enabled,
            experimental: node.experimental,
            visibility: node.visibility,
            description: node.description,
            manifestMetadata: node.manifestMetadata,
            _meta: meta,
          }, null, 2));
          return;
        }

        console.log("");
        console.log(pc.bold(`Manifest: ${node.displayName}`) + "  " + pc.dim(node.slug));
        console.log(hr());
        console.log(`  ${pc.dim("Family:")}             ${node.family}`);
        console.log(`  ${pc.dim("Category:")}           ${node.category}`);
        console.log(`  ${pc.dim("Node Type:")}          ${node.nodeType}`);
        console.log(`  ${pc.dim("Execution Kind:")}     ${node.executionKind}`);
        console.log(`  ${pc.dim("Strategy:")}           ${node.executionBinding.strategy}`);
        console.log(`  ${pc.dim("Tool Name:")}          ${node.executionTokens.tool_name}`);
        console.log(`  ${pc.dim("Required Bindings:")}  ${node.requiredBindings.length > 0 ? node.requiredBindings.join(", ") : pc.dim("(none)")}`);
        console.log(`  ${pc.dim("Output Types:")}       ${node.outputTypes.length > 0 ? node.outputTypes.join(", ") : pc.dim("(none)")}`);
        console.log(`  ${pc.dim("Visibility:")}         ${node.visibility}`);
        console.log(`  ${pc.dim("Enabled:")}            ${node.enabled ? pc.green("yes") : pc.red("no")}`);
        console.log(`  ${pc.dim("Experimental:")}       ${node.experimental ? pc.yellow("yes") : "no"}`);
        if (node.executionTokens.migration_version) {
          console.log(`  ${pc.dim("Migration Version:")}  ${node.executionTokens.migration_version}`);
        }
        if (node.executionBinding.timeoutMs) {
          console.log(`  ${pc.dim("Timeout:")}            ${node.executionBinding.timeoutMs}ms`);
        }
        if (node.executionBinding.max_retries !== undefined) {
          console.log(`  ${pc.dim("Max Retries:")}        ${node.executionBinding.max_retries}`);
        }
        if (node.executionBinding.polling_interval !== undefined) {
          console.log(`  ${pc.dim("Poll Interval:")}      ${node.executionBinding.polling_interval}ms`);
        }
        if (node.executionTokens.endpoint_config) {
          const ec = node.executionTokens.endpoint_config;
          const parts: string[] = [];
          if (ec.env_var) parts.push(`env=${ec.env_var}`);
          if (ec.endpoint_type) parts.push(`type=${ec.endpoint_type}`);
          console.log(`  ${pc.dim("Endpoint Config:")}    ${parts.join("  ")}`);
        }
        if (node.description) {
          console.log("");
          console.log("  " + pc.dim(node.description));
        }
        console.log(hr());
        printCacheFreshnessLine(meta);
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to load manifest: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── schema ────────────────────────────────────────────────────────────────
  cap
    .command("schema")
    .description("Show the input_template (input schema) for a capability")
    .argument("<slug>", "Capability slug")
    .option("--json", "Output raw JSON")
    .option("--refresh", "Bypass local TTL cache")
    .action(async (slug: string, opts: { json?: boolean; refresh?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      try {
        const { nodes } = await registry.listCapabilities({ slug, enabledOnly: false, refresh: opts.refresh });
        const node = nodes.find((n) => n.slug === slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(node.executionTokens.input_template, null, 2));
          return;
        }

        const fields = extractInputTemplateFields(node.executionTokens.input_template);
        console.log("");
        console.log(pc.bold(`Input Schema: ${node.displayName}`) + "  " + pc.dim(`${fields.length} field${fields.length !== 1 ? "s" : ""}`));
        console.log(hr());
        printInputTemplateTable(fields);
        console.log(hr());
        console.log(pc.dim(`  growthub capability manifest ${slug}  ·  growthub capability outputs ${slug}`));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to load schema: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── outputs ───────────────────────────────────────────────────────────────
  cap
    .command("outputs")
    .description("Show the output_mapping for a capability")
    .argument("<slug>", "Capability slug")
    .option("--json", "Output raw JSON")
    .option("--refresh", "Bypass local TTL cache")
    .action(async (slug: string, opts: { json?: boolean; refresh?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      try {
        const { nodes } = await registry.listCapabilities({ slug, enabledOnly: false, refresh: opts.refresh });
        const node = nodes.find((n) => n.slug === slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(node.executionTokens.output_mapping, null, 2));
          return;
        }

        const entries = extractOutputMappingEntries(node.executionTokens.output_mapping);
        console.log("");
        console.log(pc.bold(`Output Mapping: ${node.displayName}`) + "  " + pc.dim(`${entries.length} entr${entries.length !== 1 ? "ies" : "y"}`));
        console.log(`  ${pc.dim("Output Types:")} ${node.outputTypes.length > 0 ? node.outputTypes.join(", ") : pc.dim("(none)")}`);
        console.log(hr());
        printOutputMappingTable(entries);
        console.log(hr());
        console.log(pc.dim(`  growthub capability schema ${slug}  ·  growthub capability manifest ${slug}`));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to load output mapping: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── versions ──────────────────────────────────────────────────────────────
  cap
    .command("versions")
    .description("Show version, migration marker, cache source, and hosted revision metadata for a capability")
    .argument("<slug>", "Capability slug")
    .option("--json", "Output raw JSON")
    .option("--refresh", "Bypass local TTL cache")
    .action(async (slug: string, opts: { json?: boolean; refresh?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      try {
        const { nodes, meta } = await registry.listCapabilities({ slug, enabledOnly: false, refresh: opts.refresh });
        const node = nodes.find((n) => n.slug === slug);
        if (!node) {
          console.error(pc.red(`Unknown capability: "${slug}".`) + pc.dim(" Run `growthub capability list` to browse."));
          process.exitCode = 1;
          return;
        }

        const migrationVersion = node.executionTokens.migration_version ?? null;
        const manifestMeta = node.manifestMetadata ?? {};
        const hostedRevision = typeof manifestMeta.revision === "string" ? manifestMeta.revision
          : typeof manifestMeta.version === "string" ? manifestMeta.version
          : null;

        if (opts.json) {
          console.log(JSON.stringify({
            slug: node.slug,
            migrationVersion,
            hostedRevision,
            cacheSource: meta.source,
            fromCache: meta.fromCache ?? false,
            fetchedAt: meta.fetchedAt,
            expiresAt: meta.expiresAt ?? null,
            cacheAgeSeconds: meta.cacheAgeSeconds ?? null,
          }, null, 2));
          return;
        }

        console.log("");
        console.log(pc.bold(`Version Info: ${node.displayName}`) + "  " + pc.dim(node.slug));
        console.log(hr());
        console.log(`  ${pc.dim("Migration Version:")}  ${migrationVersion ?? pc.dim("(not set)")}`);
        console.log(`  ${pc.dim("Hosted Revision:")}    ${hostedRevision ?? pc.dim("(not set)")}`);
        console.log(`  ${pc.dim("Source:")}             ${meta.source}`);
        console.log(`  ${pc.dim("From Cache:")}         ${meta.fromCache ? pc.yellow("yes") : "no"}`);
        console.log(`  ${pc.dim("Fetched At:")}         ${meta.fetchedAt}`);
        if (meta.expiresAt) {
          console.log(`  ${pc.dim("Cache Expires:")}      ${meta.expiresAt}`);
        }
        if (meta.cacheAgeSeconds !== undefined) {
          console.log(`  ${pc.dim("Cache Age:")}          ${meta.cacheAgeSeconds}s`);
        }
        console.log(hr());
        console.log(pc.dim("  Use --refresh to bypass cache and fetch the latest version from hosted."));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed to load version info: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── cache ─────────────────────────────────────────────────────────────────
  const cacheCmd = cap
    .command("cache")
    .description("Manage the local capability registry TTL cache");

  cacheCmd
    .command("status")
    .description("Show cache freshness, node count, and source metadata")
    .option("--json", "Output raw JSON")
    .action((opts: { json?: boolean }) => {
      const status = getCapabilityCacheStatus();

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold("Capability Registry Cache"));
      console.log(hr());

      if (!status.exists) {
        console.log("  " + pc.yellow("No cache found.") + pc.dim("  Run `growthub capability list` to populate."));
        console.log("");
        return;
      }

      const freshLabel = status.fresh ? pc.green("fresh") : pc.yellow("stale");
      console.log(`  ${pc.dim("Status:")}       ${freshLabel}`);
      console.log(`  ${pc.dim("Source:")}       ${status.source ?? "?"}`);
      console.log(`  ${pc.dim("Total:")}        ${status.total ?? "?"} capabilities`);
      console.log(`  ${pc.dim("Enabled:")}      ${status.enabledCount ?? "?"} capabilities`);
      console.log(`  ${pc.dim("Fetched:")}      ${status.fetchedAt ?? "?"}`);
      console.log(`  ${pc.dim("Expires:")}      ${status.expiresAt ?? "?"}`);
      console.log(`  ${pc.dim("Age:")}          ${status.ageSeconds !== undefined ? `${status.ageSeconds}s` : "?"}`);
      console.log(hr());
      console.log(pc.dim("  growthub capability cache clear  ·  growthub capability list --refresh"));
      console.log("");
    });

  cacheCmd
    .command("clear")
    .description("Clear the local capability registry cache")
    .action(() => {
      clearCapabilityCache();
      console.log(pc.green("Capability registry cache cleared.") + pc.dim("  Next list will fetch fresh from hosted."));
    });
}
