/**
 * Shared bridge from the CLI to the governed workspace's pure derivers.
 *
 * The metadata graph builders and the causal derivers ship as frozen ESM
 * modules inside the worker-kit assets (the SAME code the Workspace Map and the
 * API routes run). The CLI does not re-implement them — it dynamic-imports them
 * and builds the read-only graph from an OFFLINE `growthub.config.json`. This
 * keeps a single source of truth: `growthub plan`, the Map, and preflight all
 * derive from one spine.
 *
 * Everything here is read-only: it reads config + source-record sidecars from
 * disk and returns view-models. No writes, no network, no mutation path.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT_ID = "growthub-custom-workspace-starter-v1";
const LIB_REL = path.join("apps", "workspace", "lib");
const KIT_LIB_TAIL = path.join("assets", "worker-kits", KIT_ID, LIB_REL);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Walk up from `start` looking for a directory that contains the kit lib. */
function findKitLibFrom(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, KIT_LIB_TAIL);
    if (fs.existsSync(path.join(candidate, "workspace-metadata-graph.js"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Resolve the frozen kit lib directory across installed + repo layouts. */
export function resolveKitLibDir(): string {
  const candidates = [
    findKitLibFrom(moduleDir), // installed: <pkg>/dist/runtime → <pkg>/assets ; repo: cli/src/runtime → cli/assets
    findKitLibFrom(process.cwd()),
  ].filter((value): value is string => Boolean(value));
  if (!candidates.length) {
    throw new Error(
      `Could not locate ${KIT_LIB_TAIL}. Looked up from ${moduleDir} and ${process.cwd()}.`,
    );
  }
  return candidates[0];
}

async function importKitLib<T = Record<string, unknown>>(file: string): Promise<T> {
  const full = path.join(resolveKitLibDir(), file);
  return (await import(pathToFileURL(full).href)) as T;
}

export interface WorkspaceGraphBundle {
  configPath: string;
  workspaceConfig: Record<string, unknown>;
  store: { nodes?: unknown[]; warnings?: string[] } & Record<string, unknown>;
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; warnings?: string[] };
  warnings: string[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  summary?: Record<string, unknown>;
  metadataId: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
}

/** Candidate offline config locations under a fork root. */
function configCandidates(forkPath: string): string[] {
  return [
    path.resolve(forkPath, "growthub.config.json"),
    path.resolve(forkPath, "apps/workspace/growthub.config.json"),
  ];
}

function readJsonSafe(filePath: string): { value: Record<string, unknown> | null; error?: string } {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown> };
  } catch (error) {
    return { value: null, error: (error as Error)?.message ?? "parse error" };
  }
}

/**
 * Build the metadata store + graph from an IN-MEMORY config. Pure — no disk,
 * no network. Used both by `buildGraphFromFork` and by the MCP `preflight_patch`
 * tool (which merges a proposed patch over the config before re-deriving).
 */
export async function buildGraphFromConfig(
  workspaceConfig: Record<string, unknown>,
  workspaceSourceRecords: Record<string, unknown> = {},
): Promise<{ store: WorkspaceGraphBundle["store"]; graph: WorkspaceGraphBundle["graph"]; warnings: string[] }> {
  const warnings: string[] = [];
  const storeMod = await importKitLib<{ buildWorkspaceMetadataStore: (input: unknown) => WorkspaceGraphBundle["store"] }>(
    "workspace-metadata-store.js",
  );
  const graphMod = await importKitLib<{ buildWorkspaceMetadataGraph: (store: unknown) => WorkspaceGraphBundle["graph"] }>(
    "workspace-metadata-graph.js",
  );
  const store = storeMod.buildWorkspaceMetadataStore({ workspaceConfig, workspaceSourceRecords });
  if (Array.isArray(store.warnings)) warnings.push(...store.warnings);
  const graph = graphMod.buildWorkspaceMetadataGraph(store);
  if (Array.isArray(graph.warnings)) warnings.push(...graph.warnings);
  return { store, graph, warnings };
}

/**
 * Build the metadata graph from an offline fork. Pure read — never writes.
 */
export async function buildGraphFromFork(forkPath: string): Promise<WorkspaceGraphBundle> {
  const warnings: string[] = [];
  const configPath = configCandidates(forkPath).find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    throw new Error(`No growthub.config.json under ${forkPath} (or its apps/workspace/).`);
  }

  const { value: workspaceConfig, error } = readJsonSafe(configPath);
  if (!workspaceConfig) throw new Error(`growthub.config.json parse error: ${error}`);

  // Optional source-record sidecar next to the config.
  let workspaceSourceRecords: Record<string, unknown> = {};
  const sidecar = path.join(path.dirname(configPath), "growthub.source-records.json");
  if (fs.existsSync(sidecar)) {
    const { value, error: sidecarError } = readJsonSafe(sidecar);
    if (value) workspaceSourceRecords = value;
    else warnings.push(`source-records sidecar parse error: ${sidecarError}`);
  }

  const built = await buildGraphFromConfig(workspaceConfig, workspaceSourceRecords);
  warnings.push(...built.warnings);
  return { configPath, workspaceConfig, store: built.store, graph: built.graph, warnings };
}

