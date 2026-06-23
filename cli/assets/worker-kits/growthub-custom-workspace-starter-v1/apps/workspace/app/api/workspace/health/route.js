/**
 * GET /api/workspace/health
 *
 * Growthub Workspace Health & Agent Context V1 — read-only health summary.
 *
 * Aggregates the intelligence the metadata layer already proves into a single
 * actionable snapshot: stale widgets, missing/empty live sources, references
 * that fail to resolve (dangling edges), and pipeline run health. Operators
 * and agents read this before taking action — a zero-cost health check.
 *
 * Response envelope (contract: growthub-workspace-health-v1):
 *   {
 *     kind, version,
 *     status:  "healthy" | "degraded" | "unhealthy",
 *     issues:  [{ type, severity, reason, ...refs }],
 *     metrics: { totalWidgets, staleWidgets, danglingEdges, ... },
 *     warnings: string[]
 *   }
 *
 * Authority invariants (identical to /api/workspace/metadata-graph):
 *   - GET only. PATCH / POST / PUT / DELETE are not exposed. Writes still flow
 *     through the existing governed routes (PATCH /api/workspace,
 *     POST /api/workspace/refresh-sources, POST /api/workspace/sandbox-run).
 *   - growthub.config.json remains the authoritative artifact; this is a
 *     derived read model.
 *   - No secrets are returned. The rollup only reads already-redacted metadata
 *     items — no source rows, tokens, or auth material.
 *   - Failures during read OR derivation fall back to an empty-baseline
 *     summary with warnings — this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { buildWorkspaceMetadataStore } from "@/lib/workspace-metadata-store";
import { buildWorkspaceMetadataGraph } from "@/lib/workspace-metadata-graph";
import { deriveWorkspaceHealth, HEALTH_KIND, HEALTH_VERSION } from "@/lib/workspace-health";

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

  let health;
  try {
    health = deriveWorkspaceHealth(metadataStore, graph);
  } catch (error) {
    warnings.push(`Failed to derive workspace health: ${error?.message || "unknown error"}`);
    health = {
      kind: HEALTH_KIND,
      version: HEALTH_VERSION,
      status: "healthy",
      issues: [],
      metrics: {}
    };
  }

  return NextResponse.json({
    ...health,
    authority: {
      config: "growthub.config.json",
      sourceRecords: "growthub.source-records.json",
      readOnlyProjection: true
    },
    warnings
  });
}

export { GET };
