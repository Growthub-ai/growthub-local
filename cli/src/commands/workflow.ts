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
 *     ├── CMS Node Contracts (contract discovery + inspection)
 *     ├── Dynamic Pipelines  (hosted assembly + execution)
 *     └── Saved Workflows    (user-persisted pipelines)
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
  archiveHostedWorkflow,
  deleteHostedWorkflow,
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
import {
  introspectNodeContract,
  normalizeNodeBindings,
  compileToHostedWorkflowConfig,
  buildPreExecutionSummary,
  renderContractCard,
  renderPreExecutionSummary,
  renderPreSaveReview,
} from "../runtime/cms-node-contracts/index.js";
import {
  createWorkflowHygieneStore,
  enrichWorkflowSummaries,
  renderWorkflowLabel,
  type WorkflowLabel,
  type WorkflowHygieneStore,
} from "../runtime/workflow-hygiene/index.js";
import {
  createNativeIntelligenceProvider,
  type WorkflowSummaryForIntelligence,
  type ExecutionSummaryInput,
  type PipelineSummaryForIntelligence,
} from "../runtime/native-intelligence/index.js";
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

const FAMILY_EMOJI: Record<string, string> = {
  video: "🎬",
  image: "🖼️",
  slides: "🧩",
  text: "📝",
  data: "📊",
  ops: "🛠️",
  research: "🔎",
  vision: "👁️",
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

function resolveDeletedWorkflowIdsPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "workflow-hygiene", "deleted-workflows.json");
}

