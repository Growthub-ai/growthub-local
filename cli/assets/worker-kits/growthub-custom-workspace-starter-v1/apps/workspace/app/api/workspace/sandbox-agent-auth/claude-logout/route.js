/**
 * POST /api/workspace/sandbox-agent-auth/claude-logout
 *
 * Spawns `claude auth logout` for a sandbox row whose adapter is
 * `local-agent-host` + agentHost `claude_local`. Mirrors the upstream
 * Paperclip server route in `server/src/routes/agents.ts`.
 *
 * Side effect: stamps `agentAuthStatus = "stale"` (or "missing" if the
 * binary isn't on PATH) plus sibling metadata fields onto the row.
 *
 * Request body:
 *   { objectId: string, name: string }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     status: "stale" | "missing",
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
import { runClaudeLogout } from "@/lib/sandbox-agent-auth";

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
    const result = await runClaudeLogout({ objectId, name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Claude logout failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
