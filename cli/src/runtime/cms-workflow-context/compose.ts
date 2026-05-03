/**
 * CMS Workflow Context — Pure composer
 *
 * Given a `PacketSourcesSnapshot` and a small options bag, produce a
 * `CmsWorkflowContextPacket` with no I/O. Side-effect-free so unit tests
 * can drive it from fixtures and mock clocks.
 */

import type {
  BridgeHostedAgentManifest,
  BridgeHostedAgentWorkspaceBinding,
} from "@growthub/api-contract/bridge";
import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract/manifests";
import type { PacketSourcesSnapshot } from "./load-sources.js";
import { detectStopConditions } from "./stop-conditions.js";

const PROJECT_MD_BODY_EXCERPT_BYTES = 400;
import {
  CMS_WORKFLOW_CONTEXT_PACKET_VERSION,
  type CmsWorkflowContextPacket,
  type ExecutionAuthority,
  type PacketAgent,
  type PacketAgentOperation,
  type PacketArtifactPolicy,
  type PacketBindings,
  type PacketCapabilityRef,
  type PacketNode,
  type PacketProjectMdSummary,
  type PacketSelfEval,
  type PacketSourceProvenance,
  type PacketTraceEntry,
  type PacketWorkflowIdentity,
  type PacketWorkspace,
  type PacketWorkspacePolicy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Fixed strings — the canonical operating frame
// ---------------------------------------------------------------------------

const STARTUP_SEQUENCE: readonly string[] = [
  "Read .growthub-fork/project.md (workspace memory)",
  "Read bound agent manifest under .growthub-fork/agents/",
  "Read saved workflow nodes and edges",
  "Read capability manifest cache for each node slug's input/output schema",
  "Read .growthub-fork/policy.json (workspace policy)",
  "Inspect bridge diagnostics on the bound agent",
  "Only then prepare an execution payload",
];

const RUNTIME_ASSUMPTIONS: readonly string[] = [
  "Hosted workflows execute under execution authority 'gh-app'",
  "Bridge bearer tokens are never exposed to browser or client surfaces",
  "Node inputs not declared in the manifest input schema must not be invented",
  "The workflow graph must not be mutated unless the operator was explicitly asked",
  "All material changes are appended to .growthub-fork/project.md and trace.jsonl",
];

const SELF_EVAL_CRITERIA: readonly string[] = [
  "All node inputs match the declared input schema",
  "Required bindings are present on every node",
  "Outputs are captured as artifacts under the workspace artifact root",
  "A trace entry is appended after every material change",
  "Stop conditions reported by the packet have been resolved or acknowledged",
];

const DEFAULT_ARTIFACT_POLICY: PacketArtifactPolicy = {
  captureOutputs: true,
  allowedArtifactKinds: ["image", "video", "pdf", "json", "text", "audio"],
  viewerWidget: "artifact-viewer",
};

const DEFAULT_SELF_EVAL: PacketSelfEval = {
  criteria: [...SELF_EVAL_CRITERIA],
  maxRetries: 3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveExecutionAuthority(snapshot: PacketSourcesSnapshot): ExecutionAuthority {
  const entry = snapshot.savedWorkflow.result?.entry;
  if (!entry) return "unknown";
  if (entry.source === "hosted") return "gh-app";
  if (entry.executionMode === "hosted") return "gh-app";
  if (entry.executionMode === "local") return "local";
  return "unknown";
}

function buildCapabilityRefs(
  envelope: CapabilityManifestEnvelope | null,
  usedSlugs: Set<string>,
): { refs: PacketCapabilityRef[]; bySlug: Map<string, CapabilityManifest> } {
  const bySlug = new Map<string, CapabilityManifest>();
  if (!envelope) return { refs: [], bySlug };
  for (const cap of envelope.capabilities) bySlug.set(cap.slug, cap);

  const refs: PacketCapabilityRef[] = [];
  for (const slug of usedSlugs) {
    const cap = bySlug.get(slug);
    if (!cap) continue;
    refs.push({
      slug: cap.slug,
      displayName: cap.displayName,
      family: typeof cap.family === "string" ? cap.family : String(cap.family),
      executionKind: cap.executionKind,
      requiredBindings: cap.requiredBindings ?? [],
      outputTypes: cap.outputTypes ?? [],
      manifestExcerpt: {
        slug: cap.slug,
        displayName: cap.displayName,
        family: cap.family,
        executionKind: cap.executionKind,
      },
    });
  }
  return { refs, bySlug };
}

function buildNodes(
  snapshot: PacketSourcesSnapshot,
  bySlug: Map<string, CapabilityManifest>,
): PacketNode[] {
  const find = snapshot.savedWorkflow.result;
  if (!find) return [];

  return find.pipeline.nodes.map((node) => {
    const cap = bySlug.get(node.slug);
    const allowedInputs = cap?.inputSchema?.fields.map((field) => field.key) ?? [];

    return {
      nodeId: node.id,
      slug: node.slug,
      family: typeof cap?.family === "string" ? cap.family : (cap?.family ? String(cap.family) : "ops"),
      executionKind: cap?.executionKind ?? "hosted-execute",
      executionStrategy:
        cap?.node?.executionBinding?.strategy ?? "direct",
      declaredBindings: node.bindings,
      requiredBindings: cap?.requiredBindings ?? [],
      outputTypes: cap?.outputTypes ?? [],
      allowedInputs,
      providerHints: cap?.providerHints as Record<string, unknown> | undefined,
      unknownSlug: !cap,
      upstreamNodeIds: node.upstreamNodeIds,
    };
  });
}

function buildAgent(snapshot: PacketSourcesSnapshot): PacketAgent | null {
  const a = snapshot.agent;
  const slug = a.slug ?? a.binding?.agentSlug ?? a.manifest?.agentSlug ?? a.manifest?.slug;
  if (!slug) return null;

  const operations: PacketAgentOperation[] = ["inspect", "configure"];
  if (a.binding) operations.push("bind-workspace", "execute");
  else if (a.manifest) operations.push("review");

  const manifest: BridgeHostedAgentManifest | undefined =
    a.manifest ?? (a.binding?.manifest as BridgeHostedAgentManifest | undefined);
  const binding: BridgeHostedAgentWorkspaceBinding | null = a.binding;

  return {
    slug,
    resolvedSlug: a.binding?.resolvedSlug ?? manifest?.resolvedSlug,
    name: manifest?.name ?? manifest?.agentName ?? manifest?.title ?? binding?.agentName,
    role: "orchestrator",
    operations,
    bound: Boolean(binding),
    diagnostics: a.diagnostics,
    manifest,
  };
}

function buildWorkspace(snapshot: PacketSourcesSnapshot): PacketWorkspace {
  const w = snapshot.workspace;
  let policy: PacketWorkspacePolicy | null = null;
  if (w.policy) {
    policy = {
      autoApprove: w.policy.autoApprove,
      autoApproveDepUpdates: w.policy.autoApproveDepUpdates,
      remoteSyncMode: w.policy.remoteSyncMode,
      interactiveConflicts: w.policy.interactiveConflicts,
      untouchablePaths: w.policy.untouchablePaths,
      confirmBeforeChange: w.policy.confirmBeforeChange,
      allowedScripts: w.policy.allowedScripts,
    };
  }
  return {
    path: w.workspacePath,
    forkRegistered: w.forkRegistered,
    forkId: w.forkId,
    kitId: w.kitId,
    policy,
  };
}

function buildWorkflowIdentity(snapshot: PacketSourcesSnapshot, fallbackId: string): PacketWorkflowIdentity {
  const find = snapshot.savedWorkflow.result;
  if (!find) {
    return {
      id: fallbackId,
      name: fallbackId,
      executionAuthority: "unknown",
      executionMode: "hosted",
      source: "hosted",
    };
  }
  return {
    id: find.entry.workflowId,
    name: find.entry.name,
    executionAuthority: deriveExecutionAuthority(snapshot),
    executionMode: find.entry.executionMode,
    updatedAt: find.entry.updatedAt,
    source: find.entry.source,
  };
}

function buildBindings(snapshot: PacketSourcesSnapshot): PacketBindings {
  const find = snapshot.savedWorkflow.result;
  const variables = [];
  if (find) {
    for (const node of find.pipeline.nodes) {
      for (const [key, value] of Object.entries(node.bindings)) {
        variables.push({ key: `${node.slug}.${key}`, value, scope: "node" as const });
      }
    }
  }
  return {
    knowledge: [],
    brandKits: [],
    variables,
    triggers: [],
  };
}

function buildProjectMd(snapshot: PacketSourcesSnapshot): PacketProjectMdSummary | null {
  const memory = snapshot.projectMd.memory;
  if (!memory) return null;
  return {
    path: memory.path,
    sizeBytes: memory.sizeBytes,
    frontmatter: memory.frontmatter,
    bodyExcerpt: memory.body.slice(0, PROJECT_MD_BODY_EXCERPT_BYTES),
  };
}

function buildTraceTail(snapshot: PacketSourcesSnapshot): PacketTraceEntry[] {
  return snapshot.trace.fork.map((event) => ({
    stream: "fork" as const,
    timestamp: event.timestamp,
    type: event.type,
    summary: event.summary,
  }));
}

function buildSources(snapshot: PacketSourcesSnapshot): PacketSourceProvenance {
  const m = snapshot.manifest;
  const a = snapshot.agent;
  const w = snapshot.savedWorkflow;
  const ws = snapshot.workspace;
  const pmd = snapshot.projectMd.memory;

  return {
    manifestEnvelope: {
      kind: m.source,
      fetchedAt: m.fetchedAt,
      capabilityCount: m.envelope?.capabilities.length,
    },
    agent: {
      kind: a.source,
      fetchedAt: a.fetchedAt,
      bindingPath: a.bindingPath,
    },
    savedWorkflow: {
      kind: w.source,
      fetchedAt: w.fetchedAt,
    },
    workspacePolicy: {
      kind: ws.source,
      path: ws.policyPath,
    },
    projectMd: {
      kind: snapshot.projectMd.source,
      path: pmd?.path,
      sizeBytes: pmd?.sizeBytes,
    },
    trace: {
      kind: snapshot.trace.source,
      entryCount: snapshot.trace.fork.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Public composer
// ---------------------------------------------------------------------------

export interface ComposePacketOptions {
  workflowId: string;
  /** Override the generation timestamp — used by tests to make snapshots deterministic. */
  now?: string;
}

export function composePacket(
  snapshot: PacketSourcesSnapshot,
  options: ComposePacketOptions,
): CmsWorkflowContextPacket {
  const usedSlugs = new Set<string>();
  if (snapshot.savedWorkflow.result) {
    for (const node of snapshot.savedWorkflow.result.pipeline.nodes) usedSlugs.add(node.slug);
  }

  const { refs, bySlug } = buildCapabilityRefs(snapshot.manifest.envelope, usedSlugs);
  const nodes = buildNodes(snapshot, bySlug);
  const stopConditions = detectStopConditions(snapshot);

  return {
    version: CMS_WORKFLOW_CONTEXT_PACKET_VERSION,
    kind: "cms-workflow-context-packet",
    generatedAt: options.now ?? new Date().toISOString(),
    workflow: buildWorkflowIdentity(snapshot, options.workflowId),
    agent: buildAgent(snapshot),
    workspace: buildWorkspace(snapshot),
    startupSequence: [...STARTUP_SEQUENCE],
    runtimeAssumptions: [...RUNTIME_ASSUMPTIONS],
    nodes,
    bindings: buildBindings(snapshot),
    capabilityRefs: refs,
    artifactPolicy: { ...DEFAULT_ARTIFACT_POLICY, allowedArtifactKinds: [...DEFAULT_ARTIFACT_POLICY.allowedArtifactKinds] },
    selfEval: { ...DEFAULT_SELF_EVAL, criteria: [...DEFAULT_SELF_EVAL.criteria] },
    stopConditions,
    traceTail: buildTraceTail(snapshot),
    projectMd: buildProjectMd(snapshot),
    sources: buildSources(snapshot),
  };
}
