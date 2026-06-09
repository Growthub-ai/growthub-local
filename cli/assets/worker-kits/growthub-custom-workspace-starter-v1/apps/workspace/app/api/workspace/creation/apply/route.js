import { NextResponse } from "next/server";
import { describePersistenceMode } from "@/lib/workspace-config";
import { applyCreationProposals } from "@/lib/workspace-creation-apply";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const proposals = Array.isArray(body?.proposals) ? body.proposals : [];
  if (!proposals.length) {
    return NextResponse.json({ error: "proposals[] is required" }, { status: 400 });
  }
  const persistence = describePersistenceMode();
  const needsFileWrite = proposals.some((p) => p?.type === "creation.resolver-file");
  if (needsFileWrite && !persistence.canSave) {
    return NextResponse.json({
      error: "resolver apply requires a writable filesystem runtime",
      guidance: persistence.guidance,
    }, { status: 409 });
  }
  try {
    const result = await applyCreationProposals(proposals, { dryRun: body?.dryRun === true });
    return NextResponse.json(result, { status: body?.dryRun ? 200 : 201 });
  } catch (error) {
    const status = error?.code === "WORKSPACE_PERSISTENCE_READ_ONLY" || error?.code === "RESOLVER_PATH_REFUSED"
      ? 409
      : 500;
    return NextResponse.json({
      error: error?.message || "apply failed",
      code: error?.code || "CREATION_APPLY_FAILED",
      guidance: error?.guidance || null,
    }, { status });
  }
}

export { POST };
