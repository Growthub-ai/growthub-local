import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { buildEnvKeyCatalog } from "@/lib/env-key-catalog";

/**
 * GET /api/workspace/env-key-catalog
 *
 * Returns name-only env ref slugs merged from integrations[], in-use authRef/envRefs,
 * and process.env discovery. Never exposes secret values.
 */
async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const catalog = buildEnvKeyCatalog(workspaceConfig);
  return NextResponse.json({
    ok: true,
    ...catalog,
  });
}

export { GET };
