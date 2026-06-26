/**
 * Governed causal-intelligence weapons for the CLI — the S2–S6 sprints, all
 * built on the SAME pure derivers the workspace runtime ships (imported via
 * runtime/workspace-derivations.ts, never re-implemented):
 *
 *   growthub plan       (S2) — offline causal pre-merge impact (blast radius,
 *                              stale surfaces, workflow impact, lineage)
 *   growthub patch      (S3) — offline intent→path→(plan + contract compliance),
 *                              PR-ready; never a private write
 *   growthub capture    (S4) — live↔repo drift (GET /api/workspace vs repo)
 *   growthub readiness  (S5) — app ship-readiness, optionally rolled across forks
 *   growthub serve --mcp (S6) — read-only MCP stdio server exposing the derivers
 *
 * All read-only by default. The only writer is `patch --write`, which edits the
 * REPO artifact (a file) and prints the governed PR step — it never touches live
 * state; promotion stays on the governed PATCH/publish lanes.
 */

import { Command } from "commander";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  buildGraphFromFork,
  buildGraphFromConfig,
  loadDerivers,
  loadGraphHelpers,
  type GraphNode,
  type GraphEdge,
} from "../runtime/workspace-derivations.js";

function emit(json: boolean, payload: unknown, human: () => void): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    human();
  }
}

function forkRoot(opts: { fork?: string }): string {
  return path.resolve(opts.fork ?? process.cwd());
}

function findNode(nodes: GraphNode[], idOrLabel: string): GraphNode | undefined {
  return nodes.find((n) => n.id === idOrLabel)
    ?? nodes.find((n) => n.metadataId === idOrLabel)
    ?? nodes.find((n) => n.label === idOrLabel);
}

// ── S2: growthub plan ───────────────────────────────────────────────────────

interface PlanOpts { fork?: string; impact?: string; lineage?: string; workflow?: string; json?: boolean }

