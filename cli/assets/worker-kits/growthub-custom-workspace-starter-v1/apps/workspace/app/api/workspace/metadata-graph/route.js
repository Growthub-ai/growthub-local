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
 * Optional query parameters:
 *   - staleKind: "object" | "field" | "sourceRecord" | "workflow" | "agentHost" | "widget"
 *   - staleId:   the corresponding metadata id (for `field`, use
 *                "<objectId>::<fieldId>")
 *
 *   When both are provided the response `stale.groups` and `stale.reasons`
 *   reflect `selectStaleMetadataGroups({ kind, id })`. When omitted the
 *   stale section returns the empty baseline.
 *
 * Authority invariants:
 *   - GET only. PATCH / POST / PUT / DELETE are not exposed. Writes still
 *     flow through the existing governed routes
 *     (`PATCH /api/workspace`, `POST /api/workspace/refresh-sources`,
 *     `POST /api/workspace/sandbox-run`).
 *   - growthub.config.json remains the authoritative artifact.
 *   - No secrets are returned. Field metadata derived from secret-shaped
 *     column names is marked `isSecret: true` but no value is echoed.
 *   - Failures during read OR projection fall back to an empty store with
 *     warnings — this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { buildWorkspaceMetadataStore } from "@/lib/workspace-metadata-store";
import { buildWorkspaceMetadataGraph } from "@/lib/workspace-metadata-graph";
import { selectStaleMetadataGroups } from "@/lib/workspace-metadata-selectors";
import { deriveBlastRadius } from "@/lib/workspace-metadata-impact";
import { deriveStaleSurfaces } from "@/lib/workspace-stale-surfaces";
import { deriveWorkflowImpact } from "@/lib/workspace-workflow-impact";
import { deriveProvenanceLineage } from "@/lib/workspace-provenance-lineage";
import { deriveAppReadiness } from "@/lib/workspace-app-readiness";

const ENVELOPE_KIND = "growthub-workspace-metadata-graph-v1";
const ENVELOPE_VERSION = 1;

function emptyMetadataStore() {
  return {
    kind: "growthub-workspace-metadata-store-v1",
    version: 1,
    objects: [],
    fields: [],
    views: [],
    filters: [],
    sorts: [],
    widgets: [],
    dashboards: [],
    workflows: [],
    workflowNodes: [],
    workflowActions: [],
    runInputs: [],
    agentHosts: [],
    sandboxes: [],
    integrations: [],
    integrationEntities: [],
    sourceRecords: [],
    runs: [],
    outputArtifacts: [],
    workerKits: [],
    pipelineHealth: [],
    warnings: []
  };
}

async function GET(request) {
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

  // Defensive: helpers are designed to never throw on partial/unknown input,
  // but the route must remain HTTP-200 even if an unexpected exception bubbles
  // up (so the UI inspector and agents always get a typed envelope).
  let metadataStore;
  try {
    metadataStore = buildWorkspaceMetadataStore({
      workspaceConfig: workspaceConfig || {},
      workspaceSourceRecords
    });
    warnings.push(...metadataStore.warnings);
  } catch (error) {
    warnings.push(`Failed to build metadata store: ${error?.message || "unknown error"}`);
    metadataStore = emptyMetadataStore();
  }

  let graph;
  try {
    graph = buildWorkspaceMetadataGraph(metadataStore);
    warnings.push(...graph.warnings);
  } catch (error) {
    warnings.push(`Failed to build metadata graph: ${error?.message || "unknown error"}`);
    graph = { kind: "growthub-workspace-metadata-graph-v1", version: 1, nodes: [], edges: [], warnings: [] };
  }

  // Optional stale-group selector via query params.
  let staleGroups = [];
  let staleReasons = [];
  // Parse all causal query params from one URL read.
  let impactId = "";
  let lineageId = "";
  let lineageDirection = "both";
  try {
    const url = request && request.url ? new URL(request.url) : null;
    const staleKind = url ? (url.searchParams.get("staleKind") || "").trim() : "";
    const staleId = url ? (url.searchParams.get("staleId") || "").trim() : "";
    impactId = url ? (url.searchParams.get("impactId") || "").trim() : "";
    lineageId = url ? (url.searchParams.get("lineageId") || "").trim() : "";
    lineageDirection = url ? (url.searchParams.get("lineageDirection") || "both").trim() : "both";
    if (staleKind && staleId) {
      const result = selectStaleMetadataGroups(metadataStore, { kind: staleKind, id: staleId });
      staleGroups = Array.isArray(result?.groups) ? result.groups : [];
      staleReasons = Array.isArray(result?.reasons) ? result.reasons : [];
    }
  } catch (error) {
    warnings.push(`Failed to compute stale groups: ${error?.message || "unknown error"}`);
  }

  // Causal derivations over the same read-only graph (Mutation → Law →
  // Intelligence). All pure, all bounded, all secret-free. `staleSurfaces` is
  // the unconditional freshness baseline (timestamps already in the graph);
  // `impact` and `lineage` are computed on demand for one node.
  let staleSurfaces = null;
  let readiness = null;
  let impact = null;
  let lineage = null;
  try {
    staleSurfaces = deriveStaleSurfaces(graph);
    readiness = deriveAppReadiness(graph);
    if (impactId) {
      impact = {
        blastRadius: deriveBlastRadius(graph, impactId),
        workflowImpact: deriveWorkflowImpact(graph, impactId)
      };
    }
    if (lineageId) {
      lineage = deriveProvenanceLineage(graph, lineageId, { direction: lineageDirection });
    }
  } catch (error) {
    warnings.push(`Failed to compute causal derivations: ${error?.message || "unknown error"}`);
  }

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
      provenance: metadataStore.provenance,
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
    // Causal intelligence layer — read-only derivations over `graph` above.
    staleSurfaces,
    readiness,
    ...(impact ? { impact } : {}),
    ...(lineage ? { lineage } : {}),
    warnings,
    selectors: {
      // Manifest of selectors the route honours. Only `selectStaleMetadataGroups`
      // is wired through HTTP (via `?staleKind=&staleId=`). The remaining
      // selectors are exposed as importable helpers for server-side consumers
      // and the read-only inspector; they are NOT toggled through query
      // params in V1.
      httpEnabled: [
        "selectStaleMetadataGroups",
        "deriveStaleSurfaces",
        "deriveBlastRadius",
        "deriveWorkflowImpact",
        "deriveProvenanceLineage",
        "deriveAppReadiness"
      ],
      helperOnly: [
        "selectWidgetRequiredFields",
        "selectWorkflowNodeInputSchema",
        "selectObjectFilterableFields",
        "selectObjectSortableFields",
        "selectRunLineage"
      ]
    }
  });
}

export { GET };
