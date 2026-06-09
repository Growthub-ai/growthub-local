import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { buildCreationProposalBundle } from "@/lib/workspace-creation-proposals";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const draft = body?.draft && typeof body.draft === "object" ? body.draft : body;
  const workspaceConfig = await readWorkspaceConfig();
  const bundle = buildCreationProposalBundle(draft, workspaceConfig, process.env);
  return NextResponse.json(bundle);
}

export { POST };
