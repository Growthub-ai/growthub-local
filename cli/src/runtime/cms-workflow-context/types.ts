/**
 * CMS Workflow Context Packet — Type Definitions (v1)
 *
 * Internal type surface for the generated operating contract that the CLI
 * emits via `growthub workflow context <workflowId>`. The packet narrows a
 * CMS workflow into a closed agent operating frame composed entirely from
 * existing primitives (capability manifest, agent binding, saved workflow,
 * workspace policy, fork session memory, fork trace).
 *
 * v1 lives here, NOT in `@growthub/api-contract`. Promotion to the public
 * SDK is gated on two real consumers and a stability period — see
 * `docs/CMS_WORKFLOW_CONTEXT_PACKET_V1.md` § "Promotion criteria".
 *
 * Versioning rules:
 *   - v1.x: additive fields, additional stop-condition codes, additional
 *           runtime assumptions. Never breaking.
 *   - v2:   breaking changes to `kind`, the field set, or the meaning of
 *           any existing field. Bumps `version` to 2.
 */

import type {
  BridgeHostedAgentDiagnostics,
  BridgeHostedAgentManifest,
} from "@growthub/api-contract/bridge";
import type { CapabilityManifest } from "@growthub/api-contract/manifests";

export const CMS_WORKFLOW_CONTEXT_PACKET_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type ExecutionAuthority = "gh-app" | "local" | "unknown";

export interface PacketWorkflowIdentity {
  /** Canonical workflow id (hosted) or pipeline id (local). */
  id: string;
  /** Human-readable workflow name from saved-workflow metadata. */
  name: string;
  /**
   * Where the workflow runs. Hosted workflows always pin to "gh-app".
   * Local-only pipelines surface "local". "unknown" is used when the
   * saved workflow predates execution-authority annotation.
   */
  executionAuthority: ExecutionAuthority;
  /** Pipeline-builder execution mode: "hosted" | "local" | "hybrid". */
  executionMode: string;
  /** ISO timestamp the saved workflow was last persisted. */
  updatedAt?: string;
  /** Source of the saved workflow data. */
  source: "hosted" | "local";
}

export interface PacketAgent {
  /** Slug used to look the agent up. */
  slug: string;
  /** Resolved slug from the bridge (may differ when aliasing is in play). */
  resolvedSlug?: string;
  /** Display name for human-facing surfaces. */
  name?: string;
  /** Operator role: how the agent should behave on this workflow. */
  role: "orchestrator" | "operator" | "advisor";
  /** Operations the agent is authorised to take with this packet. */
  operations: PacketAgentOperation[];
  /** Whether the binding is materialised under .growthub-fork/agents/. */
  bound: boolean;
  /** Bridge-side diagnostics, when available. */
  diagnostics?: BridgeHostedAgentDiagnostics;
  /** Raw bridge manifest, when available. */
  manifest?: BridgeHostedAgentManifest;
}

