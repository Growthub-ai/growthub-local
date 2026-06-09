/**
 * POST /api/workspace/creation-proposals/build
 *
 * Normalized governed creation bundle from Register API wizard / helper intent.
 * Propose-only — no mutations.
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
  const bundle = buildCreationProposalBundle(draft, process.env);
  return NextResponse.json({ ok: true, bundle });
}

export { POST };
