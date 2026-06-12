/**
 * POST /api/workspace/sandbox-agent-auth/login
 *
 * Spawns the catalog-declared login subcommand for a sandbox row whose
 * adapter is `local-agent-host`. The actual subcommand (e.g.
 * `claude auth login`) is read from `lib/sandbox-agent-host-catalog.js` —
 * this route is host-agnostic.
 *
 * Hosts without a documented login subcommand return 400 with
 * `code: "SANDBOX_AGENT_AUTH_LOGIN_UNSUPPORTED"` so the UI can render the
 * host's `notes` string ("sign in via the host CLI directly").
 *
 * Captures stdout, stderr, login URL (if printed), exit code. Token-shaped
 * output is redacted before crossing the response boundary. Raw tokens are
 * NEVER written to `growthub.config.json`.
 *
 * Request body:
 *   { objectId: string, name: string, agentHost?: string }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     status: "active" | "reachable" | "stale" | "missing" | "unknown",
 *     provider: string,
 *     label: string,
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
import { runAgentLogin } from "@/lib/sandbox-agent-auth";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const agentHost = typeof body?.agentHost === "string" ? body.agentHost.trim() : "";
  if (!objectId || !name) {
    return NextResponse.json(
      { ok: false, error: "objectId and name are required" },
      { status: 400 }
    );
  }

  try {
    const result = await runAgentLogin({ objectId, name, agentHost });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Agent login failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
