/**
 * Knowledge Sync — Post-Run Capture Primitive
 *
 * Captures knowledge items at the end of every agent run and writes them
 * to the local kb_skill_docs via the server API (HTTP to local server).
 * Optionally relays to the hosted Growthub app.
 *
 * This is the "compounding intelligence" engine: each agent run can deposit
 * structured knowledge items that become available for future runs.
 *
 * Architecture note: the CLI does not import @paperclipai/db directly here.
 * It calls the local server's /api/agent/kb-skill-docs endpoint (bearer auth),
 * which is exactly how agent tools interact with knowledge in production.
 */

import type { CliAuthSession } from "../../auth/session-store.js";
import type {
  KnowledgeCaptureInput,
  KnowledgeCaptureResult,
  CaptureProposal,
} from "@paperclipai/shared/types/knowledge-sync.js";
import { tryRelayEnvelopeToHosted } from "./hosted-relay.js";
import { buildEnvelopeFromSource } from "@paperclipai/shared/kb-skill-bundle";
import type { WorkspaceKnowledgeRef } from "@paperclipai/shared/types/knowledge-sync.js";

export interface LocalServerKnowledgeClient {
  /** Base URL of the local Paperclip server, e.g. http://127.0.0.1:3100 */
  baseUrl: string;
  /** Bearer token for agent-authenticated endpoints. */
  agentToken: string;
  /** Company ID scoping the knowledge base. */
  companyId: string;
}

interface AgentKbSkillCreatePayload {
  action: "create";
  name: string;
  description: string;
  body: string;
  format?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface AgentKbSkillResponse {
  ok: boolean;
  skill?: { id: string; name: string };
}

async function createSkillViaLocalServer(
  client: LocalServerKnowledgeClient,
  payload: Omit<AgentKbSkillCreatePayload, "action">,
): Promise<string | null> {
  try {
    const res = await fetch(`${client.baseUrl}/api/agent/kb-skill-docs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${client.agentToken}`,
        "x-paperclip-company-id": client.companyId,
      },
      body: JSON.stringify({ action: "create", ...payload }),
    });

    if (!res.ok) return null;

    const data = await res.json() as AgentKbSkillResponse;
    return data?.skill?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Captures knowledge from a completed agent run and writes to the local KB.
 *
 * - proposals: CaptureProposal[] from the capture advisor (or empty)
 * - All writes go through the local server's agent-authenticated endpoint
 * - Optionally relays captured items to the hosted Growthub app
 */
export async function captureAgentRunKnowledge(
  input: KnowledgeCaptureInput,
  proposals: CaptureProposal[],
  client: LocalServerKnowledgeClient,
  opts: {
    hostedSession?: CliAuthSession;
    workspaceRef?: WorkspaceKnowledgeRef;
  } = {},
): Promise<KnowledgeCaptureResult> {
  if (proposals.length === 0) {
    return {
      runId: input.runId,
      proposalCount: 0,
      savedCount: 0,
      relayedCount: 0,
      items: [],
    };
  }

  const savedItems: Array<{ name: string; localId: string; relayed: boolean }> = [];

  for (const proposal of proposals) {
    const localId = await createSkillViaLocalServer(client, {
      name: proposal.name,
      description: proposal.description,
      body: proposal.body,
      format: proposal.format,
      source: proposal.source,
      metadata: { runId: input.runId, captureConfidence: proposal.confidence, reason: proposal.reason },
    });

    if (localId) {
      savedItems.push({ name: proposal.name, localId, relayed: false });
    }
  }

  let relayedCount = 0;

  if (input.relayToHosted && opts.hostedSession && savedItems.length > 0) {
    const docsForRelay = savedItems.map((item, i) => ({
      id: item.localId,
      name: item.name,
      description: proposals[i]?.description ?? "",
      body: proposals[i]?.body ?? "",
      format: proposals[i]?.format ?? "markdown",
      source: proposals[i]?.source ?? "agent_run",
    }));

    const sourceRef: WorkspaceKnowledgeRef = opts.workspaceRef ?? {
      kind: "instance_id",
      value: client.companyId,
    };

    try {
      const envelope = await buildEnvelopeFromSource({ ref: sourceRef, docs: docsForRelay });
      const relayResult = await tryRelayEnvelopeToHosted(envelope, opts.hostedSession);
      relayedCount = relayResult.relayed;

      if (relayResult.ok) {
        for (const item of savedItems) {
          item.relayed = true;
        }
      }
    } catch {
      // Relay failure is non-fatal; local writes are already complete
    }
  }

  return {
    runId: input.runId,
    proposalCount: proposals.length,
    savedCount: savedItems.length,
    relayedCount,
    items: savedItems,
  };
}
