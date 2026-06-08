import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { buildEnvKeyCatalog } from "@/lib/workspace-env-catalog";

/**
 * GET /api/workspace/env-key-catalog
 *
 * Returns merged env-ref slugs from config integrations[], in-use authRefs,
 * and process.env discovery. Values are never included — only
 * `{ endpointRef, source, configured }`.
 */
async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const catalog = buildEnvKeyCatalog(workspaceConfig);
  return NextResponse.json({
    ok: true,
    ...catalog
  });
}

export { GET };
