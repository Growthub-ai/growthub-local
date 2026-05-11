/**
 * GET /api/workspace/resolvers
 *
 * Lists resolver files present in lib/adapters/integrations/resolvers/ and
 * which integrationIds are registered in the source-resolver-registry after
 * loading them. Used by the no-code Resolver management panel.
 *
 * Response:
 *   { files: string[], registeredIds: string[], canUpload: boolean }
 */

import { NextResponse } from "next/server";
import { loadAllResolvers, listResolverFiles } from "@/lib/adapters/integrations/resolver-loader";
import { listRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";
import { describePersistenceMode } from "@/lib/workspace-config";

async function GET() {
  await loadAllResolvers();
  const files = await listResolverFiles();
  const registeredIds = listRegisteredResolvers();
  const persistence = describePersistenceMode();
  return NextResponse.json({
    files,
    registeredIds,
    canUpload: persistence.canSave
  });
}

export { GET };
