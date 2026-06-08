import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { buildEnvKeyCatalog } from "@/lib/env-key-catalog";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const catalog = buildEnvKeyCatalog(workspaceConfig);
  return NextResponse.json({
    kind: "growthub-env-key-catalog-v1",
    refs: catalog.refs
  });
}

export { GET };
