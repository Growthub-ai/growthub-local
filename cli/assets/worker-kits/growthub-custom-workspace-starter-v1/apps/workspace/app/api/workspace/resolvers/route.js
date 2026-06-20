/**
 * GET /api/workspace/resolvers
 *
 * Lists resolver files present in lib/adapters/integrations/resolvers/ and
 * returns provider-agnostic metadata for each registered resolver.
 * Used by the generic resolver management panel and ResolverControlPanel in the
 * widget inspector. No provider names appear in the response shape.
 *
 * CMS SDK v1.5.1 — additionally returns `registry`: the Unified API Resolver
 * Registry index that correlates every governed `api-registry` record to its
 * resolver (provenance, file, registered/tested state, response shape, score,
 * next action, governed endpoint). The legacy fields are preserved verbatim.
 * When the runtime is writable, the externalized index + endpoint manifest
 * artifacts are written through so agents can read one file out of band.
 *
 * Response:
 *   {
 *     files:         string[],
 *     registeredIds: string[],
 *     resolvers: {
 *       integrationId:   string,
 *       entityTypes:     string[],
 *       hasListEntities: boolean,
 *       configSchema:    SchemaField[] | null
 *     }[],
 *     canUpload: boolean,
 *     registry:  ResolverRegistryIndex   // @growthub/api-contract/resolver-registry
 *   }
 */

import { NextResponse } from "next/server";
import { loadAllResolvers, listResolverFiles } from "@/lib/adapters/integrations/resolver-loader";
import { describeRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";
import { describePersistenceMode, readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { computeConfiguredEnvRefs } from "@/lib/env-status";
import { deriveResolverRegistry } from "@/lib/unified-resolver-registry";
import { readResolverFileMeta, persistResolverRegistryArtifacts } from "@/lib/server-resolver-registry";

async function GET() {
  await loadAllResolvers();
  const files = await listResolverFiles();
  const resolvers = describeRegisteredResolvers();
  const persistence = describePersistenceMode();
  const registeredIds = resolvers.map((r) => r.integrationId);

  // Unified registry derivation — correlate every governed record to its
  // resolver. All IO happens here; the deriver stays pure.
  let registry = null;
  try {
    const [workspaceConfig, sourceRecords, fileMeta] = await Promise.all([
      readWorkspaceConfig().catch(() => ({})),
      readWorkspaceSourceRecords().then((r) => r || {}).catch(() => ({})),
      readResolverFileMeta().catch(() => ({})),
    ]);
    let configuredEnvRefs = [];
    try {
      configuredEnvRefs = computeConfiguredEnvRefs(workspaceConfig) || [];
    } catch {
      configuredEnvRefs = [];
    }
    registry = deriveResolverRegistry({
      workspaceConfig,
      files,
      registeredIds,
      fileMeta,
      sourceRecords,
      runtime: { configuredEnvRefs },
    });
    // Write-through the externalized artifacts when writable (best-effort).
    if (persistence.canSave) {
      await persistResolverRegistryArtifacts(registry).catch(() => {});
    }
  } catch {
    registry = null;
  }

  return NextResponse.json({
    files,
    registeredIds,
    resolvers,
    canUpload: persistence.canSave,
    registry,
  });
}

export { GET };
