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
  CAPABILITY_FAMILIES,
  type CmsCapabilityNode,
  type CapabilityFamily,
} from "../runtime/cms-capability-registry/index.js";
import {
  createMachineCapabilityResolver,
} from "../runtime/machine-capability-resolver/index.js";
import {
  fetchCapabilityManifest,
  ManifestClientError,
  ManifestContractMismatchError,
  ManifestEndpointUnavailableError,
  ManifestMalformedError,
  ManifestUnauthenticatedError,
} from "../runtime/cms-manifest-client/index.js";
import {
  describeManifestCachePath,
  readManifestCache,
  resolveManifestCachePath,
  writeManifestCache,
} from "../runtime/cms-manifest-cache/index.js";
import {
  diffManifestEnvelopes,
  type ManifestDriftSummary,
} from "../runtime/cms-manifest-diff/index.js";
import { getWorkflowAccess } from "../auth/workflow-access.js";
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
      const experimentalTag = node.experimental ? `  ${pc.yellow("experimental")}` : "";
      console.log(`  ${pc.bold(node.slug)}  ${pc.dim(node.displayName)}  ${enabledTag}${experimentalTag}`);
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
    `${pc.dim("Experimental:")}     ${node.experimental ? pc.yellow("true") : pc.green("false")}`,
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
  $ growthub capability list --family video --include-experimental
  $ growthub capability list --json         # machine-readable output
  $ growthub capability inspect video-gen   # inspect a specific capability
  $ growthub capability resolve             # resolve machine bindings for all
  $ growthub capability refresh             # sync hosted CMS manifest and diff
