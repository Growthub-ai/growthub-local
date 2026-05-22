/**
 * POST /api/workspace/sandbox-agent-auth/logout
 *
 * Spawns the catalog-declared logout subcommand for a sandbox row whose
 * adapter is `local-agent-host`. Host-agnostic; the actual subcommand is
 * read from `lib/sandbox-agent-host-catalog.js`.
 *
 * Hosts without a documented logout subcommand return 400 with
 * `code: "SANDBOX_AGENT_AUTH_LOGOUT_UNSUPPORTED"` so the UI can render the
 * host's `notes` string.
 *
 * Request body:
 *   { objectId: string, name: string }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     status: "stale" | "missing" | "unknown",
 *     provider: string,
 *     label: string,
 *     binary: string,
 *     cwd: string,
 *     exitCode: number | null,
 *     durationMs: number,
 *     stdout: string,
 *     stderr: string,
 *     message: string,
 *     checkedAt: string
 *   }
 */

import { NextResponse } from "next/server";
import { runAgentLogout } from "@/lib/sandbox-agent-auth";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!objectId || !name) {
    return NextResponse.json(
      { ok: false, error: "objectId and name are required" },
      { status: 400 }
    );
  }

  try {
    const result = await runAgentLogout({ objectId, name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Agent logout failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
