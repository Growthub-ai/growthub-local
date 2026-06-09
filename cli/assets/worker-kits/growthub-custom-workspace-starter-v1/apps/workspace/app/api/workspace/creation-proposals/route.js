/**
 * POST /api/workspace/creation-proposals
 *
 * Build governed creation proposal bundles from Register API wizard drafts.
 * Propose-only — no mutations. Apply via POST .../creation-proposals/apply.
 *
 * Request: { draft: RegisterApiDraft }
 * Response: { ok, bundle, summary, warnings }
 */

import { NextResponse } from "next/server";
import { buildCreationProposalBundle } from "@/lib/workspace-creation-proposals";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const draft = body?.draft && typeof body.draft === "object" ? body.draft : body;
  const bundle = buildCreationProposalBundle(draft, { env: process.env });
  return NextResponse.json({
    ok: bundle.validation.ok,
    bundle,
    summary: bundle.businessGoal || "Creation proposal bundle",
    warnings: [...(bundle.validation.warnings || []), ...(bundle.risks || [])],
    proposals: bundle.proposals,
  });
}

export { POST };