`);

  cap.action(async () => {
    await runCapabilityPicker({});
  });

  // ── list ────────────────────────────────────────────────────────────────
  cap
    .command("list")
    .description("List all CMS-backed runtime node capabilities")
    .option("--family <family>", "Filter by family (video, image, slides, text, data, ops)")
    .option("--include-experimental", "Include experimental/admin-hidden capabilities")
    .option("--json", "Output raw JSON for scripting")
    .action(async (opts: { family?: string; includeExperimental?: boolean; json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      const query = opts.family
        ? { family: opts.family as CapabilityFamily, includeExperimental: opts.includeExperimental === true }
        : { includeExperimental: opts.includeExperimental === true };

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
        console.log(pc.dim(`  Source: ${meta.source}  ·  Fetched: ${meta.fetchedAt}`));
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
    .option("--include-experimental", "Include experimental/admin-hidden capabilities")
    .option("--json", "Output raw JSON")
    .action(async (slug: string, opts: { includeExperimental?: boolean; json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();

      try {
        const { nodes } = await registry.listCapabilities({
          slug,
          enabledOnly: false,
          includeExperimental: opts.includeExperimental === true,
        });
        const node = nodes.find((candidate) => candidate.slug === slug) ?? null;
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
    .description("Sync the canonical hosted CMS capability manifest and diff against the local cache")
    .option("--base-url <url>", "Hosted Growthub base URL (defaults to session / env / config / https://www.growthub.ai)")
    .option("--json", "Output raw JSON for scripting")
    .option("--include-experimental", "Include experimental capabilities in the summary rendering")
    .option("--include-disabled", "Include disabled capabilities in the summary rendering")
    .action(async (opts: {
      baseUrl?: string;
      json?: boolean;
      includeExperimental?: boolean;
      includeDisabled?: boolean;
    }) => {
      const startedAt = new Date().toISOString();
      const cachePath = resolveManifestCachePath();
      const describedCachePath = describeManifestCachePath();

      let fetchResult;
      try {
        fetchResult = await fetchCapabilityManifest({ explicit: opts.baseUrl });
      } catch (err) {
        const prior = readManifestCache();
        if (err instanceof ManifestContractMismatchError) {
          if (prior) {
            if (opts.json) {
              console.log(JSON.stringify({
                status: "contract_mismatch_using_cache",
                error: { code: err.code, message: err.message },
                cache: {
                  host: prior.host,
                  fetchedAt: prior.fetchedAt,
                  total: prior.capabilities.length,
                  path: cachePath,
                },
              }, null, 2));
            } else {
              console.error(pc.yellow(`⚠ Contract version mismatch: ${err.message}`));
              console.error(pc.dim(`  Using cached manifest from ${prior.fetchedAt} (${prior.capabilities.length} capabilities).`));
              console.error(pc.dim(`  Cache: ${describedCachePath}`));
              console.error(pc.dim("  Hosted manifest was NOT overwritten. Run `growthub upgrade` or re-login if the contract version is supposed to match."));
            }
            process.exitCode = 0;
            return;
          }
          reportRefreshError(err, opts.json, describedCachePath);
          process.exitCode = 1;
          return;
        }

        if (err instanceof ManifestMalformedError) {
          if (prior) {
            if (opts.json) {
              console.log(JSON.stringify({
                status: "malformed_using_cache",
                error: { code: err.code, message: err.message },
                cache: {
                  host: prior.host,
                  fetchedAt: prior.fetchedAt,
                  total: prior.capabilities.length,
                  path: cachePath,
                },
              }, null, 2));
            } else {
              console.error(pc.yellow(`⚠ Hosted manifest was malformed: ${err.message}`));
              console.error(pc.dim(`  Using cached manifest from ${prior.fetchedAt} (${prior.capabilities.length} capabilities).`));
              console.error(pc.dim(`  Cache: ${describedCachePath}`));
            }
            process.exitCode = 0;
            return;
          }
          reportRefreshError(err, opts.json, describedCachePath);
          process.exitCode = 1;
          return;
        }

        if (
          err instanceof ManifestEndpointUnavailableError ||
          err instanceof ManifestUnauthenticatedError
        ) {
          reportRefreshError(err, opts.json, describedCachePath);
          process.exitCode = 1;
          return;
        }

        reportRefreshError(err, opts.json, describedCachePath);
        process.exitCode = 1;
        return;
      }

      const { envelope, resolvedBaseUrl, serverContractVersion } = fetchResult;
      const prior = readManifestCache();
      const diffSummary = diffManifestEnvelopes(prior, envelope, { comparedAt: startedAt });

      try {
        writeManifestCache(envelope);
      } catch (writeErr) {
        const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
        if (opts.json) {
          console.log(JSON.stringify({
            status: "fetched_but_cache_write_failed",
            error: message,
            host: envelope.host,
            fetchedAt: envelope.fetchedAt,
            total: envelope.capabilities.length,
            cachePath,
          }, null, 2));
        } else {
          console.error(pc.yellow(`⚠ Manifest fetched but cache write failed: ${message}`));
          console.error(pc.dim(`  Cache path: ${describedCachePath}`));
        }
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({
          status: "ok",
          host: envelope.host,
          resolvedBaseUrl: resolvedBaseUrl.baseUrl,
          resolvedBaseUrlSource: resolvedBaseUrl.source,
          fetchedAt: envelope.fetchedAt,
          contractVersion: serverContractVersion,
          total: envelope.capabilities.length,
          added: diffSummary.added,
          removed: diffSummary.removed,
          changed: diffSummary.changed,
          changeDetails: diffSummary.changeDetails,
          drift: diffSummary.report,
          cachePath,
        }, null, 2));
        return;
      }

      printRefreshSummary({
        envelope,
        diff: diffSummary,
        resolvedBaseUrl: resolvedBaseUrl.baseUrl,
        resolvedBaseUrlSource: resolvedBaseUrl.source,
        cachePath: describedCachePath,
        serverContractVersion,
        includeExperimental: opts.includeExperimental === true,
        includeDisabled: opts.includeDisabled === true,
      });
    });
}

// ---------------------------------------------------------------------------
// Refresh summary renderer
// ---------------------------------------------------------------------------

function reportRefreshError(err: unknown, json: boolean | undefined, describedCachePath: string): void {
  if (json) {
    const payload = err instanceof ManifestClientError
      ? { status: "error", code: err.code, message: err.message }
      : { status: "error", code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
    console.log(JSON.stringify({ ...payload, cachePath: describedCachePath }, null, 2));
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ManifestUnauthenticatedError) {
    console.error(pc.red("✗ Not authenticated: ") + message);
  } else if (err instanceof ManifestEndpointUnavailableError) {
    console.error(pc.red("✗ Hosted manifest endpoint unavailable: ") + message);
  } else if (err instanceof ManifestContractMismatchError) {
    console.error(pc.red("✗ Contract version mismatch: ") + message);
    console.error(pc.dim("  No local cache is present to fall back on."));
  } else if (err instanceof ManifestMalformedError) {
    console.error(pc.red("✗ Hosted manifest malformed: ") + message);
    console.error(pc.dim("  No local cache is present to fall back on."));
  } else {
    console.error(pc.red("✗ Failed to refresh manifest: ") + message);
  }
  console.error(pc.dim(`  Cache path: ${describedCachePath}`));
}

function printRefreshSummary(args: {
  envelope: import("@growthub/api-contract").CapabilityManifestEnvelope;
  diff: ManifestDriftSummary;
  resolvedBaseUrl: string;
  resolvedBaseUrlSource: string;
  cachePath: string;
  serverContractVersion: string | null;
  includeExperimental: boolean;
  includeDisabled: boolean;
}): void {
  const { envelope, diff, resolvedBaseUrl, resolvedBaseUrlSource, cachePath, serverContractVersion } = args;
  const { added, removed, changed, changeDetails } = diff;

  console.log("");
  console.log(pc.bold("CMS Capability Manifest — Refresh"));
  console.log(hr());
  console.log(`  ${pc.dim("Host:")}            ${envelope.host}`);
  console.log(`  ${pc.dim("Resolved base:")}   ${resolvedBaseUrl} ${pc.dim(`(${resolvedBaseUrlSource})`)}`);
  console.log(`  ${pc.dim("Fetched at:")}      ${envelope.fetchedAt}`);
  if (serverContractVersion !== null) {
    console.log(`  ${pc.dim("Contract version:")} ${serverContractVersion}`);
  }
  console.log(`  ${pc.dim("Source:")}          ${envelope.source}`);
  console.log(`  ${pc.dim("Total:")}           ${envelope.capabilities.length}`);
  console.log(`  ${pc.dim("Added:")}           ${added.length > 0 ? pc.green(String(added.length)) : pc.dim("0")}`);
  console.log(`  ${pc.dim("Removed:")}         ${removed.length > 0 ? pc.red(String(removed.length)) : pc.dim("0")}`);
  console.log(`  ${pc.dim("Changed:")}         ${changed.length > 0 ? pc.yellow(String(changed.length)) : pc.dim("0")}`);
  console.log(`  ${pc.dim("Cache:")}           ${cachePath}`);
  console.log(hr());

  if (added.length > 0) {
    console.log(pc.green("\n  + Added"));
    for (const slug of added) {
      const entry = envelope.capabilities.find((c) => c.slug === slug);
      const label = entry?.displayName ? pc.dim(`  ${entry.displayName}`) : "";
      console.log(`    ${pc.bold(slug)}${label}`);
    }
  }

  if (removed.length > 0) {
    console.log(pc.red("\n  − Removed"));
    for (const slug of removed) {
      console.log(`    ${pc.bold(slug)}`);
    }
  }

  if (changed.length > 0) {
    console.log(pc.yellow("\n  ~ Changed"));
    for (const slug of changed) {
      console.log(`    ${pc.bold(slug)}`);
      for (const detail of changeDetails[slug] ?? []) {
        console.log(`      ${pc.dim("·")} ${pc.dim(detail)}`);
      }
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log(pc.dim("\n  No drift detected since the last cached manifest."));
  }

  console.log("");
  console.log(pc.dim("  growthub capability list     # browse refreshed registry"));
  console.log(pc.dim("  growthub capability inspect <slug>"));
  console.log("");
}
