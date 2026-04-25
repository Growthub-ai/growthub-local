/**
 * `growthub kit pipeline / dependencies / health` subcommands.
 *
 * These commands consume the v1 contract surfaces frozen in
 * `@growthub/api-contract/{pipeline-kits,workspaces,health}` and the
 * runtime readers under `cli/src/runtime/{pipeline-kits,workspace-
 * dependencies,kit-health}`.
 *
 * Surface design:
 *   - Both human-interactive (`pc` colored, boxed) and agent-first
 *     (`--json`) on every command.
 *   - Accept either a kit id (resolved via `fuzzyResolveKitId`) OR a
 *     filesystem path (relative or absolute) to a kit root. Path mode
 *     is what hosts and forks already on disk use.
 *   - Backwards compatible: kits without v1 manifests render an
 *     informational message, never a failure.
 *
 * Convention: `docs/PIPELINE_KIT_CONTRACT_V1.md`.
 */

import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { fuzzyResolveKitId, listBundledKits, resolveKitPath } from "../kits/service.js";
import { listKitForkRegistrations } from "../kits/fork-registry.js";
import {
  inspectPipelineManifest,
  pipelineManifestExists,
  type PipelineInspectProjection,
  type PipelineInspectStage,
} from "../runtime/pipeline-kits/index.js";
import {
  inspectWorkspaceDependencies,
  workspaceDependenciesExists,
  type WorkspaceDependenciesInspect,
} from "../runtime/workspace-dependencies/index.js";
import { computeKitHealthReport } from "../runtime/kit-health/index.js";
import type { KitHealthReport } from "@growthub/api-contract/health";

// ---------------------------------------------------------------------------
// Target resolution — accept kit id or filesystem path
// ---------------------------------------------------------------------------

export type ResolvedTargetSource =
  /** Absolute or relative filesystem path (the operator's working copy). */
  | "path"
  /** Bundled kit id resolved to the read-only canonical asset root. */
  | "kit-id-bundled"
  /** Bundled kit id resolved to the user's previously exported workspace. */
  | "kit-id-exported"
  /** Fork id resolved via the local fork registry (operator's customised branch). */
  | "fork-id";

export interface ResolvedTarget {
  kitRoot: string;
  /** Source of the resolution — surfaced for both human and agent output. */
  resolvedFrom: ResolvedTargetSource;
  /** Original input string the user provided. */
  input: string;
  /** When resolved via fork registry, the fork id. */
  forkId?: string;
  /** When resolved via kit catalog, the canonical kit id. */
  kitId?: string;
}

/**
 * Resolve a `<kit-id-or-path>` argument into an absolute kit root.
 *
 * Dual local / remote resolution model — same primitives as
 * `growthub kit fork`:
 *
 *   1. If the input is an existing directory containing `kit.json`,
 *      treat it as a local path (operator's working copy).
 *   2. If the input matches a registered fork id, resolve via the fork
 *      registry to that fork's `forkPath` (operator's customised branch).
 *   3. If the input fuzzy-matches a bundled kit id, prefer the bundled
 *      asset root (read-only canonical source). If the bundled root
 *      cannot be located (e.g. installed-from-npm mode without bundled
 *      assets), fall back to the user's previously exported workspace.
 *
 * Returns `null` when none of the above resolves; the caller renders
 * the appropriate human / JSON error.
 */