export type PacketAgentOperation =
  | "inspect"
  | "bind-workspace"
  | "configure"
  | "execute"
  | "review";

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface PacketNode {
  /** Pipeline-instance node id. */
  nodeId: string;
  /** CMS capability slug. */
  slug: string;
  /** Capability family (video / image / slides / text / data / ops / …). */
  family: string;
  /** Execution kind from the manifest (hosted-execute / provider-assembly / local-only). */
  executionKind: string;
  /** Execution strategy (direct / sequential-with-persistence / async_operation). */
  executionStrategy: string;
  /** Bindings present on the saved-workflow node instance. */
  declaredBindings: Record<string, unknown>;
  /** Required binding keys declared by the manifest. */
  requiredBindings: string[];
  /** Output media types the node can produce. */
  outputTypes: string[];
  /** Allowed input keys per the manifest's input template. */
  allowedInputs: string[];
  /** Provider hints, when the manifest carries them. */
  providerHints?: Record<string, unknown>;
  /** True when the saved-workflow node references a slug not in the manifest. */
  unknownSlug: boolean;
  /** Upstream nodes whose outputs feed this node. */
  upstreamNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface PacketWorkspace {
  /** Absolute path the packet was composed against. */
  path?: string;
  /** True when the path is registered as a kit fork. */
  forkRegistered: boolean;
  /** Fork id when registered. */
  forkId?: string;
  /** Kit id when the workspace is bound to a kit. */
  kitId?: string;
  /** Snapshot of the fork policy (or `null` for unbound workspaces). */
  policy: PacketWorkspacePolicy | null;
}

export interface PacketWorkspacePolicy {
  autoApprove: "none" | "additive" | "all";
  autoApproveDepUpdates: "none" | "additive" | "all";
  remoteSyncMode: "off" | "branch" | "pr";
  interactiveConflicts: boolean;
  untouchablePaths: string[];
  confirmBeforeChange: string[];
  allowedScripts: string[];
}

// ---------------------------------------------------------------------------
// Bindings (workflow-level surfaces, mirrored from the bridge primitives)
// ---------------------------------------------------------------------------

export interface PacketBindings {
  knowledge: PacketKnowledgeRef[];
  brandKits: PacketBrandKitRef[];
  variables: PacketVariableRef[];
  triggers: PacketTriggerRef[];
}

export interface PacketKnowledgeRef {
  id: string;
  /** Slug that the knowledge is scoped to, if any. */
  agentSlug?: string;
  fileName?: string;
  source?: string;
}

export interface PacketBrandKitRef {
  id: string;
  brandName: string;
  /** Asset count attached to the brand kit. */
  assetCount: number;
}

export interface PacketVariableRef {
  /** Variable key. */
  key: string;
  /** Concrete value or sentinel describing the resolution boundary. */
  value: unknown;
  /** Where the variable was sourced from (workspace / workflow / agent). */
  scope: "workspace" | "workflow" | "agent" | "node";
}

export interface PacketTriggerRef {
  id: string;
  type: string;
  /** Free-form descriptor for human-readable rendering. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Artifact policy + self-eval + stop conditions
// ---------------------------------------------------------------------------

export interface PacketArtifactPolicy {
  captureOutputs: boolean;
  allowedArtifactKinds: string[];
  viewerWidget: string;
}

export interface PacketSelfEval {
  criteria: string[];
  maxRetries: number;
}

export type StopConditionCode =
  | "workflow-not-found"
  | "manifest-cache-missing"
  | "manifest-cache-stale"
  | "bridge-auth-unavailable"
  | "agent-not-bound"
  | "unknown-node-slug"
  | "missing-binding"
  | "schema-mismatch"
  | "execution-authority-mismatch"
  | "workspace-not-governed";

export type StopConditionSeverity = "error" | "warn" | "info";

export interface StopCondition {
  code: StopConditionCode;
  severity: StopConditionSeverity;
  detail: string;
  /** Optional remediation hint (single sentence, imperative). */
  hint?: string;
  /** Optional bound to a node id when the issue is per-node. */
  nodeId?: string;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

export interface PacketTraceEntry {
  /** Stream the entry came from. */
  stream: "fork" | "pipeline";
  timestamp: string;
  type: string;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Provenance — which sources contributed to the packet
// ---------------------------------------------------------------------------

export type PacketSourceKind = "hosted" | "local" | "cache" | "missing";

export interface PacketSourceProvenance {
  manifestEnvelope: { kind: PacketSourceKind; fetchedAt?: string; capabilityCount?: number };
  agent: { kind: PacketSourceKind; fetchedAt?: string; bindingPath?: string };
  savedWorkflow: { kind: PacketSourceKind; fetchedAt?: string };
  workspacePolicy: { kind: PacketSourceKind; path?: string };
  projectMd: { kind: PacketSourceKind; path?: string; sizeBytes?: number };
  trace: { kind: PacketSourceKind; entryCount: number };
}

// ---------------------------------------------------------------------------
// Packet (v1)
// ---------------------------------------------------------------------------

export interface CmsWorkflowContextPacket {
  version: typeof CMS_WORKFLOW_CONTEXT_PACKET_VERSION;
  kind: "cms-workflow-context-packet";
  /** Manifest used to project capability schemas. ISO timestamp. */
  generatedAt: string;
  workflow: PacketWorkflowIdentity;
  agent: PacketAgent | null;
  workspace: PacketWorkspace;
  startupSequence: string[];
  runtimeAssumptions: string[];
  nodes: PacketNode[];
  bindings: PacketBindings;
  /** Manifest-level capability metadata referenced by the workflow's nodes. */
  capabilityRefs: PacketCapabilityRef[];
  artifactPolicy: PacketArtifactPolicy;
  selfEval: PacketSelfEval;
  stopConditions: StopCondition[];
  /** Recent trace entries (fork + pipeline streams, merged and time-ordered). */
  traceTail: PacketTraceEntry[];
  /** Project memory summary, when present. */
  projectMd: PacketProjectMdSummary | null;
  sources: PacketSourceProvenance;
}

export interface PacketCapabilityRef {
  slug: string;
  displayName: string;
  family: string;
  executionKind: string;
  requiredBindings: string[];
  outputTypes: string[];
  /**
   * The slice of the capability manifest needed to operate the node — the
   * full record is intentionally not embedded to keep packets small.
   */
  manifestExcerpt: Pick<
    CapabilityManifest,
    "slug" | "displayName" | "family" | "executionKind"
  >;
}

export interface PacketProjectMdSummary {
  path: string;
  sizeBytes: number;
  /** Frontmatter as parsed; null if none or malformed. */
  frontmatter: Record<string, unknown> | null;
  /** First ~400 chars of body content for quick agent context. */
  bodyExcerpt: string;
}
