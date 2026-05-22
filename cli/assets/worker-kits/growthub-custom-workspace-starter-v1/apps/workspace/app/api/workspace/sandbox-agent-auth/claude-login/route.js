/**
 * POST /api/workspace/sandbox-agent-auth/claude-login
 *
 * Spawns `claude auth login` for a sandbox row whose adapter is
 * `local-agent-host` + agentHost `claude_local`. Mirrors the upstream
 * Paperclip server route in `server/src/routes/agents.ts` so the local
 * workspace starter behaves the same way operators are already familiar with
 * for Claude Code agents.
 *
 * Captures stdout, stderr, the login URL (if Claude prints one), and the
 * exit code. Token-shaped output is redacted before returning to the browser.
 *
 * Side effect: stamps `agentAuthStatus` + sibling metadata fields onto the
 * sandbox row. Raw tokens are NEVER written to `growthub.config.json`.
 *
 * Request body:
 *   { objectId: string, name: string }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     status: "active" | "stale" | "missing" | "unknown",
 *     binary: string,
 *     cwd: string,
 *     exitCode: number | null,
 *     timedOut: boolean,
 *     durationMs: number,
 *     stdout: string,
 *     stderr: string,
 *     loginUrl: string | null,
 *     message: string,
 *     checkedAt: string
 *   }
 */

import { NextResponse } from "next/server";
import { runClaudeLogin } from "@/lib/sandbox-agent-auth";

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
    const result = await runClaudeLogin({ objectId, name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Claude login failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