export function resolveKitTarget(input: string, outDir?: string): ResolvedTarget | null {
  // 1. Filesystem path (local working copy).
  const asPath = path.resolve(input);
  if (
    fs.existsSync(asPath) &&
    fs.statSync(asPath).isDirectory() &&
    fs.existsSync(path.resolve(asPath, "kit.json"))
  ) {
    return { kitRoot: asPath, resolvedFrom: "path", input };
  }

  // 2. Fork id (operator's customised branch via fork registry).
  try {
    const forks = listKitForkRegistrations();
    const fork = forks.find((f) => f.forkId === input);
    if (fork && fs.existsSync(fork.forkPath) && fs.existsSync(path.resolve(fork.forkPath, "kit.json"))) {
      return {
        kitRoot: fork.forkPath,
        resolvedFrom: "fork-id",
        input,
        forkId: fork.forkId,
        kitId: fork.kitId,
      };
    }
  } catch {
    // fork registry unavailable — fall through
  }

  // 3. Bundled kit id (canonical or exported).
  const resolvedId = fuzzyResolveKitId(input);
  if (resolvedId) {
    const assetRoot = resolveBundledAssetRoot(resolvedId);
    if (assetRoot) {
      return {
        kitRoot: assetRoot,
        resolvedFrom: "kit-id-bundled",
        input,
        kitId: resolvedId,
      };
    }
    const exportedPath = resolveKitPath(resolvedId, outDir);
    if (fs.existsSync(exportedPath) && fs.existsSync(path.resolve(exportedPath, "kit.json"))) {
      return {
        kitRoot: exportedPath,
        resolvedFrom: "kit-id-exported",
        input,
        kitId: resolvedId,
      };
    }
  }
  return null;
}

function describeSource(target: ResolvedTarget): string {
  switch (target.resolvedFrom) {
    case "path": return "path";
    case "kit-id-bundled": return `kit-id (bundled: ${target.kitId})`;
    case "kit-id-exported": return `kit-id (exported workspace: ${target.kitId})`;
    case "fork-id": return `fork-id (${target.forkId} → ${target.kitId})`;
  }
}