/**
 * Graph traversal helpers + read-only selectors from the kit, for the MCP
 * descriptive/drill-down tools (a widget's required fields, a workflow node's
 * input schema, a run's lineage, single-hop dependents/dependencies).
 */
export async function loadGraphHelpers(): Promise<{
  findDependents: (graph: unknown, id: string) => Array<{ node: GraphNode; relation: string }>;
  findDependencies: (graph: unknown, id: string) => Array<{ node: GraphNode; relation: string }>;
  selectWidgetRequiredFields: (store: unknown, widgetId: string) => Record<string, unknown>;
  selectWorkflowNodeInputSchema: (store: unknown, nodeMetadataId: string) => Record<string, unknown>;
  selectRunLineage: (store: unknown, runId: string) => Record<string, unknown> | null;
}> {
  const graphMod = await importKitLib<Record<string, never>>("workspace-metadata-graph.js");
  const selMod = await importKitLib<Record<string, never>>("workspace-metadata-selectors.js");
  return {
    findDependents: graphMod.findDependents,
    findDependencies: graphMod.findDependencies,
    selectWidgetRequiredFields: selMod.selectWidgetRequiredFields,
    selectWorkflowNodeInputSchema: selMod.selectWorkflowNodeInputSchema,
    selectRunLineage: selMod.selectRunLineage,
  };
}

/** The derivers, lazily imported once. */
export async function loadDerivers(): Promise<{
  deriveBlastRadius: (graph: unknown, id: string, opts?: unknown) => Record<string, unknown>;
  deriveStaleSurfaces: (graph: unknown, opts?: unknown) => Record<string, unknown>;
  deriveWorkflowImpact: (graph: unknown, id: string, opts?: unknown) => Record<string, unknown>;
  deriveProvenanceLineage: (graph: unknown, id: string, opts?: unknown) => Record<string, unknown>;
  deriveAppReadiness: (graph: unknown, opts?: unknown) => Record<string, unknown>;
  deriveContractCompliance: (mutation: unknown, contract?: unknown, evidence?: unknown) => Record<string, unknown>;
  deriveMinimalChangeSet: (graph: unknown, id: string, opts?: unknown) => Record<string, unknown>;
}> {
  const [impact, stale, workflow, lineage, readiness, compliance, changeset] = await Promise.all([
    importKitLib<{ deriveBlastRadius: never }>("workspace-metadata-impact.js"),
    importKitLib<{ deriveStaleSurfaces: never }>("workspace-stale-surfaces.js"),
    importKitLib<{ deriveWorkflowImpact: never }>("workspace-workflow-impact.js"),
    importKitLib<{ deriveProvenanceLineage: never }>("workspace-provenance-lineage.js"),
    importKitLib<{ deriveAppReadiness: never }>("workspace-app-readiness.js"),
    importKitLib<{ deriveContractCompliance: never }>("workspace-contract-compliance.js"),
    importKitLib<{ deriveMinimalChangeSet: never }>("workspace-minimal-changeset.js"),
  ]);
  return {
    deriveBlastRadius: (impact as Record<string, never>).deriveBlastRadius,
    deriveStaleSurfaces: (stale as Record<string, never>).deriveStaleSurfaces,
    deriveWorkflowImpact: (workflow as Record<string, never>).deriveWorkflowImpact,
    deriveProvenanceLineage: (lineage as Record<string, never>).deriveProvenanceLineage,
    deriveAppReadiness: (readiness as Record<string, never>).deriveAppReadiness,
    deriveContractCompliance: (compliance as Record<string, never>).deriveContractCompliance,
    deriveMinimalChangeSet: (changeset as Record<string, never>).deriveMinimalChangeSet,
  };
}

export { KIT_ID };
