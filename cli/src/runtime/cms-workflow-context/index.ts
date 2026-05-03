/**
 * CMS Workflow Context — Public emitter (v1)
 *
 * Composes a `CmsWorkflowContextPacket` for an agent operating on a CMS
 * workflow. Read-only: never mutates `.growthub-fork/` state, never writes
 * trace, never invents schema. The packet is the single canonical operating
 * frame an agent should consult before preparing an execution payload.
 *
 * Contract: docs/CMS_WORKFLOW_CONTEXT_PACKET_V1.md
 */

import path from "node:path";
import { listKitForkRegistrations } from "../../kits/fork-registry.js";
import { composePacket } from "./compose.js";
import { loadAllSources } from "./load-sources.js";
import type { CmsWorkflowContextPacket } from "./types.js";

export type {
  CmsWorkflowContextPacket,
  ExecutionAuthority,
  PacketAgent,
  PacketAgentOperation,
  PacketArtifactPolicy,
  PacketBindings,
  PacketBrandKitRef,
  PacketCapabilityRef,
  PacketKnowledgeRef,
  PacketNode,
  PacketProjectMdSummary,
  PacketSelfEval,
  PacketSourceKind,
  PacketSourceProvenance,
  PacketTraceEntry,
  PacketTriggerRef,
  PacketVariableRef,
  PacketWorkflowIdentity,
  PacketWorkspace,
  PacketWorkspacePolicy,
  StopCondition,
  StopConditionCode,
  StopConditionSeverity,
} from "./types.js";

export { CMS_WORKFLOW_CONTEXT_PACKET_VERSION } from "./types.js";

export interface ComposeCmsWorkflowContextPacketInput {
  /** Saved-workflow id (hosted workflowId or local pipelineId). */
  workflowId: string;
  /** Optional agent slug. Auto-selects when exactly one binding exists. */
  agentSlug?: string;
  /** Workspace path. Defaults to `process.cwd()`. */
  workspacePath?: string;
  /** Resolve the workspace from a registered fork id (overrides workspacePath). */
  forkId?: string;
  /** How many trace events to surface in `traceTail`. Default 20. */
  traceTailLimit?: number;
  /** Surface a `bridge-auth-unavailable` stop condition when the caller knows auth is not ready. */
  bridgeAuthUnavailable?: boolean;
  /** Override the generation timestamp. Used by tests. */
  now?: string;
}

export interface ComposeCmsWorkflowContextPacketResult {
  packet: CmsWorkflowContextPacket;
  /** Non-fatal warnings collected during composition (empty when nothing to surface). */
  warnings: string[];
}

function resolveWorkspacePath(input: ComposeCmsWorkflowContextPacketInput): string | undefined {
  if (input.forkId) {
    const forks = listKitForkRegistrations();
    const match = forks.find((fork) => fork.forkId === input.forkId);
    if (!match) {
      throw new Error(
        `Fork id '${input.forkId}' not found. Run 'growthub kit fork list' to see registered workspaces.`,
      );
    }
    return path.resolve(match.forkPath);
  }
  if (input.workspacePath) return path.resolve(input.workspacePath);
  return path.resolve(process.cwd());
}

export async function composeCmsWorkflowContextPacket(
  input: ComposeCmsWorkflowContextPacketInput,
): Promise<ComposeCmsWorkflowContextPacketResult> {
  const trimmed = input.workflowId?.trim();
  if (!trimmed) {
    throw new Error("composeCmsWorkflowContextPacket requires a non-empty workflowId.");
  }

  const workspacePath = resolveWorkspacePath(input);

  const snapshot = await loadAllSources({
    workflowId: trimmed,
    agentSlug: input.agentSlug?.trim() || undefined,
    workspacePath,
    traceTailLimit: input.traceTailLimit,
    bridgeAuthUnavailable: input.bridgeAuthUnavailable,
  });

  const packet = composePacket(snapshot, { workflowId: trimmed, now: input.now });

  const warnings: string[] = [];
  if (snapshot.agent.bridgeFetchError) {
    warnings.push(`Bridge agent fetch failed: ${snapshot.agent.bridgeFetchError}`);
  }
  if (snapshot.manifest.source === "missing") {
    warnings.push("Manifest cache missing; node schemas could not be projected.");
  }

  return { packet, warnings };
}
