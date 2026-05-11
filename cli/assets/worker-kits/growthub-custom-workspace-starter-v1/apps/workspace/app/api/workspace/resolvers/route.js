/**
 * GET /api/workspace/resolvers
 *
 * Lists resolver files present in lib/adapters/integrations/resolvers/ and
 * returns provider-agnostic metadata for each registered resolver.
 * Used by the generic resolver management panel and ResolverControlPanel in the
 * widget inspector. No provider names appear in the response shape.
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
 *     canUpload: boolean
 *   }
 */

import { NextResponse } from "next/server";
import { loadAllResolvers, listResolverFiles } from "@/lib/adapters/integrations/resolver-loader";
import { describeRegisteredResolvers } from "@/lib/adapters/integrations/source-resolver-registry";
import { describePersistenceMode } from "@/lib/workspace-config";

async function GET() {
  await loadAllResolvers();
  const files = await listResolverFiles();
  const resolvers = describeRegisteredResolvers();
  const persistence = describePersistenceMode();
  return NextResponse.json({
    files,
    registeredIds: resolvers.map((r) => r.integrationId),
    resolvers,
    canUpload: persistence.canSave
  });
}

export { GET };