function resolveBundledAssetRoot(kitId: string): string | null {
  // The bundled asset root mirrors the repo layout under the CLI's
  // `assets/worker-kits/<kit-id>/` (in dev: cli/assets/worker-kits/...).
  // We probe a small list of candidates so this works in both repo and
  // installed-from-npm modes.
  const candidates: string[] = [];
  const here = path.dirname(new URL(import.meta.url).pathname);
  candidates.push(path.resolve(here, "../../assets/worker-kits", kitId));
  candidates.push(path.resolve(here, "../../../cli/assets/worker-kits", kitId));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.resolve(candidate, "kit.json"))) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Common output helpers
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function emitJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function emitNotFound(input: string, json: boolean): void {
  if (json) {
    emitJson({
      error: "kit-not-found",
      message: `Could not resolve '${input}' as a kit id or kit directory.`,
      input,
    });
  } else {
    console.error(pc.red(`Could not resolve '${input}' as a kit id or kit directory.`));
    console.error(
      pc.dim("  Try: growthub kit list   or   growthub kit pipeline inspect <path-to-kit>"),
    );
  }
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// pipeline inspect
// ---------------------------------------------------------------------------

function renderPipelineInspect(target: ResolvedTarget, projection: PipelineInspectProjection): void {
  console.log("");
  console.log(pc.bold(`Pipeline: ${projection.pipelineId ?? "(none)"}`));
  console.log(pc.dim(`  kit:    ${projection.kitId ?? "(unknown)"}`));
  console.log(pc.dim(`  source: ${describeSource(target)}  →  ${target.kitRoot}`));
  console.log(pc.dim(`  manifest: ${projection.manifestPath}`));
  console.log(hr());

  if (!projection.exists) {
    console.log(pc.yellow("  No pipeline.manifest.json declared (only required for multi-stage pipeline kits)."));
    console.log(pc.dim("  See docs/PIPELINE_KIT_CONTRACT_V1.md to opt in."));
    console.log("");
    return;
  }

  if (projection.outputTopology) {
    console.log(`  ${pc.bold("Output topology:")} ${pc.cyan(projection.outputTopology.root)}`);
    if (projection.outputTopology.buckets.length > 0) {
      console.log(pc.dim(`  buckets: ${projection.outputTopology.buckets.join(", ")}`));
    }
    console.log("");
  }

  console.log(pc.bold(`  Stages (${projection.stageCount})`));
  for (let i = 0; i < projection.stages.length; i += 1) {
    const stage = projection.stages[i];
    renderStage(i + 1, stage);
  }

  if (projection.issues.length > 0) {
    console.log("");
    console.log(pc.bold("  Issues"));
    for (const issue of projection.issues) {
      const tag = issue.severity === "error" ? pc.red("ERROR") : pc.yellow("WARN ");
      const field = issue.field ? pc.dim(` [${issue.field}]`) : "";
      console.log(`    ${tag} ${issue.message}${field}`);
    }
  }

  console.log("");
  const status = projection.status;
  const statusLine =
    status === "error"
      ? pc.red(pc.bold("  Status: ERROR"))
      : status === "warn"
        ? pc.yellow(pc.bold("  Status: WARN"))
        : pc.green(pc.bold("  Status: OK"));
  console.log(statusLine);
  console.log("");
}

function renderStage(index: number, stage: PipelineInspectStage): void {
  const prefix = pc.cyan(`  ${index}. ${stage.id}`);
  const label = stage.label ? pc.dim(`  (${stage.label})`) : "";
  console.log("");
  console.log(prefix + label);
  console.log(pc.dim(`     sub-skill: ${stage.subSkillPath}`));
  if (stage.adapterModes.length > 0) {
    console.log(pc.dim(`     adapters:  ${stage.adapterModes.join(", ")}`));
  }
  if (stage.helperPaths.length > 0) {
    console.log(pc.dim(`     helpers:   ${stage.helperPaths.join(", ")}`));
  }
  if (stage.externalDependencies.length > 0) {
    console.log(pc.dim(`     external:  ${stage.externalDependencies.join(", ")}`));
  }
  if (stage.inputArtifacts.length > 0) {
    console.log(pc.dim(`     inputs:`));
    for (const a of stage.inputArtifacts) console.log(pc.dim(`       · ${a}`));
  }
  if (stage.outputArtifacts.length > 0) {
    console.log(pc.dim(`     outputs:`));
    for (const a of stage.outputArtifacts) console.log(pc.dim(`       · ${a}`));
  }
}

export function runPipelineInspect(input: string, opts: { json?: boolean; out?: string }): void {
  const target = resolveKitTarget(input, opts.out);
  if (!target) {
    emitNotFound(input, !!opts.json);
    return;
  }
  const projection = inspectPipelineManifest(target.kitRoot);
  if (opts.json) {
    emitJson({ ...projection, target });
    return;
  }
  renderPipelineInspect(target, projection);
}

// ---------------------------------------------------------------------------
// dependencies inspect
// ---------------------------------------------------------------------------

function renderDependenciesInspect(target: ResolvedTarget, projection: WorkspaceDependenciesInspect): void {
  console.log("");
  console.log(pc.bold(`Workspace dependencies — ${projection.kitId ?? "(unknown)"}`));
  console.log(pc.dim(`  source: ${describeSource(target)}  →  ${target.kitRoot}`));
  console.log(pc.dim(`  manifest: ${projection.manifestPath}`));
  console.log(hr());

  if (!projection.exists) {
    console.log(pc.yellow("  No workspace.dependencies.json declared."));
    console.log(pc.dim("  This is only required when the kit delegates to external repos / forks."));
    console.log(pc.dim("  See docs/PIPELINE_KIT_CONTRACT_V1.md § external dependency contract."));
    console.log("");
    return;
  }

  if (projection.dependencies.length === 0) {
    console.log(pc.dim("  No dependencies declared."));
  }

  for (const dep of projection.dependencies) {
    console.log("");
    console.log(`  ${pc.cyan(dep.id)}  ${pc.dim(`(${dep.kind})`)}`);
    console.log(pc.dim(`     env:      ${dep.env}`));
    if (dep.setup) console.log(pc.dim(`     setup:    ${dep.setup}`));
    if (dep.install) console.log(pc.dim(`     install:  ${dep.install}`));
    if (dep.health) console.log(pc.dim(`     health:   ${dep.health}`));
    if (dep.usedByStages?.length) {
      console.log(pc.dim(`     stages:   ${dep.usedByStages.join(", ")}`));
    }
    if (dep.interfaceArtifact) {
      console.log(pc.dim(`     in  ←     ${dep.interfaceArtifact}`));
    }
    if (dep.handoffArtifact) {
      console.log(pc.dim(`     out →     ${dep.handoffArtifact}`));
    }
  }

  if (projection.issues.length > 0) {
    console.log("");
    console.log(pc.bold("  Issues"));
    for (const issue of projection.issues) {
      const tag = issue.severity === "error" ? pc.red("ERROR") : pc.yellow("WARN ");
      const field = issue.field ? pc.dim(` [${issue.field}]`) : "";
      console.log(`    ${tag} ${issue.message}${field}`);
    }
  }

  console.log("");
  const statusLine =
    projection.status === "error"
      ? pc.red(pc.bold("  Status: ERROR"))
      : projection.status === "warn"
        ? pc.yellow(pc.bold("  Status: WARN"))
        : pc.green(pc.bold("  Status: OK"));
  console.log(statusLine);
  console.log("");
}

export function runDependenciesInspect(input: string, opts: { json?: boolean; out?: string }): void {
  const target = resolveKitTarget(input, opts.out);
  if (!target) {
    emitNotFound(input, !!opts.json);
    return;
  }
  const projection = inspectWorkspaceDependencies(target.kitRoot);
  if (opts.json) {
    emitJson({ ...projection, target });
    return;
  }
  renderDependenciesInspect(target, projection);
}

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

function renderHealth(target: ResolvedTarget, report: KitHealthReport): void {
  console.log("");
  console.log(pc.bold(`Kit health — ${report.kitId}`));
  console.log(pc.dim(`  source: ${describeSource(target)}  →  ${target.kitRoot}`));
  console.log(pc.dim(`  generated: ${report.generatedAt}`));
  console.log(pc.dim(`  convention: ${report.convention?.spec ?? "(none)"} v${report.convention?.version ?? "?"}`));
  console.log(hr());

  for (const c of report.checks) {
    const tag =
      c.severity === "fail"
        ? pc.red("FAIL ")
        : c.severity === "warn"
          ? pc.yellow("WARN ")
          : c.severity === "info"
            ? pc.dim("INFO ")
            : pc.green("PASS ");
    const label = c.label ?? c.id;
    const message = c.message ? pc.dim(` — ${c.message}`) : "";
    console.log(`  ${tag} ${label}${message}`);
    if (c.severity !== "pass" && c.remediation) {
      console.log(pc.dim(`         ↳ ${c.remediation}`));
    }
  }

  console.log("");
  const overallLine =
    report.overall === "fail"
      ? pc.red(pc.bold("  Overall: FAIL"))
      : report.overall === "warn"
        ? pc.yellow(pc.bold("  Overall: WARN"))
        : pc.green(pc.bold("  Overall: OK"));
  console.log(overallLine);
  console.log("");
}

export function runKitHealth(
  input: string,
  opts: { json?: boolean; out?: string; noLocalHelper?: boolean },
): void {
  const target = resolveKitTarget(input, opts.out);
  if (!target) {
    emitNotFound(input, !!opts.json);
    return;
  }
  const report = computeKitHealthReport(target.kitRoot, {
    runLocalHelper: !opts.noLocalHelper,
  });
  if (opts.json) {
    emitJson({ ...report, target });
  } else {
    renderHealth(target, report);
  }
  if (report.overall === "fail") {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Catalog-wide list — which kits adopt each specialization
// ---------------------------------------------------------------------------

interface ContractListEntry {
  kitId: string;
  family: string;
  hasPipelineManifest: boolean;
  hasWorkspaceDependencies: boolean;
  pipelineStageCount: number;
  dependencyCount: number;
  kitRoot: string;
}

function buildCatalogList(): ContractListEntry[] {
  const entries: ContractListEntry[] = [];
  for (const kit of listBundledKits()) {
    const root = resolveBundledAssetRoot(kit.id);
    if (!root) continue;
    const pipelineExists = pipelineManifestExists(root);
    const depsExists = workspaceDependenciesExists(root);
    let stageCount = 0;
    let depCount = 0;
    if (pipelineExists) {
      const projection = inspectPipelineManifest(root);
      stageCount = projection.stageCount;
    }
    if (depsExists) {
      const projection = inspectWorkspaceDependencies(root);
      depCount = projection.dependencyCount;
    }
    entries.push({
      kitId: kit.id,
      family: kit.family,
      hasPipelineManifest: pipelineExists,
      hasWorkspaceDependencies: depsExists,
      pipelineStageCount: stageCount,
      dependencyCount: depCount,
      kitRoot: root,
    });
  }
  return entries;
}

function applyFilter(
  entries: ContractListEntry[],
  filter: string | undefined,
  kind: "pipeline" | "dependencies",
): ContractListEntry[] {
  let filtered = kind === "pipeline"
    ? entries.filter((e) => e.hasPipelineManifest)
    : entries.filter((e) => e.hasWorkspaceDependencies);
  if (!filter) return filtered;
  for (const clause of filter.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [key, value] = clause.split("=").map((s) => s.trim());
    if (key === "family" && value) {
      const wanted = value.split("|").map((f) => f.trim().toLowerCase());
      filtered = filtered.filter((e) => wanted.includes(e.family.toLowerCase()));
    } else if (key === "has-external-deps" && value === "true") {
      filtered = filtered.filter((e) => e.hasWorkspaceDependencies);
    } else if (key === "min-stages" && value) {
      const min = parseInt(value, 10);
      if (!Number.isNaN(min)) filtered = filtered.filter((e) => e.pipelineStageCount >= min);
    }
  }
  return filtered;
}

function renderCatalogList(entries: ContractListEntry[], kind: "pipeline" | "dependencies"): void {
  const headers = kind === "pipeline"
    ? ["Kit", "Family", "Stages", "External deps"]
    : ["Kit", "Family", "Dependencies", "Pipeline?"];
  const rows = entries.map((e) =>
    kind === "pipeline"
      ? [e.kitId, e.family, String(e.pipelineStageCount), e.hasWorkspaceDependencies ? "yes" : "—"]
      : [e.kitId, e.family, String(e.dependencyCount), e.hasPipelineManifest ? "yes" : "—"],
  );
  console.log("");
  if (entries.length === 0) {
    console.log(pc.dim(`  No kits currently adopt the ${kind === "pipeline" ? "Pipeline Kit" : "Workspace Dependency"} specialization.`));
    console.log("");
    return;
  }
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => String(row[i]).length)),
  );
  const fmt = (cells: string[]) =>
    "  " + cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(pc.bold(fmt(headers)));
  console.log(pc.dim(fmt(widths.map((w) => "-".repeat(w)))));
  for (const row of rows) console.log(fmt(row));
  console.log("");
}

