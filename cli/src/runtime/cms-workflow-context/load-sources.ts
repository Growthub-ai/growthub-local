/**
 * CMS Workflow Context — Source loaders
 *
 * Thin adapters around the existing primitives that the packet composer
 * needs as inputs. Each loader returns both the value and a small
 * provenance record (`PacketSourceKind` + `fetchedAt`/`path`) so the
 * composer can populate `packet.sources.*` deterministically.
 *
 * No I/O happens in `compose.ts` — all fetches and filesystem reads live
 * here, behind narrow async functions that are easy to mock in unit
 * tests.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  BridgeHostedAgentDiagnostics,
  BridgeHostedAgentManifest,
  BridgeHostedAgentWorkspaceBinding,
} from "@growthub/api-contract/bridge";
import type { CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
import { resolveInForkStateDir } from "../../config/kit-forks-home.js";
import { listKitForkRegistrations } from "../../kits/fork-registry.js";
import {
  readKitForkPolicy,
  type KitForkPolicy,
} from "../../kits/fork-policy.js";
import { tailKitForkTrace } from "../../kits/fork-trace.js";
import { readSessionMemory, type SessionMemoryHead } from "../../skills/session-memory.js";
import { readManifestCache } from "../cms-manifest-cache/index.js";
import { createGrowthubBridgeClient } from "../growthub-bridge-client/index.js";
import {
  findSavedWorkflowById,
  type SavedWorkflowFindResult,
} from "../saved-workflows/index.js";
import type { PacketSourceKind } from "./types.js";

// ---------------------------------------------------------------------------
// Manifest envelope
// ---------------------------------------------------------------------------

export interface ManifestEnvelopeLoad {
  envelope: CapabilityManifestEnvelope | null;
  source: PacketSourceKind;
  fetchedAt?: string;
  /** Stale = read from cache more than 24h ago. */
  stale: boolean;
}

const MANIFEST_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function loadManifestEnvelope(): ManifestEnvelopeLoad {
  const envelope = readManifestCache();
  if (!envelope) {
    return { envelope: null, source: "missing", stale: false };
  }
  const fetchedAtMs = Date.parse(envelope.fetchedAt);
  const ageMs = Number.isFinite(fetchedAtMs) ? Date.now() - fetchedAtMs : Infinity;
  return {
    envelope,
    source: "cache",
    fetchedAt: envelope.fetchedAt,
    stale: ageMs > MANIFEST_STALE_THRESHOLD_MS,
  };
}

// ---------------------------------------------------------------------------
// Saved workflow
// ---------------------------------------------------------------------------

export interface SavedWorkflowLoad {
  result: SavedWorkflowFindResult | null;
  source: PacketSourceKind;
  fetchedAt?: string;
}

export async function loadSavedWorkflow(workflowId: string): Promise<SavedWorkflowLoad> {
  const result = await findSavedWorkflowById(workflowId);
  if (!result) return { result: null, source: "missing" };
  return {
    result,
    source: result.entry.source === "hosted" ? "hosted" : "local",
    fetchedAt: result.detail.createdAt || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Agent manifest + binding
// ---------------------------------------------------------------------------

export interface AgentLoad {
  /** Resolved agent slug, when known. */
  slug?: string;
  /** Local workspace binding, when materialised. */
  binding: BridgeHostedAgentWorkspaceBinding | null;
  /** Manifest from local binding or fetched live from the bridge. */
  manifest: BridgeHostedAgentManifest | null;
  diagnostics?: BridgeHostedAgentDiagnostics;
  source: PacketSourceKind;
  fetchedAt?: string;
  bindingPath?: string;
  /** Set when the caller passed no slug AND no single binding could be auto-selected. */
  autoSelectAmbiguous?: boolean;
  /** Returned when the bridge fetch failed (no auth / network). */
  bridgeFetchError?: string;
}

function bindingFileSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveAgentsDir(workspacePath: string): string {
  return path.resolve(workspacePath, ".growthub-fork", "agents");
}

function readAgentBinding(workspacePath: string, slug: string): {
  binding: BridgeHostedAgentWorkspaceBinding | null;
  bindingPath: string;
} {
  const safe = bindingFileSlug(slug);
  const bindingPath = path.resolve(resolveAgentsDir(workspacePath), `${safe}.json`);
  if (!fs.existsSync(bindingPath)) return { binding: null, bindingPath };
  try {
    const parsed = JSON.parse(fs.readFileSync(bindingPath, "utf8")) as BridgeHostedAgentWorkspaceBinding;
    return { binding: parsed, bindingPath };
  } catch {
    return { binding: null, bindingPath };
  }
}

function listLocalAgentBindings(workspacePath: string): BridgeHostedAgentWorkspaceBinding[] {
  const dir = resolveAgentsDir(workspacePath);
  if (!fs.existsSync(dir)) return [];
  const out: BridgeHostedAgentWorkspaceBinding[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(dir, file), "utf8")) as BridgeHostedAgentWorkspaceBinding;
      if (parsed.agentSlug) out.push(parsed);
    } catch {
      /* ignore malformed bindings */
    }
  }
  return out;
}