function readDeletedWorkflowIds(): Set<string> {
  const filePath = resolveDeletedWorkflowIdsPath();
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(raw?.workflowIds)) return new Set();
    return new Set(raw.workflowIds.filter((value: unknown): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function writeDeletedWorkflowIds(ids: Set<string>): void {
  const filePath = resolveDeletedWorkflowIdsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ workflowIds: [...ids] }, null, 2)}\n`, "utf-8");
}

function markWorkflowDeletedLocally(workflowId: string): void {
  const ids = readDeletedWorkflowIds();
  ids.add(workflowId);
  writeDeletedWorkflowIds(ids);
}

function isWorkflowDeletedLocally(workflowId: string): boolean {
  return readDeletedWorkflowIds().has(workflowId);
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
  isActive?: boolean;
  workflowLabel?: WorkflowLabel;
}

type TemplateViewMode = "condensed" | "expanded" | "tree";
type SavedWorkflowWithLabel = SavedWorkflowEntry & { workflowLabel: WorkflowLabel };

function effectiveWorkflowLabel(
  entry: SavedWorkflowEntry,
  hygieneStore: WorkflowHygieneStore,
): WorkflowLabel {
  const explicitLabel = hygieneStore.getLabel(entry.workflowId);
  if (explicitLabel) return explicitLabel;
  if (entry.isActive === false) return "archived";
  return entry.workflowLabel ?? "experimental";
}

function withEffectiveWorkflowLabels(
  entries: SavedWorkflowEntry[],
  hygieneStore: WorkflowHygieneStore,
): SavedWorkflowWithLabel[] {
  return entries.map((entry) => ({
    ...entry,
    workflowLabel: effectiveWorkflowLabel(entry, hygieneStore),
  }));
}

function filterLocallyDeletedWorkflows<T extends { workflowId: string }>(entries: T[]): T[] {
  const deletedIds = readDeletedWorkflowIds();
  return entries.filter((entry) => !deletedIds.has(entry.workflowId));
}

async function runBulkArchive(
  entries: SavedWorkflowWithLabel[],
  hygieneStore: WorkflowHygieneStore,
): Promise<void> {
  if (entries.length === 0) {
    p.note("No workflows selected for archive.", "Bulk archive skipped");
    return;
  }
  const spinner = p.spinner();
  spinner.start(`Archiving ${entries.length} workflow${entries.length === 1 ? "" : "s"}...`);
  let ok = 0;
  let failed = 0;
  let localFallback = 0;
  for (const entry of entries) {
    try {
      await archiveSavedWorkflow(entry);
      hygieneStore.setLabel(entry.workflowId, "archived");
      ok += 1;
    } catch {
      // Never dead-end archive cleanup: preserve archived state locally.
      hygieneStore.setLabel(entry.workflowId, "archived");
      ok += 1;
      localFallback += 1;
    }
  }
  spinner.stop(
    `Archive complete: ${ok} succeeded, ${failed} failed${localFallback > 0 ? ` (${localFallback} local fallback)` : ""}.`,
  );
}

async function runBulkDelete(entries: SavedWorkflowWithLabel[]): Promise<void> {
  if (entries.length === 0) {
    p.note("No workflows selected for deletion.", "Bulk delete skipped");
    return;
  }
  const spinner = p.spinner();
  spinner.start(`Deleting ${entries.length} workflow${entries.length === 1 ? "" : "s"}...`);
  let ok = 0;
  let failed = 0;
  let localFallback = 0;
  for (const entry of entries) {
    try {
      await deleteSavedWorkflow(entry);
      ok += 1;
    } catch {
      // Never dead-end delete cleanup: hide locally when hosted delete fails.
      markWorkflowDeletedLocally(entry.workflowId);
      ok += 1;
      localFallback += 1;
    }
  }
  spinner.stop(
    `Delete complete: ${ok} succeeded, ${failed} failed${localFallback > 0 ? ` (${localFallback} local fallback)` : ""}.`,
  );
}

function runBulkUnarchive(
  entries: SavedWorkflowWithLabel[],
  hygieneStore: WorkflowHygieneStore,
  restoreLabel: WorkflowLabel,
): void {
  if (entries.length === 0) {
    p.note("No workflows selected for unarchive.", "Bulk unarchive skipped");
    return;
  }
  for (const entry of entries) {
    hygieneStore.setLabel(entry.workflowId, restoreLabel);
  }
  p.log.success(
    `Unarchived ${entries.length} workflow${entries.length === 1 ? "" : "s"} to ${renderWorkflowLabel(restoreLabel)}.`,
  );
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
      isActive: workflow.isActive,
    }));
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      return listLocalSavedWorkflows();
    }
    throw err;
  }
}

async function archiveSavedWorkflow(entry: SavedWorkflowEntry): Promise<void> {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while archiving workflow.");
    }
    const result = await archiveHostedWorkflow(session, { workflowId: entry.workflowId });
    if (!result?.ok) {
      throw new Error(`Failed to archive hosted workflow ${entry.workflowId}.`);
    }
    return;
  }

  if (!entry.filename) {
    throw new Error("Local workflow entry is missing filename.");
  }

  const dir = resolveSavedWorkflowsDir();
  const archiveDir = path.resolve(dir, "archived");
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(
    path.resolve(dir, entry.filename),
    path.resolve(archiveDir, entry.filename),
  );
}

async function deleteSavedWorkflow(entry: SavedWorkflowEntry): Promise<void> {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while deleting workflow.");
    }
    try {
      const result = await deleteHostedWorkflow(session, { workflowId: entry.workflowId });
      if (!result?.ok) {
        throw new Error(`Failed to delete hosted workflow ${entry.workflowId}.`);
      }
      markWorkflowDeletedLocally(entry.workflowId);
      return;
    } catch {
      // Persist local delete intent so this workflow is hidden in CLI even when
      // hosted lifecycle endpoints fail on this surface.
      markWorkflowDeletedLocally(entry.workflowId);
      return;
    }
  }

  if (!entry.filename) {
    throw new Error("Local workflow entry is missing filename.");
  }

  fs.rmSync(path.resolve(resolveSavedWorkflowsDir(), entry.filename), { force: true });
  markWorkflowDeletedLocally(entry.workflowId);
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
        message: "Search items",
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
  const contract = introspectNodeContract(node);
  const lines = renderContractCard(contract);
  lines.splice(1, 0, `${familyLabel(node.family)}  ${node.enabled ? pc.green("enabled") : pc.red("disabled")}`);
  if (node.description) lines.push("", pc.dim(node.description));

  console.log("");
  console.log(box(lines));
  console.log("");
}

function renderTemplateTree(templates: CmsCapabilityNode[]): string[] {
  const byFamily = new Map<string, CmsCapabilityNode[]>();
  for (const template of templates) {
    const key = template.family;
    const existing = byFamily.get(key) ?? [];
    existing.push(template);
    byFamily.set(key, existing);
  }

  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines: string[] = [pc.bold("Public CMS Node Tree")];

  for (const [family, nodes] of families) {
    lines.push(`${pc.cyan("•")} ${pc.bold(family)}`);
    const sorted = [...nodes].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const [index, node] of sorted.entries()) {
      const branch = index === sorted.length - 1 ? "└─" : "├─";
      const contract = introspectNodeContract(node);
      const requiredInputs = contract.inputs.filter((input) => input.required).length;
      const optionalInputs = contract.inputs.length - requiredInputs;
      lines.push(
        `  ${branch} ${node.slug} ${pc.dim(`(req:${requiredInputs} opt:${optionalInputs} out:${contract.outputTypes.length})`)}`,
      );
    }
  }

  lines.push("");
  lines.push(pc.dim("Shortcut: growthub workflow saved --json"));
  return lines;
}

function renderWorkflowContractDiscoveryTree(nodes: CmsCapabilityNode[]): string[] {
  const byFamily = new Map<string, CmsCapabilityNode[]>();
  for (const node of nodes) {
    const key = node.family;
    const group = byFamily.get(key) ?? [];
    group.push(node);
    byFamily.set(key, group);
  }
  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines: string[] = [pc.bold("CMS Node Contract Discovery")];
  for (const [family, familyNodes] of families) {
    const emoji = FAMILY_EMOJI[family] ?? "•";
    lines.push(`${emoji} ${pc.bold(familyLabel(family))} ${pc.dim(`(${familyNodes.length})`)}`);
    const sorted = [...familyNodes].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const [index, node] of sorted.entries()) {
      const branch = index === sorted.length - 1 ? "└─" : "├─";
      const contract = introspectNodeContract(node);
      const requiredInputs = contract.inputs.filter((input) => input.required).length;
      const optionalInputs = contract.inputs.length - requiredInputs;
      lines.push(
        `  ${branch} ${node.slug} ${pc.dim(`req:${requiredInputs} opt:${optionalInputs} bindings:${contract.requiredBindings.length} outputs:${contract.outputTypes.length}`)}`,
      );
    }
  }
  return lines;
}

function buildTemplateOption(
  template: CmsCapabilityNode,
  viewMode: TemplateViewMode,
): { value: string; label: string; hint?: string } {
  const contract = introspectNodeContract(template);
  const requiredInputs = contract.inputs.filter((input) => input.required).length;
  const optionalInputs = contract.inputs.length - requiredInputs;

  if (viewMode === "expanded") {
    return {
      value: template.slug,
      label: `${template.icon}  ${template.displayName} ${pc.dim(template.slug)}`,
      hint: `req:${requiredInputs} opt:${optionalInputs} outputs:${contract.outputTypes.join(", ") || "none"} exec:${contract.executionStrategy}`,
    };
  }

  if (viewMode === "tree") {
    return {
      value: template.slug,
      label: `${template.family} / ${template.slug}`,
      hint: `req:${requiredInputs} opt:${optionalInputs}`,
    };
  }

  return {
    value: template.slug,
    label: `${template.icon}  ${template.displayName}`,
    hint: template.description?.slice(0, 55),
  };
}

// ---------------------------------------------------------------------------
// Interactive workflow picker — main entry
// ---------------------------------------------------------------------------

export async function runWorkflowPicker(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  const hygieneStore = createWorkflowHygieneStore();

  const access = getWorkflowAccess();

  if (access.state === "unauthenticated") {
    p.intro(pc.bold("Workflows") + pc.dim(" (not connected)"));
    p.note(
      [
        "Workflow assembly requires an authenticated Growthub session.",
        "Run " + pc.cyan("growthub auth login") + " to connect your account.",
        "",
        "Once connected you can:",
        "  - Browse CMS node contracts",
        "  - Assemble dynamic hosted pipelines",
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
          value: "contracts",
          label: refreshedAccess.state === "ready"
            ? "0. CMS Node Contracts"
            : pc.dim("0. CMS Node Contracts (locked)"),
          hint: refreshedAccess.state === "ready"
            ? "Discovery tree for CMS node primitives"
            : refreshedAccess.reason,
        },
        {
          value: "pipelines",
          label: refreshedAccess.state === "ready"
            ? "1. Dynamic Pipelines"
            : pc.dim("1. Dynamic Pipelines (locked)"),
          hint: refreshedAccess.state === "ready"
            ? "Create new pipelines and route into Saved Workflows"
            : refreshedAccess.reason,
        },
        {
          value: "saved",
          label: "2. Saved Workflows",
          hint: "Execute, label, archive, delete",
        },
        ...(opts.allowBackToHub ? [{ value: "__back_to_hub", label: "← Back to main menu" }] : []),
      ],
    });

    if (p.isCancel(topChoice)) { p.cancel("Cancelled."); process.exit(0); }
    if (topChoice === "__back_to_hub") return "back";

    if (topChoice === "contracts" && refreshedAccess.state !== "ready") {
      p.note(
        [
          "CMS Node Contracts are only available when the hosted user is linked to this local machine.",
          refreshedAccess.reason,
        ].join("\n"),
        "Growthub Local Machine Required",
      );
      continue;
    }

    if (topChoice === "contracts") {
      const contractsSpinner = p.spinner();
      contractsSpinner.start("Loading CMS node contracts...");
      try {
        const registry = createCmsCapabilityRegistryClient();
        const { nodes } = await registry.listCapabilities({ enabledOnly: false });
        contractsSpinner.stop(`Loaded ${nodes.length} CMS node contract${nodes.length === 1 ? "" : "s"}.`);
        if (nodes.length === 0) {
          p.note("No CMS node contracts available.", "Nothing found");
          continue;
        }

        let showDiscoveryTree = false;
        while (true) {
          if (showDiscoveryTree) {
            console.log("");
            console.log(box(renderWorkflowContractDiscoveryTree(nodes)));
            console.log("");
            showDiscoveryTree = false;
          }

          const contractsMenuChoice = await p.select({
            message: "CMS Node Contracts",
            options: [
              { value: "browse", label: "Browse contract list", hint: "Select a node and view full contract" },
              { value: "show_tree", label: "Show discovery tree", hint: "Family primitives and contract counts" },
              { value: "__back_to_workflow", label: "← Back to workflow menu" },
            ],
          });
          if (p.isCancel(contractsMenuChoice)) { p.cancel("Cancelled."); process.exit(0); }
          if (contractsMenuChoice === "__back_to_workflow") break;
          if (contractsMenuChoice === "show_tree") {
            showDiscoveryTree = true;
            continue;
          }

          const contractOptions = [...nodes]
            .sort((a, b) => a.slug.localeCompare(b.slug))
            .map((node) => {
              const contract = introspectNodeContract(node);
              const requiredInputs = contract.inputs.filter((input) => input.required).length;
              return {
                value: node.slug,
                label: `${node.icon}  ${node.displayName} ${pc.dim(node.slug)}`,
                hint: `${node.family} · required:${requiredInputs} · bindings:${contract.requiredBindings.length} · outputs:${contract.outputTypes.length}`,
              };
            });

          const contractChoice = await paginatedSelect(
            "Select CMS node contract",
            contractOptions,
            {
              backLabel: "← Back to CMS contracts menu",
              searchEnabled: true,
            },
          );

          if (p.isCancel(contractChoice)) { p.cancel("Cancelled."); process.exit(0); }
          if (contractChoice === "__back") continue;

          const selected = nodes.find((node) => node.slug === contractChoice);
          if (!selected) continue;

          printTemplateCard(selected);

          const contractAction = await p.select({
            message: "Contract actions",
            options: [
              { value: "inspect_json", label: "Inspect raw input template JSON" },
              { value: "back_to_contracts_menu", label: "← Back to CMS contracts menu" },
              { value: "back_to_workflow_menu", label: "← Back to workflow menu" },
            ],
          });
          if (p.isCancel(contractAction)) { p.cancel("Cancelled."); process.exit(0); }
          if (contractAction === "inspect_json") {
            console.log(JSON.stringify(selected.executionTokens.input_template, null, 2));
            continue;
          }
          if (contractAction === "back_to_workflow_menu") {
            break;
          }
        }
      } catch (err) {
        contractsSpinner.stop(pc.red("Failed to load CMS node contracts."));
        p.log.error("Failed to load CMS node contracts: " + (err as Error).message);
      }
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
        let saved: SavedWorkflowWithLabel[];

        try {
          const enriched = enrichWorkflowSummaries(
            filterLocallyDeletedWorkflows(await listSavedWorkflows()),
            hygieneStore,
          );
          saved = withEffectiveWorkflowLabels(enriched, hygieneStore);
          savedSpinner.stop(`Loaded ${saved.length} saved workflow${saved.length === 1 ? "" : "s"}.`);
        } catch (err) {
          savedSpinner.stop(pc.red("Failed to load saved workflows."));
          throw err;
        }

        if (saved.length === 0) {
          p.note(
            [
              "No saved workflows found.",
              "Use " + pc.cyan("growthub pipeline assemble") + " to create a new workflow pipeline.",
            ].join("\n"),
            "Nothing saved",
          );
          break;
        }

        const allOptions = saved.map((w) => ({
          value: w.workflowId,
          label: `${w.name} ${pc.dim(`[${renderWorkflowLabel(w.workflowLabel)}]`)}  ${pc.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}`)}`,
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
            `${pc.dim("Label:")} ${renderWorkflowLabel(entry.workflowLabel ?? "experimental")}`,
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
              { value: "set_label", label: "Set workflow label" },
              { value: "archive", label: "Archive workflow" },
              { value: "unarchive", label: "Unarchive workflow" },
              { value: "delete", label: pc.red("Delete workflow") },
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
              const registry = createCmsCapabilityRegistryClient();
              const { nodes: capabilities } = await registry.listCapabilities({ enabledOnly: false });
              const capabilityMap = new Map(capabilities.map((n) => [n.slug, n]));
              const preSummary = buildPreExecutionSummary({
                pipeline: executablePipeline,
                registryBySlug: capabilityMap,
              });
              console.log("");
              console.log(box(renderPreExecutionSummary(preSummary)));
              console.log("");

              const intelligenceSummary = await renderWorkflowIntelligenceSummary(
                executablePipeline,
                capabilities,
                "pre-execution",
              );
              if (intelligenceSummary) {
                console.log(box(intelligenceSummary));
                console.log("");
              }

              await executeHostedPipeline(executablePipeline);
              p.log.success(`Saved workflow execution completed for ${pc.bold(entry.name)}.`);
            } catch (err) {
              p.log.error("Saved workflow execution failed: " + (err as Error).message);
            }
          }
          if (nextAction === "set_label") {
            const labelChoice = await p.select({
              message: `Set label for ${entry.name}`,
              options: [
                { value: "canonical", label: "Canonical" },
                { value: "experimental", label: "Experimental" },
                { value: "archived", label: "Archived" },
                { value: "__back", label: "← Back" },
              ],
            });
            if (p.isCancel(labelChoice) || labelChoice === "__back") {
              continue;
            }
            hygieneStore.setLabel(entry.workflowId, labelChoice as WorkflowLabel);
            p.log.success(`Updated label for ${pc.bold(entry.name)} to ${renderWorkflowLabel(labelChoice as WorkflowLabel)}.`);
            continue;
          }
          if (nextAction === "archive") {
            const confirmed = await p.confirm({
              message: `Archive ${entry.name}?`,
              initialValue: false,
            });
            if (p.isCancel(confirmed) || !confirmed) {
              continue;
            }
            try {
              await archiveSavedWorkflow(entry);
              hygieneStore.setLabel(entry.workflowId, "archived");
              p.log.success(`Archived ${pc.bold(entry.name)}.`);
            } catch {
              hygieneStore.setLabel(entry.workflowId, "archived");
              p.log.success(`Archived ${pc.bold(entry.name)} (local fallback).`);
            }
            continue;
          }
          if (nextAction === "unarchive") {
            if ((entry.workflowLabel ?? "experimental") !== "archived") {
              p.note("Workflow is already live.", "Unarchive skipped");
              continue;
            }
            const restoreChoice = await p.select({
              message: `Set label after unarchive for ${entry.name}`,
              options: [
                { value: "experimental", label: "Experimental" },
                { value: "canonical", label: "Canonical" },
                { value: "__back", label: "← Back" },
              ],
            });
            if (p.isCancel(restoreChoice) || restoreChoice === "__back") {
              continue;
            }
            hygieneStore.setLabel(entry.workflowId, restoreChoice as WorkflowLabel);
            p.log.success(
              `Unarchived ${pc.bold(entry.name)} to ${renderWorkflowLabel(restoreChoice as WorkflowLabel)}.`,
            );
            continue;
          }
          if (nextAction === "delete") {
            const confirmed = await p.confirm({
              message: `Delete ${entry.name}? This cannot be undone.`,
              initialValue: false,
            });
            if (p.isCancel(confirmed) || !confirmed) {
              continue;
            }
            const finalConfirmed = await p.confirm({
              message: "Final confirmation: permanently delete this workflow?",
              initialValue: false,
            });
            if (p.isCancel(finalConfirmed) || !finalConfirmed) {
              continue;
            }
            try {
              await deleteSavedWorkflow(entry);
              p.log.success(`Deleted ${pc.bold(entry.name)}.`);
            } catch {
              markWorkflowDeletedLocally(entry.workflowId);
              p.log.success(`Deleted ${pc.bold(entry.name)} (local fallback).`);
            }
            continue;
          }
        }
      }
      continue;
    }

    // ── Templates ────────────────────────────────────────────────────────
    if (topChoice === "templates") {
      const registry = createCmsCapabilityRegistryClient();
      let hostedTemplates: CmsCapabilityNode[] = [];
      let templateViewMode: TemplateViewMode = "condensed";
      try {
        const hosted = await registry.listCapabilities({ enabledOnly: false });
        hostedTemplates = hosted.nodes;
      } catch (err) {
        p.log.error("Hosted capability registry unavailable: " + (err as Error).message);
        continue;
      }

      while (true) {
        // Family filter
        const availableFamilies = CAPABILITY_FAMILIES.filter((f) => {
          const nodes = hostedTemplates.filter((node) => node.family === f);
          return nodes.length > 0;
        });

        const familyChoice = await p.select({
          message: "Filter by family",
          options: [
            { value: "all", label: "All Templates" },
            { value: "__tree_view", label: "Tree View (all public nodes)" },
            { value: "__toggle_view_mode", label: `View Mode: ${templateViewMode}` },
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
        if (familyChoice === "__toggle_view_mode") {
          const viewChoice = await p.select({
            message: "Select template view mode",
            options: [
              { value: "condensed", label: "Condensed", hint: "Fast scan" },
              { value: "expanded", label: "Expanded", hint: "Contract hints in list" },
              { value: "tree", label: "Tree", hint: "Family/tree style list" },
            ],
          });
          if (p.isCancel(viewChoice)) { p.cancel("Cancelled."); process.exit(0); }
          templateViewMode = viewChoice as TemplateViewMode;
          continue;
        }
        if (familyChoice === "__tree_view") {
          console.log("");
          console.log(box(renderTemplateTree(hostedTemplates)));
          console.log("");
          continue;
        }

        const query = familyChoice === "all"
          ? undefined
          : { family: familyChoice as CapabilityFamily };

        let templates: CmsCapabilityNode[];
        try {
          templates = query
            ? hostedTemplates.filter((node) => node.family === query.family)
            : hostedTemplates;
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
          const templateOptions = templates.map((t) => buildTemplateOption(t, templateViewMode));

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

              const contract = introspectNodeContract(selected);
              const rawBindings: Record<string, unknown> = {};
              for (const input of contract.inputs) {
                if (!input.required) continue;
                const value = await p.text({
                  message: `${selected.displayName} → ${input.key}`,
                  placeholder: `Enter ${input.key}`,
                });
                if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
                rawBindings[input.key] = value;
              }

              const normalized = normalizeNodeBindings(rawBindings, selected);
              p.note(
                `Provided ${normalized.providedCount}, defaulted ${normalized.defaultedCount}, normalized ${normalized.normalizedCount}.`,
                "Input normalization",
              );

              const nodeId = builder.addNode(selected.slug, normalized.bindings);
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
                const pipelineSummary = buildPreExecutionSummary({
                  pipeline,
                  registryBySlug: new Map([[selected.slug, selected]]),
                });
                console.log("");
                console.log(box(renderPreSaveReview({
                  workflowName,
                  summary: pipelineSummary,
                })));
                console.log("");
                const saveResult = await saveHostedWorkflow(session, {
                  name: workflowName,
                  description: selected.description ?? "",
                  config: compileToHostedWorkflowConfig(pipeline, { workflowName }),
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
// Native Intelligence summary helper
// ---------------------------------------------------------------------------

async function renderWorkflowIntelligenceSummary(
  pipeline: DynamicRegistryPipeline,
  capabilities: CmsCapabilityNode[],
  phase: "pre-save" | "pre-execution" | "post-execution" | "recommendation",
): Promise<string[] | null> {
  try {
    const provider = createNativeIntelligenceProvider();
    const registryContext = capabilities.map((cap) => introspectNodeContract(cap));
    const capabilityMap = new Map(capabilities.map((n) => [n.slug, n]));

    const pipelineSummary: PipelineSummaryForIntelligence = {
      pipelineId: pipeline.pipelineId,
      executionMode: pipeline.executionMode as "local" | "hosted" | "hybrid",
      nodes: pipeline.nodes.map((node) => {
        const cap = capabilityMap.get(node.slug);
        const contract = cap ? introspectNodeContract(cap) : null;
        const missingRequired: string[] = [];
        if (contract) {
          for (const input of contract.inputs) {
            if (!input.required) continue;
            const value = node.bindings[input.key];
            if (value === undefined || value === null || value === "") {
              missingRequired.push(input.key);
            }
          }
        }
        return {
          slug: node.slug,
          bindingCount: Object.keys(node.bindings).length,
          missingRequired,
          outputTypes: contract?.outputTypes ?? [],
          assetCount: 0,
        };
      }),
      warnings: [],
    };

    const input: ExecutionSummaryInput = {
      pipeline: pipelineSummary,
      registryContext,
      phase,
    };

    const result = await provider.summarizeExecution(input);

    const lines: string[] = [
      `${pc.bold("Intelligence Summary")} ${pc.dim(result.title)}`,
      result.explanation,
    ];

    if (result.runtimeModeNote) {
      lines.push(`${pc.dim("Runtime:")} ${result.runtimeModeNote}`);
    }

    if (result.outputExpectation) {
      lines.push(`${pc.dim("Expected:")} ${result.outputExpectation}`);
    }

    if (result.missingBindingGuidance.length > 0) {
      lines.push("", pc.yellow("Missing Binding Guidance"));
      for (const guidance of result.missingBindingGuidance) {
        lines.push(`  ${pc.dim("·")} ${guidance}`);
      }
    }

    if (result.costLatencyCautions.length > 0) {
      lines.push("", pc.yellow("Cost/Latency Notes"));
      for (const caution of result.costLatencyCautions) {
        lines.push(`  ${pc.dim("·")} ${caution}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push("", pc.yellow("Warnings"));
      for (const warning of result.warnings) {
        lines.push(`  ${pc.dim("·")} ${warning}`);
      }
    }

    return lines;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkflowCommands(program: Command): void {
  const wf = program
    .command("workflow")
    .description("Browse CMS contracts, dynamic pipelines, and saved workflows (requires auth)")
    .addHelpText("after", `
Examples:
  $ growthub workflow                       # interactive workflow browser
  $ growthub pipeline assemble              # create new dynamic pipeline workflow
  $ growthub workflow saved                 # list saved workflows
`);

  wf.action(async () => {
    await runWorkflowPicker({});
  });

  // ── templates ───────────────────────────────────────────────────────────
  const templatesCommandEnabled = false;
  if (templatesCommandEnabled) {
    wf
      .command("templates")
      .description("List CMS workflow node starter templates")
      .option("--family <family>", "Filter by family")
      .option("--search <term>", "Search templates")
      .option("--view <mode>", "List view mode: condensed | expanded | tree")
      .option("--json", "Output raw JSON")
      .action(async (opts: { family?: string; search?: string; view?: string; json?: boolean }) => {

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

        const viewMode = (opts.view ?? "condensed") as TemplateViewMode;

        console.log("");
        console.log(
          pc.bold("Workflow Node Templates") +
          pc.dim(`  ${nodes.length} template${nodes.length !== 1 ? "s" : ""}`),
        );
        console.log(hr());
        console.log(pc.bold("Step 1: CMS Node Contract Validation"));
        console.log(pc.dim("Validate contract visibility before template selection."));
        console.log(pc.dim(`View mode: ${viewMode}`));
        console.log("");

        if (viewMode === "tree") {
          console.log(box(renderTemplateTree(nodes)));
          console.log(hr());
          console.log(pc.dim(`  Source: ${meta.source}  ·  growthub workflow`));
          console.log("");
          return;
        }

        for (const node of nodes) {
          const contract = introspectNodeContract(node);
          const requiredInputs = contract.inputs.filter((input) => input.required).length;
          const optionalInputs = contract.inputs.length - requiredInputs;
          const enabledTag = node.enabled ? pc.green("enabled") : pc.red("disabled");
          console.log(`  ${node.icon}  ${pc.bold(node.displayName)}  ${pc.dim(node.slug)}  ${enabledTag}`);
          console.log(
            `     ${pc.dim("Contract:")} ` +
            `${pc.dim("required")}=${requiredInputs} ` +
            `${pc.dim("optional")}=${optionalInputs} ` +
            `${pc.dim("bindings")}=${contract.requiredBindings.length} ` +
            `${pc.dim("outputs")}=${contract.outputTypes.length}`,
          );
          console.log(
            `     ${pc.dim("Execution:")} ${contract.executionStrategy} · ${contract.executionKind}`,
          );
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
  }

  // ── saved ───────────────────────────────────────────────────────────────
  wf
    .command("saved")
    .description("List saved workflow pipelines")
    .option("--include-archived", "Include archived workflows in output")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean; includeArchived?: boolean }) => {
      const hygieneStore = createWorkflowHygieneStore();
      const saved = withEffectiveWorkflowLabels(
        enrichWorkflowSummaries(
          filterLocallyDeletedWorkflows(await listSavedWorkflows()),
          hygieneStore,
        ),
        hygieneStore,
      );
      const visibleSaved = opts.includeArchived
        ? saved
        : saved.filter((entry) => entry.workflowLabel !== "archived");

      if (opts.json) {
        console.log(JSON.stringify(visibleSaved, null, 2));
        return;
      }

      if (visibleSaved.length === 0) {
        console.log(pc.dim("No saved workflows. Run `growthub workflow` to assemble one."));
        return;
      }

      console.log("");
      console.log(
        pc.bold("Saved Workflows") +
        pc.dim(`  ${visibleSaved.length} workflow${visibleSaved.length !== 1 ? "s" : ""}`),
      );
      if (!opts.includeArchived) {
        const hiddenArchivedCount = saved.length - visibleSaved.length;
        if (hiddenArchivedCount > 0) {
          console.log(pc.dim(`  Archived hidden: ${hiddenArchivedCount} (use --include-archived to show)`));
        }
      }
      console.log(hr());

      for (const w of visibleSaved) {
        console.log(
          `  ${pc.bold(w.name)}  ` +
          pc.dim(`[${renderWorkflowLabel(w.workflowLabel)}] `) +
          pc.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}  ·  ${w.executionMode}  ·  ${w.updatedAt?.slice(0, 10) ?? w.createdAt.slice(0, 10)}`),
        );
      }

      console.log("");
      console.log(pc.dim(`  Source: ${visibleSaved[0]?.source === "hosted" ? "hosted workflow registry" : resolveSavedWorkflowsDir()}`));
      console.log("");
    });
}