export function runPipelineList(opts: { json?: boolean; filter?: string }): void {
  const all = buildCatalogList();
  const filtered = applyFilter(all, opts.filter, "pipeline");
  if (opts.json) {
    emitJson({
      convention: "docs/PIPELINE_KIT_CONTRACT_V1.md",
      kind: "pipeline",
      filter: opts.filter ?? null,
      total: filtered.length,
      kits: filtered,
    });
    return;
  }
  console.log(pc.bold("Pipeline Kits across the catalog"));
  console.log(pc.dim("  (kits that ship pipeline.manifest.json)"));
  renderCatalogList(filtered, "pipeline");
}

export function runDependenciesList(opts: { json?: boolean; filter?: string }): void {
  const all = buildCatalogList();
  const filtered = applyFilter(all, opts.filter, "dependencies");
  if (opts.json) {
    emitJson({
      convention: "docs/WORKER_KIT_CONTRACT_V1.md",
      kind: "dependencies",
      filter: opts.filter ?? null,
      total: filtered.length,
      kits: filtered,
    });
    return;
  }
  console.log(pc.bold("Kits with workspace dependencies"));
  console.log(pc.dim("  (kits that ship workspace.dependencies.json)"));
  renderCatalogList(filtered, "dependencies");
}

// ---------------------------------------------------------------------------
// Interactive hubs (mirrors `growthub kit fork`)
// ---------------------------------------------------------------------------

