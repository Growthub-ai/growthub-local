import { NextResponse } from "next/server";
import { listLocalCodexSites } from "@/lib/codex-sites-local-state";

async function GET() {
  const sites = await listLocalCodexSites();
  return NextResponse.json({
    ok: true,
    source: "codex-local-session-state",
    sites
  });
}

export { GET };