async function planCommand(opts: PlanOpts): Promise<void> {
  const root = forkRoot(opts);
  const { configPath, graph, warnings } = await buildGraphFromFork(root);
  const d = await loadDerivers();

  const result: Record<string, unknown> = {
    kind: "growthub-plan-v1",
    config: configPath,
    graphStats: { nodes: graph.nodes.length, edges: graph.edges.length },
    staleSurfaces: d.deriveStaleSurfaces(graph),
    warnings,
  };

  const resolveTarget = (raw: string): string | null => findNode(graph.nodes, raw)?.id ?? null;

  if (opts.impact) {
    const id = resolveTarget(opts.impact);
    result.impact = id
      ? { blastRadius: d.deriveBlastRadius(graph, id), workflowImpact: d.deriveWorkflowImpact(graph, id) }
      : { error: `node not found: ${opts.impact}` };
  }
  if (opts.workflow) {
    const id = resolveTarget(opts.workflow);
    result.workflowImpact = id ? d.deriveWorkflowImpact(graph, id) : { error: `node not found: ${opts.workflow}` };
  }
  if (opts.lineage) {
    const id = resolveTarget(opts.lineage);
    result.lineage = id ? d.deriveProvenanceLineage(graph, id) : { error: `node not found: ${opts.lineage}` };
  }

  emit(Boolean(opts.json), result, () => {
    console.log(pc.bold("growthub plan") + pc.dim(` — ${configPath}`));
    console.log(`  graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    const ss = result.staleSurfaces as { summary?: string };
    console.log(`  ${pc.cyan("stale:")} ${ss.summary ?? "n/a"}`);
    if (result.impact) {
      const i = result.impact as { blastRadius?: { summary?: string }; workflowImpact?: { summary?: string }; error?: string };
      if (i.error) console.log(`  ${pc.red("impact:")} ${i.error}`);
      else {
        console.log(`  ${pc.yellow("blast radius:")} ${i.blastRadius?.summary}`);
        console.log(`  ${pc.yellow("workflow impact:")} ${i.workflowImpact?.summary}`);
      }
    }
    if (result.workflowImpact) console.log(`  ${pc.yellow("workflow impact:")} ${(result.workflowImpact as { summary?: string }).summary}`);
    if (result.lineage) console.log(`  ${pc.magenta("lineage:")} ${(result.lineage as { summary?: string }).summary}`);
    if (warnings.length) console.log(pc.dim(`  warnings: ${warnings.length}`));
  });
}

// ── S5: growthub readiness ──────────────────────────────────────────────────

interface ReadinessOpts { fork?: string[]; app?: string; json?: boolean }

async function readinessCommand(opts: ReadinessOpts): Promise<void> {
  const forks = (opts.fork && opts.fork.length ? opts.fork : [process.cwd()]).map((f) => path.resolve(f));
  const d = await loadDerivers();
  const perFork: Array<Record<string, unknown>> = [];
  for (const root of forks) {
    try {
      const { configPath, graph } = await buildGraphFromFork(root);
      const readiness = d.deriveAppReadiness(graph, opts.app ? { appId: opts.app } : {});
      perFork.push({ fork: root, config: configPath, readiness });
    } catch (error) {
      perFork.push({ fork: root, error: (error as Error)?.message ?? "failed" });
    }
  }
  const rollup = {
    total: perFork.length,
    ready: perFork.filter((f) => (f.readiness as { ready?: boolean } | undefined)?.ready).length,
    blocked: perFork.filter((f) => f.readiness && !(f.readiness as { ready?: boolean }).ready).length,
  };
  const payload = { kind: "growthub-readiness-v1", rollup, forks: perFork };

  emit(Boolean(opts.json), payload, () => {
    console.log(pc.bold("growthub readiness") + pc.dim(` — ${rollup.ready}/${rollup.total} ready`));
    for (const f of perFork) {
      if (f.error) { console.log(`  ${pc.red("✗")} ${f.fork}: ${f.error}`); continue; }
      const r = f.readiness as { ready: boolean; score: number; summary: string; nextAction?: string };
      console.log(`  ${r.ready ? pc.green("✓") : pc.red("✗")} ${r.summary}`);
      if (!r.ready && r.nextAction) console.log(pc.dim(`      → ${r.nextAction}`));
    }
  });
}

// ── S3: growthub patch ──────────────────────────────────────────────────────

const ALLOWED_PATCH_FIELDS = ["dashboards", "widgetTypes", "canvas", "dataModel"];

type DeriverSet = Awaited<ReturnType<typeof loadDerivers>>;

/**
 * Shared offline patch preview — the SINGLE place that turns current+merged
 * configs into { impact, contract compliance, allowlist }. Used by both
 * `growthub patch` and the MCP `preflight_patch` tool. Delegates the impact diff
 * (added / modified / REMOVED objects + dashboards) to the same `derivePatchImpact`
 * deriver the server preflight route uses — one impact model, not two.
 */
async function previewPatchImpact(
  d: DeriverSet,
  opts: { currentConfig: Record<string, unknown>; mergedConfig: Record<string, unknown>; sourceRecords?: Record<string, unknown>; changedFields: string[]; touchesLiveWorkflow?: boolean },
): Promise<{ impact: Record<string, unknown>; contractCompliance: Record<string, unknown>; allowlist: { ok: boolean; disallowed: string[]; allowed: string[] } }> {
  const disallowed = opts.changedFields.filter((f) => !ALLOWED_PATCH_FIELDS.includes(f));
  const records = opts.sourceRecords ?? {};
  const [{ graph: currentGraph }, { graph: mergedGraph }] = await Promise.all([
    buildGraphFromConfig(opts.currentConfig, records),
    buildGraphFromConfig(opts.mergedConfig, records),
  ]);
  return {
    impact: d.derivePatchImpact(currentGraph, mergedGraph, opts.currentConfig, opts.mergedConfig),
    contractCompliance: d.deriveContractCompliance({ changedFields: opts.changedFields, touchesLiveWorkflow: Boolean(opts.touchesLiveWorkflow) }, undefined, { hasPreflightReceipt: false }),
    allowlist: { ok: disallowed.length === 0, disallowed, allowed: ALLOWED_PATCH_FIELDS },
  };
}

/** Set a dotted/bracket path (e.g. dataModel.objects[0].label) on a clone. */
function setPath(target: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cursor: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = (cursor as Record<string, unknown>)[key];
    if (next == null || typeof next !== "object") {
      (cursor as Record<string, unknown>)[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cursor = (cursor as Record<string, unknown>)[key] as Record<string, unknown> | unknown[];
  }
  (cursor as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

interface PatchOpts { fork?: string; set?: string[]; write?: boolean; json?: boolean; touchesLiveWorkflow?: boolean }

async function patchCommand(opts: PatchOpts): Promise<void> {
  const root = forkRoot(opts);
  const { configPath, workspaceConfig } = await buildGraphFromFork(root);
  const sets = opts.set ?? [];
  if (!sets.length) throw new Error("patch requires at least one --set <path>=<jsonValue>");

  const proposed = JSON.parse(JSON.stringify(workspaceConfig)) as Record<string, unknown>;
  const changedFields = new Set<string>();
  for (const assignment of sets) {
    const eq = assignment.indexOf("=");
    if (eq < 0) throw new Error(`bad --set "${assignment}" (expected path=jsonValue)`);
    const dottedPath = assignment.slice(0, eq).trim();
    const rawValue = assignment.slice(eq + 1);
    let value: unknown;
    try { value = JSON.parse(rawValue); } catch { value = rawValue; }
    const topKey = dottedPath.split(/[.[]/)[0];
    changedFields.add(topKey);
    setPath(proposed, dottedPath, value);
  }

  // Diff the PROPOSED config against the current one (in memory, no temp file)
  // via the shared patch-impact deriver — same model the server route uses, so
  // added / modified / REMOVED objects + dashboards are all reported. Reuse the
  // source-record sidecar so live-backed nodes keep their freshness.
  const d = await loadDerivers();
  let sourceRecords: Record<string, unknown> = {};
  const sidecar = path.join(path.dirname(configPath), "growthub.source-records.json");
  if (fs.existsSync(sidecar)) {
    try { sourceRecords = JSON.parse(fs.readFileSync(sidecar, "utf8")) as Record<string, unknown>; } catch { sourceRecords = {}; }
  }
  const preview = await previewPatchImpact(d, {
    currentConfig: workspaceConfig,
    mergedConfig: proposed,
    sourceRecords,
    changedFields: Array.from(changedFields),
    touchesLiveWorkflow: Boolean(opts.touchesLiveWorkflow),
  });
  const impact = preview.impact;
  const compliance = preview.contractCompliance;
  const disallowed = preview.allowlist.disallowed;
  let wrote = false;
  if (opts.write && !disallowed.length) {
    fs.writeFileSync(configPath, `${JSON.stringify(proposed, null, 2)}\n`, "utf8");
    wrote = true;
  }

  const payload = {
    kind: "growthub-patch-v1",
    config: configPath,
    changedFields: Array.from(changedFields),
    disallowed,
    impact,
    compliance,
    wrote,
    nextStep: disallowed.length
      ? `Remove disallowed field(s) ${disallowed.join(", ")} — only ${ALLOWED_PATCH_FIELDS.join(", ")} are patchable.`
      : wrote
        ? "Config written. Commit on a branch and open a PR (promotion to live stays on PATCH/publish)."
        : "Dry run. Re-run with --write to edit the repo artifact, then open a PR.",
  };

  emit(Boolean(opts.json), payload, () => {
    console.log(pc.bold("growthub patch") + pc.dim(` — ${configPath}`));
    console.log(`  changed: ${payload.changedFields.join(", ") || "(none)"}`);
    if (disallowed.length) console.log(`  ${pc.red("disallowed:")} ${disallowed.join(", ")}`);
    const im = impact as { summary?: string; removed?: unknown[] };
    console.log(`  ${pc.cyan("impact:")} ${im.summary}`);
    if (im.removed && im.removed.length) console.log(`  ${pc.red("removals:")} ${im.removed.length} (see impact.removed)`);
    console.log(`  ${pc.cyan("compliance:")} ${compliance.summary}`);
    console.log(`  ${wrote ? pc.green("written") : pc.yellow("dry-run")} — ${payload.nextStep}`);
  });
}

// ── S4: growthub capture ────────────────────────────────────────────────────

interface CaptureOpts { fork?: string; live?: string; json?: boolean }

async function captureCommand(opts: CaptureOpts): Promise<void> {
  const root = forkRoot(opts);
  const { configPath, workspaceConfig } = await buildGraphFromFork(root);
  const liveBase = (opts.live ?? "http://127.0.0.1:3777").replace(/\/$/, "");

  let liveConfig: Record<string, unknown> | null = null;
  let liveError: string | null = null;
  try {
    const res = await fetch(`${liveBase}/api/workspace`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    liveConfig = (body.workspaceConfig ?? body.config ?? null) as Record<string, unknown> | null;
  } catch (error) {
    liveError = (error as Error)?.message ?? "fetch failed";
  }

  const drift: Array<{ field: string; status: "in-sync" | "drifted" }> = [];
  if (liveConfig) {
    for (const field of ALLOWED_PATCH_FIELDS) {
      const same = JSON.stringify(workspaceConfig[field] ?? null) === JSON.stringify(liveConfig[field] ?? null);
      drift.push({ field, status: same ? "in-sync" : "drifted" });
    }
  }
  const drifted = drift.filter((x) => x.status === "drifted");

  const payload = {
    kind: "growthub-capture-v1",
    config: configPath,
    live: liveBase,
    liveError,
    drift,
    nextStep: liveError
      ? `Could not read live control plane at ${liveBase} (${liveError}). Boot it with 'growthub run' or pass --live <url>.`
      : drifted.length
        ? `Live drifted on ${drifted.map((d) => d.field).join(", ")}. Capture into the repo via 'growthub patch --set ...' then open a "reconcile live drift" PR.`
        : "Live and repo are in sync on all allowlisted fields.",
  };

  emit(Boolean(opts.json), payload, () => {
    console.log(pc.bold("growthub capture") + pc.dim(` — repo ${configPath} vs live ${liveBase}`));
    if (liveError) { console.log(`  ${pc.red("live unreachable:")} ${liveError}`); }
    else for (const d of drift) {
      console.log(`  ${d.status === "drifted" ? pc.yellow("≠") : pc.green("=")} ${d.field}: ${d.status}`);
    }
    console.log(pc.dim(`  → ${payload.nextStep}`));
  });
}

// ── S6: growthub serve --mcp ────────────────────────────────────────────────
// MCP-over-stdio (JSON-RPC 2.0), zero external deps. The agent's read + dry-run
// + guidance window onto the three-layer control plane (Mutation → Law →
// Intelligence). It maps to the plane deliberately:
//   - Layer 3 (Intelligence): every read-only projection (topology, blast
//     radius, lineage, stale, readiness, minimal change set, outcome ledger).
//   - Layer 2 (Law): preflight_patch — a DRY-RUN only (never writes config,
//     never applies a mutation). When a live runtime URL is configured it
//     PROXIES the authoritative POST /api/workspace/patch/preflight (which
//     "cannot disagree with the real PATCH") — note that route may record
//     governance receipts for blocked attempts; offline it is a clearly-
//     labelled approximation.
//   - Layer 1 (Mutation): NONE. No write/execute tool — that would be the
//     forbidden third mutation path. Instead `next_actions` emits the EXACT
//     governed call (route + body sketch) for the agent to run through the
//     sanctioned boundary itself.
// Live-aware: with --live, Intelligence reads reflect the running control plane;
// offline-first otherwise. Reuses the one metadata graph — never a second model.

const ANALYTICS_LAYER = { mutation: "Layer 1 — Mutation", law: "Layer 2 — Law", intelligence: "Layer 3 — Intelligence" } as const;

interface ServeOpts { fork?: string; mcp?: boolean; live?: string }

interface McpContext {
  workspaceConfig: Record<string, unknown>;
  workspaceSourceRecords: Record<string, unknown>;
  store: Record<string, unknown> & { [k: string]: unknown };
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  d: Awaited<ReturnType<typeof loadDerivers>>;
  h: Awaited<ReturnType<typeof loadGraphHelpers>>;
  liveUrl: string | null;
  // Truthful provenance of what the Intelligence tools are reading.
  source: string;
  // When this context was hydrated (ISO). In --live mode the server re-hydrates
  // per tool call, so this advances; offline it is fixed at startup.
  snapshotAt: string;
}

interface McpTool {
  name: string;
  layer: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (ctx: McpContext, args: Record<string, unknown>) => unknown | Promise<unknown>;
}

const NODE_ARG = { type: "object", properties: { nodeId: { type: "string", description: "metadataId of a graph node" } }, required: ["nodeId"] };
const NO_ARG = { type: "object", properties: {} };

function storeArr(ctx: McpContext, key: string): Array<Record<string, unknown>> {
  const value = ctx.store[key];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export function buildMcpTools(): McpTool[] {
  return [
    // ── Layer 3 — Intelligence (read-only) ──────────────────────────────────
    {
      name: "describe_workspace", layer: ANALYTICS_LAYER.intelligence,
      description: "Orient: workspace identity, capabilities, object/edge counts, provenance/privacy.",
      inputSchema: NO_ARG,
      handler: (ctx) => ({
        id: ctx.workspaceConfig.id, name: ctx.workspaceConfig.name, description: ctx.workspaceConfig.description,
        capabilities: ctx.workspaceConfig.capabilities ?? null,
        counts: Object.fromEntries(["objects", "fields", "views", "widgets", "dashboards", "workflows", "workflowNodes", "sandboxes", "integrations", "runs", "outputArtifacts", "pipelineHealth"].map((k) => [k, storeArr(ctx, k).length])),
        graph: { nodes: ctx.graph.nodes.length, edges: ctx.graph.edges.length },
        provenance: storeArr(ctx, "provenance")[0] ?? null,
        source: ctx.source,
        snapshotAt: ctx.snapshotAt,
      }),
    },
    {
      name: "list_data_model", layer: ANALYTICS_LAYER.intelligence,
      description: "The schema the agent must respect: objects (+fields, types, isLiveBacked, rowCount) and views.",
      inputSchema: NO_ARG,
      handler: (ctx) => ({
        objects: storeArr(ctx, "objects").map((o) => ({
          id: o.id, label: o.label, objectType: o.objectType, isLiveBacked: o.isLiveBacked, readOnly: o.readOnly,
          rowCount: o.rowCount, sourceAuthority: o.sourceAuthority,
          fields: storeArr(ctx, "fields").filter((f) => f.objectId === o.id).map((f) => ({ id: f.id, label: f.label, type: f.type, isSecret: f.isSecret, isFilterable: f.isFilterable, isSortable: f.isSortable, isAggregatable: f.isAggregatable })),
        })),
        views: storeArr(ctx, "views"),
      }),
    },
    {
      name: "list_dashboards", layer: ANALYTICS_LAYER.intelligence,
      description: "What's built and what's broken: dashboards + their widgets (bindings, required fields, warnings).",
      inputSchema: NO_ARG,
      handler: (ctx) => storeArr(ctx, "dashboards").map((dash) => ({
        id: dash.id, label: dash.label, widgetCount: dash.widgetCount,
        widgets: storeArr(ctx, "widgets").filter((w) => (dash.widgetIds as string[] | undefined)?.includes(w.id as string)).map((w) => ({ id: w.id, title: w.title, widgetKind: w.widgetKind, objectId: w.objectId, isLiveBacked: w.isLiveBacked, requiredFields: w.requiredFields, warnings: w.warnings })),
      })),
    },
    {
      name: "list_workflows", layer: ANALYTICS_LAYER.intelligence,
      description: "What can run vs. what's draft: workflows + nodes + lifecycle + required inputs.",
      inputSchema: NO_ARG,
      handler: (ctx) => storeArr(ctx, "workflows").map((wf) => ({
        id: wf.id, label: wf.label, lifecycleStatus: wf.lifecycleStatus, requiresInput: wf.requiresInput, nodeCount: wf.nodeCount,
        nodes: storeArr(ctx, "workflowNodes").filter((n) => n.workflowMetadataId === wf.metadataId).map((n) => ({ id: n.metadataId, label: n.label, nodeType: n.nodeType, readsObjectId: n.readsObjectId, writesObjectId: n.writesObjectId, requiresHumanInput: n.requiresHumanInput })),
      })),
    },
    {
      name: "list_integrations", layer: ANALYTICS_LAYER.intelligence,
      description: "What's connected / needs auth: integrations, entities, sandboxes (authStatus), source records.",
      inputSchema: NO_ARG,
      handler: (ctx) => ({
        integrations: storeArr(ctx, "integrations"),
        entities: storeArr(ctx, "integrationEntities"),
        sandboxes: storeArr(ctx, "sandboxes").map((s) => ({ id: s.id, label: s.label, adapter: s.adapter, authStatus: s.authStatus, lifecycleStatus: s.lifecycleStatus })),
        sourceRecords: storeArr(ctx, "sourceRecords").map((s) => ({ id: s.id, integrationId: s.integrationId, recordCount: s.recordCount, fetchedAt: s.fetchedAt })),
      }),
    },
    {
      name: "outcome_ledger", layer: ANALYTICS_LAYER.intelligence,
      description: "The governance/proof plane: runs, pipeline health, produced artifacts, provenance. For session continuity.",
      inputSchema: NO_ARG,
      handler: (ctx) => ({
        runs: storeArr(ctx, "runs").map((r) => ({ runId: r.runId, ranAt: r.ranAt, ok: r.ok, durationMs: r.durationMs, hasOutput: r.hasOutput })),
        pipelineHealth: storeArr(ctx, "pipelineHealth"),
        outputArtifacts: storeArr(ctx, "outputArtifacts"),
        provenance: storeArr(ctx, "provenance")[0] ?? null,
        note: ctx.liveUrl ? `For the live receipt stream + next actions, GET ${ctx.liveUrl}/api/workspace/agent-outcomes.` : "Boot the runtime and GET /api/workspace/agent-outcomes for the live receipt stream.",
      }),
    },
    {
      name: "describe_node", layer: ANALYTICS_LAYER.intelligence,
      description: "Drill into one node: summary + direct dependents/dependencies + selector enrichment.",
      inputSchema: NODE_ARG,
      handler: (ctx, args) => {
        const nodeId = String(args?.nodeId ?? "");
        const node = findNode(ctx.graph.nodes, nodeId);
        if (!node) return { error: `node not found: ${nodeId}` };
        const dependents = ctx.h.findDependents(ctx.graph, node.id).map((x) => ({ id: x.node.id, type: x.node.type, relation: x.relation }));
        const dependencies = ctx.h.findDependencies(ctx.graph, node.id).map((x) => ({ id: x.node.id, type: x.node.type, relation: x.relation }));
        const enrichment: Record<string, unknown> = {};
        if (node.type === "widget") enrichment.requiredFields = ctx.h.selectWidgetRequiredFields(ctx.store, String(node.summary?.id ?? node.id));
        if (node.type === "workflowNode") enrichment.inputSchema = ctx.h.selectWorkflowNodeInputSchema(ctx.store, node.metadataId);
        if (node.type === "run") enrichment.lineage = ctx.h.selectRunLineage(ctx.store, String(node.summary?.runId ?? node.id));
        return { node: { id: node.id, type: node.type, label: node.label, summary: node.summary }, dependents, dependencies, enrichment };
      },
    },
    {
      name: "get_workspace_topology", layer: ANALYTICS_LAYER.intelligence,
      description: "The full read-only metadata graph (nodes + edges).",
      inputSchema: NO_ARG,
      handler: (ctx) => ({ nodes: ctx.graph.nodes, edges: ctx.graph.edges }),
    },
    {
      name: "find_downstream_dependencies", layer: ANALYTICS_LAYER.intelligence,
      description: "Blast radius: the transitive set that depends on a node.",
      inputSchema: NODE_ARG,
      handler: (ctx, args) => ctx.d.deriveBlastRadius(ctx.graph, String(args?.nodeId ?? "")),
    },
    {
      name: "simulate_causal_impact", layer: ANALYTICS_LAYER.intelligence,
      description: "Stale surfaces + outcome-level workflow impact of changing a node.",
      inputSchema: NODE_ARG,
      handler: (ctx, args) => ({
        staleSurfaces: ctx.d.deriveStaleSurfaces(ctx.graph, { seedIds: [String(args?.nodeId ?? "")] }),
        workflowImpact: ctx.d.deriveWorkflowImpact(ctx.graph, String(args?.nodeId ?? "")),
      }),
    },
    {
      name: "trace_lineage", layer: ANALYTICS_LAYER.intelligence,
      description: "Provenance over the graph: `dependents` = what depends on this node / is impacted if it changes (incoming closure); `dependencies` = what this node depends on / is built from (outgoing closure). Legacy `ancestors`/`descendants` are accepted but DEPRECATED — they can mislead on non-run nodes; prefer dependents/dependencies.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" }, direction: { type: "string", enum: ["dependents", "dependencies", "both", "ancestors", "descendants"], description: "prefer dependents | dependencies | both (ancestors/descendants are deprecated aliases)" } }, required: ["nodeId"] },
      handler: (ctx, args) => ctx.d.deriveProvenanceLineage(ctx.graph, String(args?.nodeId ?? ""), { direction: args?.direction ?? "both" }),
    },
    {
      name: "app_readiness", layer: ANALYTICS_LAYER.intelligence,
      description: "Ship-readiness eligibility verdict { ready, blocking[], nextAction }.",
      inputSchema: { type: "object", properties: { appId: { type: "string" } } },
      handler: (ctx, args) => ctx.d.deriveAppReadiness(ctx.graph, args?.appId ? { appId: String(args.appId) } : {}),
    },
    // ── Layer 2 — Law (dry-run only) ─────────────────────────────────────────
    {
      name: "preflight_patch", layer: ANALYTICS_LAYER.law,
      description: "DRY-RUN a proposed PATCH: allowlist + blast radius + contract compliance. With a live runtime it proxies the AUTHORITATIVE preflight route (forwarding `appScope` as x-growthub-app-scope so scoped validation matches the real PATCH). Never writes workspace config and never applies a mutation; a live preflight may record governance receipts (e.g. blocked-attempt telemetry) per that route.",
      inputSchema: { type: "object", properties: { patch: { type: "object", description: "the exact PATCH body you intend to send" }, appScope: { type: "string", description: "app id to scope validation to (forwarded as x-growthub-app-scope, matching the real PATCH)" } }, required: ["patch"] },
      handler: async (ctx, args) => {
        const patch = (args?.patch && typeof args.patch === "object" ? args.patch : {}) as Record<string, unknown>;
        const appScope = args?.appScope ? String(args.appScope) : "";

        // Authoritative path: proxy the live preflight route when available,
        // forwarding app-scope so a scoped dry-run equals the scoped real PATCH.
        if (ctx.liveUrl) {
          try {
            const headers: Record<string, string> = { "content-type": "application/json" };
            if (appScope) headers["x-growthub-app-scope"] = appScope;
            const res = await fetch(`${ctx.liveUrl}/api/workspace/patch/preflight`, {
              method: "POST", headers, body: JSON.stringify(patch),
              signal: AbortSignal.timeout(8000),
            });
            const authoritative = await res.json();
            return { mode: "live-authoritative", appScope: appScope || null, authoritative };
          } catch (error) {
            return { mode: "offline-fallback", reason: `live preflight unreachable: ${(error as Error)?.message}`, ...(await offlinePatchPreview(ctx, patch)) };
          }
        }
        return { mode: "offline-approximation", note: "Authoritative schema/layout/policy validation is POST /api/workspace/patch/preflight on the running runtime.", ...(await offlinePatchPreview(ctx, patch)) };
      },
    },
    // ── Layer 1 hand-off (NOT a mutation tool) ───────────────────────────────
    {
      name: "next_actions", layer: ANALYTICS_LAYER.mutation,
      description: "Governed next steps: prioritized blockers/stale surfaces, each as the EXACT governed call to run through the sanctioned boundary (MCP never mutates).",
      inputSchema: NO_ARG,
      handler: (ctx) => {
        const readiness = ctx.d.deriveAppReadiness(ctx.graph) as { blocking?: Array<{ message: string; nextAction?: string }>; warnings?: Array<{ message: string; nextAction?: string }> };
        const stale = ctx.d.deriveStaleSurfaces(ctx.graph) as { staleSurfaces?: unknown[]; summary?: string };
        const actions: Array<{ priority: number; reason: string; governedCall: string }> = [];
        for (const b of readiness.blocking ?? []) actions.push({ priority: 0, reason: b.message, governedCall: b.nextAction ?? "see app_readiness" });
        for (const w of readiness.warnings ?? []) actions.push({ priority: 1, reason: w.message, governedCall: w.nextAction ?? "see app_readiness" });
        if ((stale.staleSurfaces ?? []).length) actions.push({ priority: 1, reason: stale.summary ?? "stale surfaces", governedCall: "POST /api/workspace/refresh-sources, then re-derive" });
        return {
          boundary: "MCP emits the call; the agent executes it via PATCH /api/workspace · sandbox-run · workflow/publish · helper/apply. There is no third mutation path.",
          actions: actions.sort((a, b) => a.priority - b.priority),
        };
      },
    },
  ];
}

// Offline approximation of the Law layer — clearly NON-authoritative. Merges the
// allowlisted keys over the live/offline config, rebuilds the graph, and runs the
// SAME `previewPatchImpact` the `growthub patch` command uses (no second path).
async function offlinePatchPreview(ctx: McpContext, patch: Record<string, unknown>) {
  const changedFields = Object.keys(patch);
  const proposed = { ...ctx.workspaceConfig } as Record<string, unknown>;
  for (const f of changedFields) if (ALLOWED_PATCH_FIELDS.includes(f)) proposed[f] = patch[f];
  try {
    // Same shared deriver as the route + CLI — diffs current vs merged (incl
    // removals), with the source-record sidecar so live-backed nodes keep their
    // freshness (R4).
    const { impact, contractCompliance, allowlist } = await previewPatchImpact(ctx.d, {
      currentConfig: ctx.workspaceConfig,
      mergedConfig: proposed,
      sourceRecords: ctx.workspaceSourceRecords,
      changedFields,
    });
    return { allowlist, contractCompliance, impact };
  } catch {
    // Graph build failed — still return the allowlist verdict (pure, no graph).
    const disallowed = changedFields.filter((f) => !ALLOWED_PATCH_FIELDS.includes(f));
    return {
      allowlist: { ok: disallowed.length === 0, disallowed, allowed: ALLOWED_PATCH_FIELDS },
      contractCompliance: ctx.d.deriveContractCompliance({ changedFields }, undefined, {}),
      impact: null,
    };
  }
}

/**
 * Build the MCP context. With a live URL, Intelligence reads are hydrated from
 * the running control plane's OWN authoritative routes (GET /api/workspace/
 * metadata-graph for store+graph, GET /api/workspace for config) — so a tool
 * that reports `source: live:<url>` is genuinely reading live state (review A).
 * On any live failure it falls back to the offline fork and says so honestly.
 */
async function hydrateContext(
  root: string,
  liveUrl: string | null,
  d: McpContext["d"],
  h: McpContext["h"],
): Promise<McpContext> {
  if (liveUrl) {
    try {
      const mgRes = await fetch(`${liveUrl}/api/workspace/metadata-graph`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!mgRes.ok) throw new Error(`metadata-graph HTTP ${mgRes.status}`);
      const mg = (await mgRes.json()) as { metadata?: Record<string, unknown>; graph?: { nodes: GraphNode[]; edges: GraphEdge[] } };
      const wsRes = await fetch(`${liveUrl}/api/workspace`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!wsRes.ok) throw new Error(`workspace HTTP ${wsRes.status}`);
      const ws = (await wsRes.json()) as Record<string, unknown>;
      return {
        workspaceConfig: (ws.workspaceConfig ?? ws.config ?? {}) as Record<string, unknown>,
        workspaceSourceRecords: (ws.workspaceSourceRecords ?? {}) as Record<string, unknown>,
        store: (mg.metadata ?? {}) as McpContext["store"],
        graph: mg.graph ?? { nodes: [], edges: [] },
        d, h, liveUrl, source: `live:${liveUrl}`, snapshotAt: new Date().toISOString(),
      };
    } catch (error) {
      const off = await buildGraphFromFork(root);
      return { workspaceConfig: off.workspaceConfig, workspaceSourceRecords: off.workspaceSourceRecords, store: off.store, graph: off.graph, d, h, liveUrl, source: `offline-fallback (${liveUrl} unreachable: ${(error as Error)?.message})`, snapshotAt: new Date().toISOString() };
    }
  }
  const off = await buildGraphFromFork(root);
  return { workspaceConfig: off.workspaceConfig, workspaceSourceRecords: off.workspaceSourceRecords, store: off.store, graph: off.graph, d, h, liveUrl: null, source: "offline-config", snapshotAt: new Date().toISOString() };
}

async function serveMcp(root: string, liveUrl: string | null): Promise<void> {
  const d = await loadDerivers();
  const h = await loadGraphHelpers();
  let ctx = await hydrateContext(root, liveUrl, d, h);
  const tools = buildMcpTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const rl = readline.createInterface({ input: process.stdin });

  const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const reply = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
  const fail = (id: unknown, message: string) => send({ jsonrpc: "2.0", id, error: { code: -32603, message } });

  rl.on("line", (line: string) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
      try { msg = JSON.parse(trimmed); } catch { return; }
      try {
        if (msg.method === "initialize") {
          reply(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "growthub-governed-universe", version: "1" } });
        } else if (msg.method === "tools/list") {
          reply(msg.id, { tools: tools.map((t) => ({ name: t.name, description: `[${t.layer}] ${t.description}`, inputSchema: t.inputSchema })) });
        } else if (msg.method === "tools/call") {
          const tool = byName.get(String(msg.params?.name ?? ""));
          if (!tool) { fail(msg.id, `unknown tool: ${msg.params?.name}`); return; }
          // R1: in --live mode re-hydrate before each call so reads reflect the
          // CURRENT control plane (after a governed change lands), never a stale
          // startup snapshot. Offline forks are static, so reuse the snapshot.
          if (ctx.liveUrl) ctx = await hydrateContext(root, liveUrl, d, h);
          const out = await tool.handler(ctx, (msg.params?.arguments as Record<string, unknown>) ?? {});
          reply(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
        } else if (msg.id !== undefined) {
          fail(msg.id, `unsupported method: ${msg.method}`);
        }
      } catch (error) {
        if (msg.id !== undefined) fail(msg.id, (error as Error)?.message ?? "tool error");
      }
    })();
  });
  process.stderr.write(`growthub serve --mcp ready (${ctx.graph.nodes.length} nodes, ${tools.length} tools, source=${ctx.source}${ctx.liveUrl ? ", re-hydrates per call" : ""}). Layers: Intelligence(read) + Law(dry-run) + governed hand-off.\n`);
}

async function serveCommand(opts: ServeOpts): Promise<void> {
  if (!opts.mcp) throw new Error("growthub serve currently supports --mcp only");
  await serveMcp(forkRoot(opts), opts.live ? opts.live.replace(/\/$/, "") : null);
}

// ── registration ────────────────────────────────────────────────────────────

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerWorkspaceDerivationCommands(program: Command): void {
  program
    .command("plan")
    .description("Causal pre-merge impact over the offline workspace graph (blast radius, stale surfaces, lineage)")
    .option("--fork <path>", "Fork/workspace root (default: cwd)")
    .option("--impact <nodeId>", "Report blast radius + workflow impact of changing this node")
    .option("--workflow <nodeId>", "Report outcome-level workflow impact for this node")
    .option("--lineage <nodeId>", "Trace provenance lineage (dependents + dependencies) of this node")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: PlanOpts) => planCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));

  program
    .command("readiness")
    .description("App ship-readiness verdict, optionally rolled across multiple forks")
    .option("--fork <path>", "Fork/workspace root (repeatable; default: cwd)", collect, [])
    .option("--app <id>", "Restrict to a single app scope")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: ReadinessOpts) => readinessCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));

  program
    .command("patch")
    .description("Offline intent→path edit with blast radius + contract compliance; PR-ready (never a live write)")
    .option("--fork <path>", "Fork/workspace root (default: cwd)")
    .option("--set <path=jsonValue>", "Set a dotted/bracket path (repeatable)", collect, [])
    .option("--touches-live-workflow", "Mark this change as touching a live workflow (stricter compliance)")
    .option("--write", "Write the edited config to the repo artifact (default: dry-run)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: PatchOpts) => patchCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));

  program
    .command("capture")
    .description("Compare the live control plane (GET /api/workspace) against the repo artifact and report drift")
    .option("--fork <path>", "Fork/workspace root (default: cwd)")
    .option("--live <url>", "Live workspace base URL (default: http://127.0.0.1:3777)")
    .option("--drift", "Report drift (default behaviour)")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: CaptureOpts) => captureCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));

  program
    .command("serve")
    .description("Serve the governed workspace as read-only MCP tools over stdio (Intelligence reads + Law dry-run + governed hand-off)")
    .option("--fork <path>", "Fork/workspace root (default: cwd)")
    .option("--mcp", "Run as an MCP (Model Context Protocol) stdio server")
    .option("--live <url>", "Live runtime base URL — Intelligence reads reflect it and preflight_patch proxies the authoritative route")
    .action((opts: ServeOpts) => serveCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));
}
