/**
 * Saved Workflows — extraction module
 *
 * Hosted-first listing and detail loaders for user-saved workflow pipelines,
 * with a deterministic local fallback under `${PAPERCLIP_HOME}/workflows`.
 *
 * Extracted from `cli/src/commands/workflow.ts` so non-CLI callers (the CMS
 * workflow context packet, future MCP surfaces, headless execution helpers)
 * can resolve a workflow by id without dragging in the picker UI.
 *
 * Behaviour parity with the prior in-place implementation is intentional —
 * this is a no-behavior-change refactor.
 */

import fs from "node:fs";
import path from "node:path";
import {
  fetchHostedWorkflow,
  HostedEndpointUnavailableError,
  listHostedWorkflows,
} from "../../auth/hosted-client.js";
import { isSessionExpired, readSession } from "../../auth/session-store.js";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import {
  deserializePipeline,
  type DynamicRegistryPipeline,
} from "../dynamic-registry-pipeline/index.js";
import type { WorkflowLabel } from "../workflow-hygiene/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedWorkflowEntry {
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

export interface SavedWorkflowDetail {
  pipeline: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function resolveSavedWorkflowsDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "workflows");
}

// ---------------------------------------------------------------------------
// Local fallback list
// ---------------------------------------------------------------------------

export function listLocalSavedWorkflows(): SavedWorkflowEntry[] {
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

// ---------------------------------------------------------------------------
// Hosted-first list
// ---------------------------------------------------------------------------

export async function listSavedWorkflows(): Promise<SavedWorkflowEntry[]> {
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

// ---------------------------------------------------------------------------
// Detail loader
// ---------------------------------------------------------------------------

export async function loadSavedWorkflowDetail(entry: SavedWorkflowEntry): Promise<SavedWorkflowDetail> {
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

  if (!entry.filename) {
    throw new Error("Local workflow entry is missing filename.");
  }

  const dir = resolveSavedWorkflowsDir();
  const content = fs.readFileSync(path.resolve(dir, entry.filename), "utf-8");
  const raw = JSON.parse(content);
  return {
    pipeline: (raw.pipeline ?? raw) as Record<string, unknown>,
    createdAt: raw.createdAt ?? "",
  };
}

// ---------------------------------------------------------------------------
// Pipeline normalization (raw saved-workflow JSON → DynamicRegistryPipeline)
// ---------------------------------------------------------------------------

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

export function toExecutableSavedWorkflowPipeline(
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
// Convenience: find by id (used by the CMS workflow context packet)
// ---------------------------------------------------------------------------

export interface SavedWorkflowFindResult {
  entry: SavedWorkflowEntry;
  detail: SavedWorkflowDetail;
  pipeline: DynamicRegistryPipeline;
}

/**
 * Resolve a saved workflow by id. Searches by `workflowId`, falling back to
 * `pipelineId`, across hosted + local sources. Returns `null` when no match
 * is found rather than throwing — callers decide whether absence is fatal.
 */
export async function findSavedWorkflowById(
  workflowId: string,
): Promise<SavedWorkflowFindResult | null> {
  const trimmed = workflowId.trim();
  if (!trimmed) return null;

  const entries = await listSavedWorkflows();
  const match =
    entries.find((entry) => entry.workflowId === trimmed) ??
    entries.find((entry) => entry.pipelineId === trimmed) ??
    null;
  if (!match) return null;

  const detail = await loadSavedWorkflowDetail(match);
  const pipeline = toExecutableSavedWorkflowPipeline(match, detail.pipeline);
  return { entry: match, detail, pipeline };
}
