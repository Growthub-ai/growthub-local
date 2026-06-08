/**
 * GET /api/workspace/env-key-catalog
 *
 * Roadmap Phase 1.1. Name-only catalog of the workspace env-key surface:
 * config integrations[] slugs, slugs referenced by api-registry/sandbox rows,
 * and operator-authored keys discovered in the runtime environment
 * (e.g. `.env.local`). Each entry reports a `configured` boolean resolved
 * server-side with the same candidate expansion the execution routes use.
 *
 * This route NEVER returns a secret value — only slugs + booleans. It is the
 * single source the sandbox-environment drawer and API Registry authRef picker
 * consume so local `.env.local` keys stop being invisible in the UI.
 *
 * Response:
 *   {
 *     kind: "growthub-env-key-catalog-v1",
 *     entries: [{ slug, source: "config"|"reference"|"env", configured, kinds, inUse }],
 *     summary: { total, configured, missing },
 *     persistence: PersistenceMode,   // can Settings write .env.local here?
 *     canWriteEnv: boolean
 *   }
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, describePersistenceMode } from "@/lib/workspace-config";
import { buildEnvKeyCatalog } from "@/lib/workspace-env-catalog";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const catalog = buildEnvKeyCatalog(workspaceConfig, process.env);
  const persistence = describePersistenceMode();
  return NextResponse.json({
    ...catalog,
    persistence,
    canWriteEnv: persistence.canSave === true,
  });
}

export { GET };