async function pickAdoptingKit(
  kind: "pipeline" | "dependencies",
): Promise<{ kitId: string; kitRoot: string } | null> {
  const entries = applyFilter(buildCatalogList(), undefined, kind);
  if (entries.length === 0) {
    p.note(
      `No kits currently adopt the ${kind === "pipeline" ? "Pipeline Kit" : "Workspace Dependency"} specialization.\nSee docs/${kind === "pipeline" ? "PIPELINE_KIT_CONTRACT_V1" : "WORKER_KIT_CONTRACT_V1"}.md to opt in.`,
      "Empty",
    );
    return null;
  }
  const choice = await p.select({
    message: "Pick a kit",
    options: entries.map((e) => ({
      value: e.kitId,
      label: e.kitId,
      hint: kind === "pipeline"
        ? `${e.pipelineStageCount} stages${e.hasWorkspaceDependencies ? " + external deps" : ""}`
        : `${e.dependencyCount} deps${e.hasPipelineManifest ? " + pipeline" : ""}`,
    })),
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    return null;
  }
  const picked = entries.find((e) => e.kitId === choice);
  return picked ? { kitId: picked.kitId, kitRoot: picked.kitRoot } : null;
}

export async function runPipelineHub(): Promise<void> {
  p.intro("Pipeline Kit inspector");
  while (true) {
    const action = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "list", label: "📋 List pipeline kits across the catalog", hint: "growthub kit pipeline list" },
        { value: "inspect", label: "🔍 Inspect a kit's pipeline.manifest.json", hint: "growthub kit pipeline inspect <id>" },
        { value: "exit", label: "← Exit" },
      ],
    });
    if (p.isCancel(action) || action === "exit") {
      p.outro("Done.");
      return;
    }
    if (action === "list") {
      runPipelineList({});
      continue;
    }
    const picked = await pickAdoptingKit("pipeline");
    if (!picked) continue;
    runPipelineInspect(picked.kitId, {});
  }
}

