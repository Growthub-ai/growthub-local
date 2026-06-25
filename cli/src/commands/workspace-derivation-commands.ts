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
import { buildGraphFromFork, loadDerivers, type GraphNode } from "../runtime/workspace-derivations.js";

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

  // Rebuild the graph from the PROPOSED config to derive the blast radius.
  const d = await loadDerivers();
  const tmpFork = path.join(root, ".growthub-fork");
  fs.mkdirSync(tmpFork, { recursive: true });
  const proposalPath = path.join(tmpFork, "patch-proposal.json");
  fs.writeFileSync(proposalPath, `${JSON.stringify(proposed, null, 2)}\n`, "utf8");
  const { graph } = await buildGraphFromFork(tmpFork);

  const seedIds = graph.nodes
    .filter((n) => n.type === "dataModelObject" || n.type === "dashboard")
    .map((n) => n.id);
  const impact = d.deriveStaleSurfaces(graph, { seedIds });
  const compliance = d.deriveContractCompliance(
    { changedFields: Array.from(changedFields), touchesLiveWorkflow: Boolean(opts.touchesLiveWorkflow) },
    undefined,
    { hasPreflightReceipt: false },
  );

  const disallowed = Array.from(changedFields).filter((f) => !ALLOWED_PATCH_FIELDS.includes(f));
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
    proposal: proposalPath,
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
    console.log(`  ${pc.cyan("impact:")} ${impact.summary}`);
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
// Minimal MCP-over-stdio (JSON-RPC 2.0) server, zero external deps. Read-only:
// every tool is a pure derivation over the offline graph. No mutation tools.

interface ServeOpts { fork?: string; mcp?: boolean }

function mcpTools(): Array<{ name: string; description: string }> {
  return [
    { name: "get_workspace_topology", description: "Return the read-only metadata graph (nodes + edges)." },
    { name: "find_downstream_dependencies", description: "Blast radius: what depends on a node. Args: { nodeId }." },
    { name: "simulate_causal_impact", description: "Stale surfaces + workflow impact of changing a node. Args: { nodeId }." },
    { name: "trace_lineage", description: "Provenance ancestors/descendants of a node. Args: { nodeId, direction? }." },
    { name: "app_readiness", description: "Ship-readiness verdict for the workspace. Args: { appId? }." },
    { name: "minimal_change_set", description: "Smallest upstream change set to refresh a target. Args: { nodeId }." },
  ];
}

async function serveMcp(root: string): Promise<void> {
  const { graph } = await buildGraphFromFork(root);
  const d = await loadDerivers();
  const rl = readline.createInterface({ input: process.stdin });

  const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const reply = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
  const fail = (id: unknown, message: string) => send({ jsonrpc: "2.0", id, error: { code: -32603, message } });

  const callTool = (name: string, args: Record<string, unknown>): unknown => {
    const nodeId = String(args?.nodeId ?? "");
    switch (name) {
      case "get_workspace_topology": return { nodes: graph.nodes, edges: graph.edges };
      case "find_downstream_dependencies": return d.deriveBlastRadius(graph, nodeId);
      case "simulate_causal_impact":
        return { staleSurfaces: d.deriveStaleSurfaces(graph, { seedIds: [nodeId] }), workflowImpact: d.deriveWorkflowImpact(graph, nodeId) };
      case "trace_lineage": return d.deriveProvenanceLineage(graph, nodeId, { direction: args?.direction ?? "both" });
      case "app_readiness": return d.deriveAppReadiness(graph, args?.appId ? { appId: String(args.appId) } : {});
      case "minimal_change_set": return d.deriveMinimalChangeSet(graph, nodeId);
      default: throw new Error(`unknown tool: ${name}`);
    }
  };

  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try { msg = JSON.parse(trimmed); } catch { return; }
    try {
      if (msg.method === "initialize") {
        reply(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "growthub-derivations", version: "1" } });
      } else if (msg.method === "tools/list") {
        reply(msg.id, { tools: mcpTools().map((t) => ({ ...t, inputSchema: { type: "object", properties: { nodeId: { type: "string" } } } })) });
      } else if (msg.method === "tools/call") {
        const name = String(msg.params?.name ?? "");
        const out = callTool(name, (msg.params?.arguments as Record<string, unknown>) ?? {});
        reply(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } else if (msg.id !== undefined) {
        fail(msg.id, `unsupported method: ${msg.method}`);
      }
    } catch (error) {
      if (msg.id !== undefined) fail(msg.id, (error as Error)?.message ?? "tool error");
    }
  });
  // Keep the process alive on stdio.
  process.stderr.write(`growthub serve --mcp ready (${graph.nodes.length} nodes); tools: ${mcpTools().map((t) => t.name).join(", ")}\n`);
}

async function serveCommand(opts: ServeOpts): Promise<void> {
  if (!opts.mcp) throw new Error("growthub serve currently supports --mcp only");
  await serveMcp(forkRoot(opts));
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
    .option("--lineage <nodeId>", "Trace provenance lineage (ancestors + descendants) of this node")
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
    .description("Serve the workspace derivers as read-only MCP tools over stdio")
    .option("--fork <path>", "Fork/workspace root (default: cwd)")
    .option("--mcp", "Run as an MCP (Model Context Protocol) stdio server")
    .action((opts: ServeOpts) => serveCommand(opts).catch((e: Error) => { console.error(pc.red(e.message)); process.exitCode = 1; }));
}
