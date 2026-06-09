/**
 * GET /api/workspace/activation
 *
 * Composes the full derived workspace state (activation + lenses), including the
 * api-setup lens, with the SERVER-ONLY truth the browser cannot see safely:
 *   - env catalog (slug + configured booleans, resolved from process.env)
 *   - the registered resolver ids (filesystem drop-zone + config-driven)
 *
 * This is the activation truth surface every screen reads. It never returns a
 * secret value — only slugs, booleans, and derived readiness.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { deriveWorkspaceState } from "@/lib/workspace-activation";
import { buildEnvKeyCatalog } from "@/lib/workspace-env-catalog";
import { loadAllResolvers } from "@/lib/adapters/integrations/resolver-loader";
import { describeRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }

  const envCatalog = buildEnvKeyCatalog(workspaceConfig, process.env);

  let resolvers = [];
  try {
    await loadAllResolvers();
    resolvers = describeRegisteredResolvers().map((r) => r.integrationId);
  } catch {
    resolvers = [];
  }

  const state = deriveWorkspaceState({
    workspaceConfig,
    workspaceSourceRecords,
    envCatalog,
    resolvers,
  });

  return NextResponse.json(state);
}

export { GET };
