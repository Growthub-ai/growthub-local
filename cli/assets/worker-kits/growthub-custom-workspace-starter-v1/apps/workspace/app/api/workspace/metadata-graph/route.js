/**
 * GET /api/workspace/metadata-graph
 *
 * Growthub Workspace Metadata Graph V1 — read-only projection.
 *
 * Combines the governed workspace config and the live source-record sidecar
 * into a typed metadata store and a node/edge graph. Consumers (the UI
 * inspector, the workspace helper agent, and external operators) use this
 * envelope to ask dependency questions without re-deriving widget/workflow
 * contracts inside every component.
 *
 * Authority invariants:
 *   - GET only. PATCH / POST / PUT / DELETE are not exposed. Writes still
 *     flow through the existing governed routes
 *     (`PATCH /api/workspace`, `POST /api/workspace/refresh-sources`,
 *     `POST /api/workspace/sandbox-run`).
 *   - growthub.config.json remains the authoritative artifact.
 *   - No secrets are returned. Field metadata derived from secret-shaped
 *     column names is marked `isSecret: true` but no value is echoed.
 *   - Failures during read fall back to an empty store with warnings —
 *     this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { buildWorkspaceMetadataStore } from "@/lib/workspace-metadata-store";
import { buildWorkspaceMetadataGraph } from "@/lib/workspace-metadata-graph";
import { selectStaleMetadataGroups } from "@/lib/workspace-metadata-selectors";

const ENVELOPE_KIND = "growthub-workspace-metadata-graph-v1";
const ENVELOPE_VERSION = 1;

async function GET() {
  const warnings = [];

  let workspaceConfig = null;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (error) {
    warnings.push(`Failed to read workspace config: ${error?.message || "unknown error"}`);
  }

  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch (error) {
    warnings.push(`Failed to read source records sidecar: ${error?.message || "unknown error"}`);
  }

  const metadataStore = buildWorkspaceMetadataStore({
    workspaceConfig: workspaceConfig || {},
    workspaceSourceRecords
  });
  warnings.push(...metadataStore.warnings);

  const graph = buildWorkspaceMetadataGraph(metadataStore);
  warnings.push(...graph.warnings);

  const staleGroups = [];
  const staleReasons = [];

  return NextResponse.json({
    kind: ENVELOPE_KIND,
    version: ENVELOPE_VERSION,
    authority: {
      config: "growthub.config.json",
      sourceRecords: "growthub.source-records.json",
      readOnlyProjection: true
    },
    metadata: {
      objects: metadataStore.objects,
      fields: metadataStore.fields,
      views: metadataStore.views,
      filters: metadataStore.filters,
      sorts: metadataStore.sorts,
      widgets: metadataStore.widgets,
      dashboards: metadataStore.dashboards,
      workflows: metadataStore.workflows,
      workflowNodes: metadataStore.workflowNodes,
      workflowActions: metadataStore.workflowActions,
      runInputs: metadataStore.runInputs,
      agentHosts: metadataStore.agentHosts,
      sandboxes: metadataStore.sandboxes,
      integrations: metadataStore.integrations,
      integrationEntities: metadataStore.integrationEntities,
      sourceRecords: metadataStore.sourceRecords,
      runs: metadataStore.runs,
      outputArtifacts: metadataStore.outputArtifacts,
      workerKits: metadataStore.workerKits,
      pipelineHealth: metadataStore.pipelineHealth
    },
    graph: {
      nodes: graph.nodes,
      edges: graph.edges
    },
    stale: {
      groups: staleGroups,
      reasons: staleReasons
    },
    warnings,
    selectors: {
      // Surface a tiny self-describing manifest so agent harnesses can
      // discover which selectors the route honours without grepping the
      // source. The selectors themselves run server-side via the helpers.
      available: [
        "selectStaleMetadataGroups",
        "selectWidgetRequiredFields",
        "selectWorkflowNodeInputSchema",
        "selectRunLineage"
      ]
    }
  });
}

export { GET };
// Selector helper re-exported for any server-side consumer that imports
// from this module — keeps the route the single import surface for the
// metadata graph projection. Untouched by HTTP.
export { selectStaleMetadataGroups };
