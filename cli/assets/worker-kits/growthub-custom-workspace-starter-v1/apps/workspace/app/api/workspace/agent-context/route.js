/**
 * GET /api/workspace/agent-context
 *
 * Growthub Workspace Health & Agent Context V1 — agent context packet.
 *
 * Returns a compact, structured payload an agent can read in one shot to
 * "understand" the workspace: summary counters, derived capabilities, the
 * health critical-state slice, and entrypoints into the real surfaces. This
 * is the "semantic compression" that lets an agent avoid inferring workspace
 * state from raw files.
 *
 * Response envelope (contract: growthub-workspace-agent-context-v1):
 *   {
 *     kind, version,
 *     summary:       { name, objects, widgets, workflows, dashboards, ... },
 *     capabilities:  string[],
 *     health:        { status, issueCount, metrics },
 *     criticalState: { staleWidgets[], missingSources[], danglingEdges[], unhealthyPipelines[] },
 *     entrypoints:   { dashboards[], workflows[], dataModel, api, health },
 *     warnings:      string[]
 *   }
 *
 * Authority invariants (identical to /api/workspace/metadata-graph):
 *   - GET only. Writes flow through the existing governed routes.
 *   - growthub.config.json remains the authoritative artifact; this is a
 *     derived read model.
 *   - No secrets are returned — only already-redacted metadata items.
 *   - Failures during read OR derivation fall back to an empty-baseline
 *     packet with warnings — this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { buildWorkspaceMetadataStore } from "@/lib/workspace-metadata-store";
import { buildWorkspaceMetadataGraph } from "@/lib/workspace-metadata-graph";
import {
  deriveWorkspaceHealth,
  deriveAgentContextPacket,
  AGENT_CONTEXT_KIND,
  AGENT_CONTEXT_VERSION
} from "@/lib/workspace-health";

async function GET() {
  const warnings = [];

  let workspaceConfig = {};
  try {
    workspaceConfig = (await readWorkspaceConfig()) || {};
  } catch (error) {
    warnings.push(`Failed to read workspace config: ${error?.message || "unknown error"}`);
  }

  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch (error) {
    warnings.push(`Failed to read source records sidecar: ${error?.message || "unknown error"}`);
  }

  let metadataStore = null;
  try {
    metadataStore = buildWorkspaceMetadataStore({ workspaceConfig, workspaceSourceRecords });
    warnings.push(...(metadataStore.warnings || []));
  } catch (error) {
    warnings.push(`Failed to build metadata store: ${error?.message || "unknown error"}`);
  }

  let graph = null;
  try {
    graph = buildWorkspaceMetadataGraph(metadataStore);
    warnings.push(...(graph.warnings || []));
  } catch (error) {
    warnings.push(`Failed to build metadata graph: ${error?.message || "unknown error"}`);
  }

  let packet;
  try {
    const health = deriveWorkspaceHealth(metadataStore, graph);
    packet = deriveAgentContextPacket(metadataStore, graph, health, workspaceConfig);
  } catch (error) {
    warnings.push(`Failed to derive agent context packet: ${error?.message || "unknown error"}`);
    packet = {
      kind: AGENT_CONTEXT_KIND,
      version: AGENT_CONTEXT_VERSION,
      summary: { name: "workspace", objects: 0, widgets: 0, workflows: 0, dashboards: 0, sandboxes: 0, sourceRecords: 0 },
      capabilities: [],
      health: { status: "healthy", issueCount: 0, metrics: {} },
      criticalState: { staleWidgets: [], missingSources: [], danglingEdges: [], unhealthyPipelines: [] },
      entrypoints: { dashboards: [], workflows: [], dataModel: "/data-model", api: "/api/workspace", health: "/api/workspace/health" }
    };
  }

  return NextResponse.json({
    ...packet,
    authority: {
      config: "growthub.config.json",
      sourceRecords: "growthub.source-records.json",
      readOnlyProjection: true
    },
    warnings
  });
}

export { GET };
