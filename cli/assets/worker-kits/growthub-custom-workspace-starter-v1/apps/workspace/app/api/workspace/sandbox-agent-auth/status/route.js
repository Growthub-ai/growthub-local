/**
 * POST /api/workspace/sandbox-agent-auth/status
 *
 * Probes the local Claude CLI for a sandbox row whose adapter is
 * `local-agent-host` + agentHost `claude_local`. Returns one of:
 *
 *   - "active"   `claude --version` exits 0 (CLI reachable; auth verified at
 *                next sandbox-run)
 *   - "stale"    CLI reachable but auth-looking error in output
 *   - "missing"  binary not on PATH
 *   - "unknown"  reachable but indeterminate
 *
 * Side effect: stamps `agentAuthStatus` + sibling fields onto the row so the
 * Data Model record drawer surfaces the result without a follow-up load.
 *
 * Request body:
 *   { objectId: string, name: string }
 *
 * Response (success):
 *   {
 *     ok: boolean,
 *     status: "active" | "stale" | "missing" | "unknown",
 *     binary: string,
 *     cwd: string,
 *     exitCode: number | null,
 *     stdout: string,
 *     stderr: string,
 *     message: string,
 *     checkedAt: string
 *   }
 *
 * Authority contract: raw Claude tokens never leave the local CLI's own
 * on-disk state. This route returns only stdout/stderr (redacted) and a
 * coarse status pill — never secret material.
 */

import { NextResponse } from "next/server";
import { checkClaudeStatus } from "@/lib/sandbox-agent-auth";

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
    const result = await checkClaudeStatus({ objectId, name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Claude auth status check failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
