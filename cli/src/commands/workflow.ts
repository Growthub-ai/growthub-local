/**
 * CLI Commands — workflow
 *
 * Auth-gated workflow discovery and pipeline assembly.
 *
 * If the user is not authenticated (no active growthub auth session),
 * the workflow path remains greyed out in the discovery hub. When
 * authenticated, the user sees:
 *
 *   🔗 Workflows
 *     ├── Saved Workflows    (user-persisted pipelines)
 *     └── Templates          (CMS workflow node starter templates)
 *
 * Templates are the real production CMS workflow_node records.
 * Only top-level items get emoji; sub-items have clean titles.
 * Pagination at 10 options with extended view and search.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import { getWorkflowAccess } from "../auth/workflow-access.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import {
  fetchHostedWorkflow,
  listHostedWorkflows,
  saveHostedWorkflow,
  HostedEndpointUnavailableError,
} from "../auth/hosted-client.js";
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
  createPipelineBuilder,
  deserializePipeline,
  type DynamicRegistryPipeline,
} from "../runtime/dynamic-registry-pipeline/index.js";
import { executeHostedPipeline, runPipelineAssembler } from "./pipeline.js";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { resolvePaperclipHomeDir } from "../config/home.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const FAMILY_CONFIG: Record<string, { color: (s: string) => string; label: string }> = {
  video:    { color: pc.magenta, label: "Video" },
  image:    { color: pc.cyan,    label: "Image" },
  slides:   { color: pc.yellow,  label: "Slides" },
  text:     { color: pc.green,   label: "Text" },
  data:     { color: pc.blue,    label: "Data" },
  ops:      { color: pc.red,     label: "Ops" },
  research: { color: pc.blue,    label: "Research" },
  vision:   { color: pc.cyan,    label: "Vision" },
};

function familyLabel(family: string): string {
  const cfg = FAMILY_CONFIG[family];
  return cfg ? cfg.color(cfg.label) : family;
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
// Auth gate
// ---------------------------------------------------------------------------

function isAuthenticated(): boolean {
  const session = readSession();
  if (!session) return false;
  return !isSessionExpired(session);
}

// ---------------------------------------------------------------------------
// Saved workflows directory
// ---------------------------------------------------------------------------

function resolveSavedWorkflowsDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "workflows");
}

interface SavedWorkflowEntry {
  filename?: string;
  workflowId: string;
  pipelineId: string;
  name: string;
  nodeCount: number;
  executionMode: string;
  createdAt: string;
  updatedAt?: string;
  versionCount?: number;
  source: "hosted" | "local";
}

function buildHostedWorkflowConfig(pipeline: {
  pipelineId: string;
  nodes: Array<{ id: string; slug: string; bindings: Record<string, unknown>; upstreamNodeIds?: string[] }>;
}): Record<string, unknown> {
  const cmsNodes = pipeline.nodes.map((node, index) => ({
    id: node.id,
    type: "cmsNode",
    position: { x: (index + 1) * 300, y: 0 },
    data: {
      slug: node.slug,
      inputs: node.bindings,
    },
  }));

  const edges: Array<Record<string, unknown>> = [];
  for (const node of pipeline.nodes) {
    const upstreamNodeIds = node.upstreamNodeIds ?? [];
    if (upstreamNodeIds.length === 0) {
      edges.push({
        id: `e-start-1-${node.id}`,
        source: "start-1",
        target: node.id,
      });
      continue;
    }
    for (const upstreamNodeId of upstreamNodeIds) {
      edges.push({
        id: `e-${upstreamNodeId}-${node.id}`,
        source: upstreamNodeId,
        target: node.id,
      });
    }
  }

  const upstreamSources = new Set(
    pipeline.nodes.flatMap((node) => node.upstreamNodeIds ?? []),
  );

  for (const node of pipeline.nodes) {
    if (!upstreamSources.has(node.id)) {
      edges.push({
        id: `e-${node.id}-end-1`,
        source: node.id,
        target: "end-1",
      });
    }
  }

  return {
    name: pipeline.pipelineId,
    nodes: [
      { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: {} },
      ...cmsNodes,
      { id: "end-1", type: "end", position: { x: (cmsNodes.length + 1) * 300, y: 0 }, data: {} },
    ],
    edges,
  };
}

function listLocalSavedWorkflows(): SavedWorkflowEntry[] {
  const dir = resolveSavedWorkflowsDir();
  if (!fs.existsSync(dir)) return [];

  const entries: Array<SavedWorkflowEntry | null> = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.resolve(dir, e.name), "utf-8"));
        const pipeline = raw.pipeline ?? raw;
        return {
          filename: e.name,
          workflowId: pipeline.metadata?.hostedWorkflowId ?? pipeline.pipelineId ?? e.name.replace(".json", ""),
          pipelineId: pipeline.pipelineId ?? e.name.replace(".json", ""),
          name: pipeline.metadata?.workflowName ?? pipeline.pipelineId ?? e.name.replace(".json", ""),
          nodeCount: Array.isArray(pipeline.nodes) ? pipeline.nodes.length : 0,
          executionMode: pipeline.executionMode ?? "hosted",
          createdAt: raw.createdAt ?? "",
          source: "local",
        } satisfies SavedWorkflowEntry;
      } catch {
        return null;
      }
    });

  return entries
    .filter((entry): entry is SavedWorkflowEntry => entry !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listSavedWorkflows(): Promise<SavedWorkflowEntry[]> {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    return listLocalSavedWorkflows();
  }

  try {
    const response = await listHostedWorkflows(session);
    if (!response || !Array.isArray(response.workflows)) return listLocalSavedWorkflows();

    return response.workflows.map((workflow) => ({
      workflowId: workflow.workflowId,
      pipelineId: workflow.workflowId,
      name: workflow.name,
      nodeCount: workflow.latestVersion?.nodeCount ?? 0,
      executionMode: "hosted",
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      versionCount: workflow.versionCount,
      source: "hosted",
    }));
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      return listLocalSavedWorkflows();
    }
    throw err;
  }
}

async function loadSavedWorkflowDetail(entry: SavedWorkflowEntry): Promise<{
  pipeline: Record<string, unknown>;
  createdAt: string;
}> {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while loading workflow detail.");
    }
    const detail = await fetchHostedWorkflow(session, entry.workflowId);
    if (!detail) {
      throw new Error(`Hosted workflow ${entry.workflowId} not found.`);
    }
    return {
      pipeline: (detail.latestVersion.config ?? {}) as Record<string, unknown>,
      createdAt: detail.latestVersion.createdAt,
    };
  }

  const dir = resolveSavedWorkflowsDir();
  const content = fs.readFileSync(path.resolve(dir, entry.filename!), "utf-8");
  const raw = JSON.parse(content);
  return {
    pipeline: (raw.pipeline ?? raw) as Record<string, unknown>,
    createdAt: raw.createdAt ?? "",
  };
}

function toDynamicPipelineFromHostedWorkflow(
  entry: SavedWorkflowEntry,
  pipeline: Record<string, unknown>,
): DynamicRegistryPipeline {
  const rawNodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
  const rawEdges = Array.isArray(pipeline.edges) ? pipeline.edges : [];
  const cmsNodes = rawNodes.filter((node): node is Record<string, unknown> => {
    return typeof node === "object" && node !== null && (node as { type?: unknown }).type === "cmsNode";
  });

  const upstreamNodeIdsByTarget = new Map<string, string[]>();
  for (const edge of rawEdges) {
    if (typeof edge !== "object" || edge === null) continue;
    const source = typeof (edge as { source?: unknown }).source === "string"
      ? (edge as { source: string }).source
      : null;
    const target = typeof (edge as { target?: unknown }).target === "string"
      ? (edge as { target: string }).target
      : null;
    if (!source || !target || source === "start-1" || target === "end-1") continue;
    const existing = upstreamNodeIdsByTarget.get(target) ?? [];
    existing.push(source);
    upstreamNodeIdsByTarget.set(target, existing);
  }

  return {
    pipelineId: entry.pipelineId,
    executionMode: "hosted",
    nodes: cmsNodes.map((node) => {
      const id = typeof node.id === "string" ? node.id : `node-${Math.random().toString(36).slice(2, 8)}`;
      const data = typeof node.data === "object" && node.data !== null
        ? node.data as { slug?: unknown; inputs?: unknown }
        : {};
      return {
        id,
        slug: typeof data.slug === "string" ? data.slug : id,
        bindings:
          typeof data.inputs === "object" && data.inputs !== null
            ? data.inputs as Record<string, unknown>
            : {},
        upstreamNodeIds: upstreamNodeIdsByTarget.get(id),
      };
    }),
    metadata: {
      hostedWorkflowId: entry.workflowId,
      workflowName: entry.name,
    },
  };
}

function toExecutableSavedWorkflowPipeline(
  entry: SavedWorkflowEntry,
  pipeline: Record<string, unknown>,
): DynamicRegistryPipeline {
  const looksLikeDynamicPipeline =
    Array.isArray(pipeline.nodes) &&
    pipeline.nodes.every((node) => {
      if (typeof node !== "object" || node === null) return false;
      const record = node as Record<string, unknown>;
      return typeof record.id === "string" && typeof record.slug === "string";
    });

  if (looksLikeDynamicPipeline) {
    const parsed = deserializePipeline(pipeline);
    return {
      ...parsed,
      metadata: {
        ...(parsed.metadata ?? {}),
        hostedWorkflowId: entry.workflowId,
        workflowName: entry.name,
      },
    };
  }

  return toDynamicPipelineFromHostedWorkflow(entry, pipeline);
}

// ---------------------------------------------------------------------------
// Paginated select helper
// ---------------------------------------------------------------------------

interface PaginatedOption<T> {
  value: T;
  label: string;
  hint?: string;
}

async function paginatedSelect<T extends string>(
  message: string,
  allOptions: PaginatedOption<T>[],
  opts?: {
    backValue?: string;
    backLabel?: string;
    searchEnabled?: boolean;
  },
): Promise<T | "__back" | "__search" | symbol> {
  let offset = 0;
  let filtered = allOptions;

  while (true) {
    const page = filtered.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < filtered.length;
    const hasPrev = offset > 0;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    const pageInfo = filtered.length > PAGE_SIZE
      ? pc.dim(` (${currentPage}/${totalPages} · ${filtered.length} total)`)
      : "";

    const options: Array<{ value: string; label: string; hint?: string }> = [
      ...page.map((o) => ({
        value: o.value as string,
        label: o.label,
        hint: o.hint,
      })),
    ];

    if (hasMore) {
      options.push({ value: "__next_page", label: pc.dim("→ Next page") });
    }
    if (hasPrev) {
      options.push({ value: "__prev_page", label: pc.dim("← Previous page") });
    }
    if (opts?.searchEnabled) {
      options.push({ value: "__search", label: pc.dim("🔎 Search") });
    }
    options.push({
      value: opts?.backValue ?? "__back",
      label: opts?.backLabel ?? "← Back",
    });

    const choice = await p.select({
      message: message + pageInfo,
      options,
    });

    if (p.isCancel(choice)) return choice;

    if (choice === "__next_page") {
      offset += PAGE_SIZE;
      continue;
    }
    if (choice === "__prev_page") {
      offset = Math.max(0, offset - PAGE_SIZE);
      continue;
    }
    if (choice === "__search") {
      const term = await p.text({
        message: "Search workflows and templates",
        placeholder: "Type to filter...",
      });
      if (p.isCancel(term)) return term;
      const searchStr = (term as string).toLowerCase().trim();
      if (searchStr) {
        filtered = allOptions.filter((o) => {
          const haystack = `${o.value} ${o.label} ${o.hint ?? ""}`.toLowerCase();
          return haystack.includes(searchStr);
        });
        offset = 0;
        if (filtered.length === 0) {
          p.note(`No results for "${term}".`, "No matches");
          filtered = allOptions;
        }
      } else {
        filtered = allOptions;
        offset = 0;
      }
      continue;
    }

    return choice as T | "__back";
  }
}

// ---------------------------------------------------------------------------
// Template detail card
// ---------------------------------------------------------------------------

function printTemplateCard(node: CmsCapabilityNode): void {
  const lines = [
    `${pc.bold(node.displayName)}  ${pc.dim(node.slug)}`,
    `${familyLabel(node.family)}  ${node.enabled ? pc.green("enabled") : pc.red("disabled")}`,
    "",
    `${pc.dim("Category:")}   ${node.category}`,
    `${pc.dim("Node Type:")}  ${node.nodeType}`,
    `${pc.dim("Execution:")}  ${node.executionBinding.strategy}`,
    `${pc.dim("Tool:")}       ${node.executionTokens.tool_name}`,
    `${pc.dim("Outputs:")}    ${node.outputTypes.join(", ")}`,
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
// Interactive workflow picker — main entry
// ---------------------------------------------------------------------------

export async function runWorkflowPicker(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();

  const access = getWorkflowAccess();

  if (access.state === "unauthenticated") {
    p.intro(pc.bold("Workflows") + pc.dim(" (not connected)"));
    p.note(
      [
        "Workflow assembly requires an authenticated Growthub session.",
        "Run " + pc.cyan("growthub auth login") + " to connect your account.",
        "",
        "Once connected you can:",
        "  - Browse CMS workflow node templates",
        "  - Assemble dynamic pipelines from starter templates",
        "  - Save and execute workflows",
      ].join("\n"),
      "Authentication Required",
    );
    if (opts.allowBackToHub) return "back";
    return "done";
  }

  p.intro(pc.bold("Workflows"));

  while (true) {
    const refreshedAccess = getWorkflowAccess();
    const topChoice = await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "saved",
          label: "Saved Workflows",
          hint: "Your previously assembled pipelines",
        },
        {
          value: "templates",
          label: refreshedAccess.state === "ready"
            ? "Templates"
            : pc.dim("Templates (locked)"),
          hint: refreshedAccess.state === "ready"
            ? "CMS workflow node starter templates"
            : refreshedAccess.reason,
        },
        {
          value: "pipelines",
          label: refreshedAccess.state === "ready"
            ? "🔗 Dynamic Pipelines"
            : pc.dim("🔗 Dynamic Pipelines (locked)"),
          hint: refreshedAccess.state === "ready"
            ? "Assemble and execute dynamic registry pipelines"
            : refreshedAccess.reason,
        },
        ...(opts.allowBackToHub ? [{ value: "__back_to_hub", label: "← Back to main menu" }] : []),
      ],
    });

    if (p.isCancel(topChoice)) { p.cancel("Cancelled."); process.exit(0); }
    if (topChoice === "__back_to_hub") return "back";

    if (topChoice === "templates" && refreshedAccess.state !== "ready") {
      p.note(
        [
          "Templates are only available when the hosted user is linked to this local machine.",
          refreshedAccess.reason,
        ].join("\n"),
        "Growthub Local Machine Required",
      );
      continue;
    }

    if (topChoice === "pipelines") {
      if (refreshedAccess.state !== "ready") {
        p.note(
          [
            "Dynamic Pipelines are only available when the hosted user is linked to this local machine.",
            refreshedAccess.reason,
          ].join("\n"),
          "Growthub Local Machine Required",
        );
        continue;
      }
      const result = await runPipelineAssembler({ allowBackToHub: true });
      if (result === "back") {
        continue;
      }
      return "done";
    }

    // ── Saved Workflows ──────────────────────────────────────────────────
    if (topChoice === "saved") {
      while (true) {
        const savedSpinner = p.spinner();
        savedSpinner.start("Loading saved workflows...");
        let saved: SavedWorkflowEntry[];

        try {
          saved = await listSavedWorkflows();
          savedSpinner.stop(`Loaded ${saved.length} saved workflow${saved.length === 1 ? "" : "s"}.`);
        } catch (err) {
          savedSpinner.stop(pc.red("Failed to load saved workflows."));
          throw err;
        }

        if (saved.length === 0) {
          p.note(
            [
              "No saved workflows found.",
              "Use " + pc.cyan("Templates") + " to assemble a new workflow,",
              "or " + pc.cyan("growthub pipeline assemble") + " from the command line.",
            ].join("\n"),
            "Nothing saved",
          );
          break;
        }

        const allOptions = saved.map((w) => ({
          value: w.workflowId,
          label: `${w.name}  ${pc.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}`)}`,
          hint: `${w.executionMode} · ${w.updatedAt?.slice(0, 10) ?? w.createdAt.slice(0, 10)}`,
        }));

        const choice = await paginatedSelect("Select a saved workflow", allOptions, {
          backLabel: "← Back to workflow menu",
          searchEnabled: true,
        });

        if (p.isCancel(choice)) { p.cancel("Cancelled."); process.exit(0); }
        if (choice === "__back") break;

        // Show workflow detail
        const entry = saved.find((w) => w.workflowId === choice);
        if (entry) {
          const detailSpinner = p.spinner();
          detailSpinner.start(`Loading ${entry.name}...`);
          let detail: { pipeline: Record<string, unknown>; createdAt: string };

          try {
            detail = await loadSavedWorkflowDetail(entry);
            detailSpinner.stop(`Loaded ${entry.name}.`);
          } catch (err) {
            detailSpinner.stop(pc.red(`Failed to load ${entry.name}.`));
            p.log.error((err as Error).message);
            continue;
          }

          const pipeline = detail.pipeline;
          const nodes = Array.isArray((pipeline as any).nodes) ? (pipeline as any).nodes : [];

          console.log("");
          console.log(box([
            `${pc.bold("Workflow:")} ${entry.name}`,
            `${pc.dim("ID:")} ${entry.workflowId}`,
            `${pc.dim("Mode:")} hosted  ${pc.dim("Nodes:")} ${nodes.length}`,
            `${pc.dim("Created:")} ${detail.createdAt || "—"}`,
            "",
            ...nodes.map((n: { data?: { slug?: string }; id: string; slug?: string }, i: number) =>
              `${pc.dim(String(i + 1) + ".")} ${pc.bold(n.data?.slug ?? n.slug ?? n.id)} ${pc.dim(n.id)}`,
            ),
          ]));
          console.log("");

          const nextAction = await p.select({
            message: "Action",
            options: [
              { value: "execute", label: "Execute saved workflow" },
              { value: "back_to_saved", label: "← Back to saved workflows" },
            ],
          });

          if (p.isCancel(nextAction)) { p.cancel("Cancelled."); process.exit(0); }
          if (nextAction === "execute") {
            const confirmed = await p.confirm({
              message: `Execute ${entry.name} now?`,
              initialValue: false,
            });
            if (p.isCancel(confirmed) || !confirmed) {
              continue;
            }

            const finalConfirmed = await p.confirm({
              message: "This will run the hosted workflow and may spend credits. Continue?",
              initialValue: false,
            });
            if (p.isCancel(finalConfirmed) || !finalConfirmed) {
              continue;
            }

            try {
              const executablePipeline = toExecutableSavedWorkflowPipeline(entry, pipeline);
              await executeHostedPipeline(executablePipeline);
              p.log.success(`Saved workflow execution completed for ${pc.bold(entry.name)}.`);
            } catch (err) {
              p.log.error("Saved workflow execution failed: " + (err as Error).message);
            }
          }
        }
      }
      continue;
    }

    // ── Templates ────────────────────────────────────────────────────────
    if (topChoice === "templates") {
      const registry = createCmsCapabilityRegistryClient();

      while (true) {
        // Family filter
        const availableFamilies = CAPABILITY_FAMILIES.filter((f) => {
          const { nodes } = registry.listBuiltinCapabilities({ family: f });
          return nodes.length > 0;
        });

        const familyChoice = await p.select({
          message: "Filter by family",
          options: [
            { value: "all", label: "All Templates" },
            ...availableFamilies.map((f) => {
              const cfg = FAMILY_CONFIG[f];
              return {
                value: f,
                label: cfg ? cfg.label : f,
              };
            }),
            { value: "__back_to_workflow_menu", label: "← Back to workflow menu" },
          ],
        });

        if (p.isCancel(familyChoice)) { p.cancel("Cancelled."); process.exit(0); }
        if (familyChoice === "__back_to_workflow_menu") break;

        const query = familyChoice === "all"
          ? undefined
          : { family: familyChoice as CapabilityFamily };

        let templates: CmsCapabilityNode[];
        try {
          const result = registry.listBuiltinCapabilities(query);
          templates = result.nodes;
        } catch (err) {
          p.log.error("Failed to load templates: " + (err as Error).message);
          continue;
        }

        if (templates.length === 0) {
          p.note("No templates for that family.", "Nothing found");
          continue;
        }

        // Template list with pagination and search
        while (true) {
          const templateOptions = templates.map((t) => ({
            value: t.slug,
            label: `${t.icon}  ${t.displayName}`,
            hint: t.description?.slice(0, 55),
          }));

          const templateChoice = await paginatedSelect(
            "Select a template",
            templateOptions,
            {
              backLabel: "← Back to family filter",
              searchEnabled: true,
            },
          );

          if (p.isCancel(templateChoice)) { p.cancel("Cancelled."); process.exit(0); }
          if (templateChoice === "__back") break;

          const selected = templates.find((t) => t.slug === templateChoice);
          if (!selected) continue;

          printTemplateCard(selected);

          // Template actions
          while (true) {
            const action = await p.select({
              message: "What would you like to do with this template?",
              options: [
                { value: "assemble", label: "Assemble a pipeline from this template" },
                { value: "resolve", label: "Check machine binding" },
                { value: "inspect_json", label: "Print input template as JSON" },
                { value: "back_to_templates", label: "← Back to template list" },
              ],
            });

            if (p.isCancel(action)) { p.cancel("Cancelled."); process.exit(0); }
            if (action === "back_to_templates") break;

            if (action === "resolve") {
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
                  ]));
                  console.log("");
                }
              } catch (err) {
                p.log.error("Resolution failed: " + (err as Error).message);
              }
              continue;
            }

            if (action === "inspect_json") {
              console.log(JSON.stringify(selected.executionTokens.input_template, null, 2));
              continue;
            }

            if (action === "assemble") {
              // Quick pipeline assembly from template
              const builder = createPipelineBuilder({ executionMode: "hosted" });

              // Pre-fill bindings from template input_template
              const bindings: Record<string, unknown> = {};
              const inputKeys = Object.keys(selected.executionTokens.input_template);

              for (const key of inputKeys) {
                const defaultVal = selected.executionTokens.input_template[key];
                const displayDefault = typeof defaultVal === "string" ? defaultVal : JSON.stringify(defaultVal);

                if (typeof defaultVal === "string" && defaultVal === "") {
                  const value = await p.text({
                    message: `${selected.displayName} → ${key}`,
                    placeholder: `Enter ${key}`,
                  });
                  if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
                  bindings[key] = value;
                } else {
                  bindings[key] = defaultVal;
                }
              }

              const nodeId = builder.addNode(selected.slug, bindings);
              p.log.success(`Added ${pc.bold(selected.displayName)} (${pc.dim(nodeId)})`);

              // Ask if they want to add more nodes or save
              const next = await p.select({
                message: "Pipeline has 1 node. What next?",
                options: [
                  { value: "save", label: "Save pipeline" },
                  { value: "back_to_templates", label: "← Back to templates" },
                ],
              });

              if (p.isCancel(next)) { p.cancel("Cancelled."); process.exit(0); }

              if (next === "save") {
                const pipeline = builder.build();

                const session = readSession();
                if (!session || isSessionExpired(session)) {
                  throw new Error("Hosted session expired. Run `growthub auth login` again.");
                }

                const workflowName = `${selected.displayName} Workflow`;
                const saveResult = await saveHostedWorkflow(session, {
                  name: workflowName,
                  description: selected.description ?? "",
                  config: buildHostedWorkflowConfig(pipeline),
                });

                if (!saveResult || typeof saveResult.workflowId !== "string") {
                  throw new Error("Hosted workflow save returned no payload.");
                }

                p.log.success(
                  `Hosted workflow saved as ${pc.bold(workflowName)} (${pc.dim(saveResult.workflowId)} · v${saveResult.version})`,
                );
              }
              break;
            }
          }
        }
      }
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkflowCommands(program: Command): void {
  const wf = program
    .command("workflow")
    .description("Browse workflow templates and manage saved pipelines (requires auth)")
    .addHelpText("after", `
Examples:
  $ growthub workflow                       # interactive workflow browser
  $ growthub workflow templates             # list CMS workflow node templates
  $ growthub workflow templates --json      # machine-readable output
  $ growthub workflow saved                 # list saved workflows
`);

  wf.action(async () => {
    await runWorkflowPicker({});
  });

  // ── templates ───────────────────────────────────────────────────────────
  wf
    .command("templates")
    .description("List CMS workflow node starter templates")
    .option("--family <family>", "Filter by family")
    .option("--search <term>", "Search templates")
    .option("--json", "Output raw JSON")
    .action(async (opts: { family?: string; search?: string; json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      const registry = createCmsCapabilityRegistryClient();
      const query: Record<string, unknown> = {};
      if (opts.family) query.family = opts.family;
      if (opts.search) query.search = opts.search;

      try {
        const { nodes, meta } = await registry.listCapabilities(
          Object.keys(query).length > 0 ? query as any : undefined,
        );

        if (opts.json) {
          console.log(JSON.stringify({ nodes, meta }, null, 2));
          return;
        }

        if (nodes.length === 0) {
          console.error(pc.yellow("No templates found."));
          process.exitCode = 1;
          return;
        }

        console.log("");
        console.log(
          pc.bold("Workflow Node Templates") +
          pc.dim(`  ${nodes.length} template${nodes.length !== 1 ? "s" : ""}`),
        );
        console.log(hr());

        for (const node of nodes) {
          const enabledTag = node.enabled ? pc.green("enabled") : pc.red("disabled");
          console.log(`  ${node.icon}  ${pc.bold(node.displayName)}  ${pc.dim(node.slug)}  ${enabledTag}`);
          if (node.description) {
            console.log(`     ${pc.dim(node.description)}`);
          }
          console.log("");
        }

        console.log(hr());
        console.log(pc.dim(`  Source: ${meta.source}  ·  growthub workflow`));
        console.log("");
      } catch (err) {
        console.error(pc.red("Failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── saved ───────────────────────────────────────────────────────────────
  wf
    .command("saved")
    .description("List saved workflow pipelines")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const saved = await listSavedWorkflows();

      if (opts.json) {
        console.log(JSON.stringify(saved, null, 2));
        return;
      }

      if (saved.length === 0) {
        console.log(pc.dim("No saved workflows. Run `growthub workflow` to assemble one."));
        return;
      }

      console.log("");
      console.log(
        pc.bold("Saved Workflows") +
        pc.dim(`  ${saved.length} workflow${saved.length !== 1 ? "s" : ""}`),
      );
      console.log(hr());

      for (const w of saved) {
        console.log(
          `  ${pc.bold(w.name)}  ` +
          pc.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}  ·  ${w.executionMode}  ·  ${w.updatedAt?.slice(0, 10) ?? w.createdAt.slice(0, 10)}`),
        );
      }

      console.log("");
      console.log(pc.dim(`  Source: ${saved[0]?.source === "hosted" ? "hosted workflow registry" : resolveSavedWorkflowsDir()}`));
      console.log("");
    });
}