export async function loadAgent(input: {
  agentSlug?: string;
  workspacePath?: string;
}): Promise<AgentLoad> {
  const { agentSlug, workspacePath } = input;

  // Auto-select when no slug provided but the workspace has exactly one binding.
  if (!agentSlug) {
    if (workspacePath) {
      const bindings = listLocalAgentBindings(workspacePath);
      if (bindings.length === 1) {
        const binding = bindings[0];
        return {
          slug: binding.agentSlug,
          binding,
          manifest: (binding.manifest ?? null) as BridgeHostedAgentManifest | null,
          diagnostics: binding.diagnostics,
          source: "local",
          fetchedAt: binding.boundAt,
          bindingPath: path.resolve(resolveAgentsDir(workspacePath), `${bindingFileSlug(binding.agentSlug)}.json`),
        };
      }
      if (bindings.length > 1) {
        return {
          binding: null,
          manifest: null,
          source: "missing",
          autoSelectAmbiguous: true,
        };
      }
    }
    return { binding: null, manifest: null, source: "missing" };
  }

  // 1) Try local binding first.
  if (workspacePath) {
    const { binding, bindingPath } = readAgentBinding(workspacePath, agentSlug);
    if (binding) {
      return {
        slug: binding.agentSlug,
        binding,
        manifest: (binding.manifest ?? null) as BridgeHostedAgentManifest | null,
        diagnostics: binding.diagnostics,
        source: "local",
        fetchedAt: binding.boundAt,
        bindingPath,
      };
    }
  }

  // 2) Fall back to a live bridge fetch.
  try {
    const client = createGrowthubBridgeClient();
    const response = await client.inspectHostedAgentManifest(agentSlug);
    const manifest = response.manifest ?? response.agent ?? null;
    if (!manifest) {
      return {
        slug: agentSlug,
        binding: null,
        manifest: null,
        diagnostics: response.diagnostics,
        source: "missing",
        bridgeFetchError: response.warnings?.[0],
      };
    }
    return {
      slug: response.resolvedSlug ?? manifest.resolvedSlug ?? manifest.agentSlug ?? agentSlug,
      binding: null,
      manifest,
      diagnostics: response.diagnostics ?? manifest.diagnostics,
      source: "hosted",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      slug: agentSlug,
      binding: null,
      manifest: null,
      source: "missing",
      bridgeFetchError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Workspace policy
// ---------------------------------------------------------------------------

export interface WorkspacePolicyLoad {
  policy: KitForkPolicy | null;
  forkRegistered: boolean;
  forkId?: string;
  kitId?: string;
  workspacePath?: string;
  source: PacketSourceKind;
  policyPath?: string;
}

export function loadWorkspacePolicy(workspacePath?: string): WorkspacePolicyLoad {
  if (!workspacePath) {
    return { policy: null, forkRegistered: false, source: "missing" };
  }

  const resolved = path.resolve(workspacePath);
  const forks = listKitForkRegistrations();
  const registration = forks.find((fork) => path.resolve(fork.forkPath) === resolved) ?? null;

  if (!registration) {
    return {
      policy: null,
      forkRegistered: false,
      workspacePath: resolved,
      source: "missing",
    };
  }

  const policy = readKitForkPolicy(resolved);
  return {
    policy,
    forkRegistered: true,
    forkId: registration.forkId,
    kitId: registration.kitId,
    workspacePath: resolved,
    source: "local",
    policyPath: path.resolve(resolveInForkStateDir(resolved), "policy.json"),
  };
}

// ---------------------------------------------------------------------------
// Project memory (.growthub-fork/project.md)
// ---------------------------------------------------------------------------

export interface ProjectMdLoad {
  memory: SessionMemoryHead | null;
  source: PacketSourceKind;
}

const PROJECT_MD_BODY_EXCERPT_BYTES = 400;

export function loadProjectMdSummary(workspacePath?: string): ProjectMdLoad {
  if (!workspacePath) return { memory: null, source: "missing" };
  const memory = readSessionMemory(workspacePath);
  if (!memory) return { memory: null, source: "missing" };
  return { memory, source: "local" };
}

export { PROJECT_MD_BODY_EXCERPT_BYTES };

// ---------------------------------------------------------------------------
// Trace tail
// ---------------------------------------------------------------------------

export interface TraceTailLoad {
  /** Raw fork-trace events, time-ascending. */
  fork: Array<{ timestamp: string; type: string; summary?: string }>;
  source: PacketSourceKind;
}

export function loadTraceTail(workspacePath: string | undefined, n: number): TraceTailLoad {
  if (!workspacePath) return { fork: [], source: "missing" };
  const events = tailKitForkTrace(workspacePath, n);
  return {
    fork: events.map((event) => ({
      timestamp: event.timestamp,
      type: event.type,
      summary: event.summary,
    })),
    source: events.length > 0 ? "local" : "missing",
  };
}

// ---------------------------------------------------------------------------
// Aggregate snapshot — what compose.ts consumes
// ---------------------------------------------------------------------------

export interface PacketSourcesSnapshot {
  manifest: ManifestEnvelopeLoad;
  savedWorkflow: SavedWorkflowLoad;
  agent: AgentLoad;
  workspace: WorkspacePolicyLoad;
  projectMd: ProjectMdLoad;
  trace: TraceTailLoad;
  /** True when the caller signalled `bridge auth` is unavailable. */
  bridgeAuthUnavailable: boolean;
}

export interface LoadAllSourcesInput {
  workflowId: string;
  agentSlug?: string;
  workspacePath?: string;
  traceTailLimit?: number;
  bridgeAuthUnavailable?: boolean;
}

export async function loadAllSources(input: LoadAllSourcesInput): Promise<PacketSourcesSnapshot> {
  const traceLimit = input.traceTailLimit ?? 20;

  // Workspace and manifest are pure I/O — run synchronously up front.
  const workspace = loadWorkspacePolicy(input.workspacePath);
  const manifest = loadManifestEnvelope();
  const projectMd = loadProjectMdSummary(workspace.workspacePath ?? input.workspacePath);
  const trace = loadTraceTail(workspace.workspacePath ?? input.workspacePath, traceLimit);

  // Hosted/local fetches in parallel.
  const [savedWorkflow, agent] = await Promise.all([
    loadSavedWorkflow(input.workflowId),
    loadAgent({
      agentSlug: input.agentSlug,
      workspacePath: workspace.workspacePath ?? input.workspacePath,
    }),
  ]);

  return {
    manifest,
    savedWorkflow,
    agent,
    workspace,
    projectMd,
    trace,
    bridgeAuthUnavailable: input.bridgeAuthUnavailable ?? false,
  };
}