export async function runDependenciesHub(): Promise<void> {
  p.intro("Workspace Dependencies inspector");
  while (true) {
    const action = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "list", label: "📋 List kits with workspace dependencies", hint: "growthub kit dependencies list" },
        { value: "inspect", label: "🔍 Inspect a kit's workspace.dependencies.json", hint: "growthub kit dependencies inspect <id>" },
        { value: "exit", label: "← Exit" },
      ],
    });
    if (p.isCancel(action) || action === "exit") {
      p.outro("Done.");
      return;
    }
    if (action === "list") {
      runDependenciesList({});
      continue;
    }
    const picked = await pickAdoptingKit("dependencies");
    if (!picked) continue;
    runDependenciesInspect(picked.kitId, {});
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerKitContractSubcommands(kit: Command): void {
  // ── kit pipeline ──────────────────────────────────────────────────────────
  const pipeline = kit
    .command("pipeline")
    .description("Pipeline Kit specialization — list / inspect kits with pipeline.manifest.json")
    .addHelpText(
      "after",
      `
Examples:
  # Interactive hub
  $ growthub kit pipeline                              # interactive picker

  # List all pipeline kits across the catalog
  $ growthub kit pipeline list
  $ growthub kit pipeline list --json
  $ growthub kit pipeline list --filter family=studio
  $ growthub kit pipeline list --filter has-external-deps=true
  $ growthub kit pipeline list --filter min-stages=3

  # Inspect a specific kit (dual local / remote: path / kit-id / fork-id)
  $ growthub kit pipeline inspect creative-video-pipeline
  $ growthub kit pipeline inspect ./my-fork
  $ growthub kit pipeline inspect <fork-id>            # via fork registry
  $ growthub kit pipeline inspect <id> --json | jq '.stages[].id'

Convention: docs/PIPELINE_KIT_CONTRACT_V1.md
SDK type:   @growthub/api-contract/pipeline-kits#PipelineKitManifest
`,
    );

  pipeline.action(async () => {
    await runPipelineHub();
  });

  pipeline
    .command("list")
    .description("List all pipeline kits across the catalog")
    .option("--json", "Output raw JSON for agent consumption")
    .option(
      "--filter <expr>",
      "Comma-separated filters (e.g. 'family=studio', 'has-external-deps=true', 'min-stages=2')",
    )
    .action((opts: { json?: boolean; filter?: string }) => {
      runPipelineList(opts);
    });

  pipeline
    .command("inspect")
    .description("Inspect a kit's pipeline.manifest.json (stages, adapters, output topology)")
    .argument(
      "<kit-id-or-path>",
      "Kit id (bundled or exported), filesystem path, or fork id (registered via fork-sync)",
    )
    .option("--json", "Output raw JSON for agent consumption")
    .option("--out <path>", "Override the export root when resolving a kit id")
    .action((input: string, opts: { json?: boolean; out?: string }) => {
      runPipelineInspect(input, opts);
    });

  // ── kit dependencies ──────────────────────────────────────────────────────
  const deps = kit
    .command("dependencies")
    .alias("deps")
    .description("Workspace Dependency specialization — list / inspect external repos & forks")
    .addHelpText(
      "after",
      `
Examples:
  # Interactive hub
  $ growthub kit dependencies                           # interactive picker
  $ growthub kit deps                                   # alias

  # List all kits with workspace.dependencies.json
  $ growthub kit dependencies list
  $ growthub kit dependencies list --json
  $ growthub kit dependencies list --filter family=studio

  # Inspect a specific kit (dual local / remote: path / kit-id / fork-id)
  $ growthub kit dependencies inspect creative-video-pipeline
  $ growthub kit deps inspect ./my-fork
  $ growthub kit deps inspect <fork-id> --json

Convention: docs/WORKER_KIT_CONTRACT_V1.md (§ workspace dependencies)
SDK type:   @growthub/api-contract/workspaces#WorkspaceDependencyManifest
`,
    );

  deps.action(async () => {
    await runDependenciesHub();
  });

  deps
    .command("list")
    .description("List all kits that ship workspace.dependencies.json")
    .option("--json", "Output raw JSON for agent consumption")
    .option("--filter <expr>", "Comma-separated filters (e.g. 'family=studio')")
    .action((opts: { json?: boolean; filter?: string }) => {
      runDependenciesList(opts);
    });

  deps
    .command("inspect")
    .description("Inspect a kit's workspace.dependencies.json")
    .argument(
      "<kit-id-or-path>",
      "Kit id (bundled or exported), filesystem path, or fork id (registered via fork-sync)",
    )
    .option("--json", "Output raw JSON for agent consumption")
    .option("--out <path>", "Override the export root when resolving a kit id")
    .action((input: string, opts: { json?: boolean; out?: string }) => {
      runDependenciesInspect(input, opts);
    });

  // ── kit health ────────────────────────────────────────────────────────────
  kit
    .command("health")
    .description("Compute a KitHealthReport for any kit (universal — applies to every kit)")
    .argument(
      "<kit-id-or-path>",
      "Kit id (bundled or exported), filesystem path, or fork id (registered via fork-sync)",
    )
    .option("--json", "Output raw JSON for agent consumption")
    .option("--out <path>", "Override the export root when resolving a kit id")
    .option("--no-local-helper", "Skip invoking helpers/check-*-health.sh even if present")
    .addHelpText(
      "after",
      `
Examples:
  $ growthub kit health creative-video-pipeline
  $ growthub kit health ./my-fork --json
  $ growthub kit health <fork-id>                        # via fork registry
  $ growthub kit health <id> --json | jq '.overall'

The exit code is 1 when overall severity is FAIL, otherwise 0.

Convention: docs/WORKER_KIT_CONTRACT_V1.md (§ how agents should read a worker kit)
SDK type:   @growthub/api-contract/health#KitHealthReport
`,
    )
    .action((input: string, opts: { json?: boolean; out?: string; noLocalHelper?: boolean }) => {
      runKitHealth(input, opts);
    });
}
